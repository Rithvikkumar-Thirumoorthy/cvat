# Copyright (C) 2025 CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

"""Utility functions for data augmentation storage and metadata management."""

import json
import shutil
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


def get_augmentation_base_path() -> Path:
    """Get base storage path for augmented datasets."""
    base_path = Path(getattr(
        settings,
        'AUGMENTATION_STORAGE_PATH',
        '/cvat-data/augmented_datasets'
    ))
    base_path.mkdir(parents=True, exist_ok=True)
    return base_path


def get_augmentation_path(aug_id: str) -> Path:
    """
    Get storage path for specific augmentation.

    Args:
        aug_id: Augmentation ID

    Returns:
        Path to augmentation directory
    """
    base = get_augmentation_base_path()
    aug_path = base / aug_id
    aug_path.mkdir(parents=True, exist_ok=True)
    return aug_path


def generate_augmentation_id(instance_type: str, instance_id: int) -> str:
    """
    Generate unique augmentation ID.

    Args:
        instance_type: 'task' or 'project'
        instance_id: Task or project ID

    Returns:
        Augmentation ID string
    """
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    return f"{instance_type}_{instance_id}_{timestamp}"


def save_metadata(aug_id: str, metadata: Dict[str, Any]) -> None:
    """
    Save metadata to JSON file.

    Args:
        aug_id: Augmentation ID
        metadata: Metadata dictionary
    """
    aug_path = get_augmentation_path(aug_id)
    metadata_file = aug_path / 'metadata.json'

    with open(metadata_file, 'w') as f:
        json.dump(metadata, f, indent=2)

    logger.info(f"Saved metadata for augmentation {aug_id}")


def load_metadata(aug_id: str) -> Optional[Dict[str, Any]]:
    """
    Load metadata from JSON file.

    Args:
        aug_id: Augmentation ID

    Returns:
        Metadata dictionary or None if not found
    """
    aug_path = get_augmentation_path(aug_id)
    metadata_file = aug_path / 'metadata.json'

    if not metadata_file.exists():
        logger.warning(f"Metadata file not found for augmentation {aug_id}")
        return None

    with open(metadata_file, 'r') as f:
        return json.load(f)


def list_all_augmentations() -> list[Dict[str, Any]]:
    """
    List all augmented datasets.

    Returns:
        List of metadata dictionaries
    """
    base_path = get_augmentation_base_path()
    augmentations = []

    if not base_path.exists():
        return augmentations

    for aug_dir in base_path.iterdir():
        if aug_dir.is_dir():
            metadata = load_metadata(aug_dir.name)
            if metadata:
                augmentations.append(metadata)

    # Sort by creation time (newest first)
    augmentations.sort(
        key=lambda x: x.get('created_at', ''),
        reverse=True
    )

    return augmentations


def delete_augmentation(aug_id: str) -> bool:
    """
    Delete augmented dataset.

    Args:
        aug_id: Augmentation ID

    Returns:
        True if deleted successfully, False otherwise
    """
    aug_path = get_augmentation_path(aug_id)

    if not aug_path.exists():
        logger.warning(f"Augmentation path not found: {aug_id}")
        return False

    try:
        shutil.rmtree(aug_path)
        logger.info(f"Deleted augmentation {aug_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to delete augmentation {aug_id}: {e}")
        return False


def cleanup_old_datasets(ttl_days: Optional[int] = None) -> int:
    """
    Delete datasets older than TTL.

    Args:
        ttl_days: Time to live in days (default from settings)

    Returns:
        Number of datasets deleted
    """
    if ttl_days is None:
        ttl_days = getattr(settings, 'AUGMENTATION_TTL_DAYS', 7)

    cutoff_date = datetime.now() - timedelta(days=ttl_days)
    deleted_count = 0

    augmentations = list_all_augmentations()

    for aug in augmentations:
        created_at_str = aug.get('created_at')
        if not created_at_str:
            continue

        try:
            created_at = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
            if created_at < cutoff_date:
                aug_id = aug.get('id')
                if aug_id and delete_augmentation(aug_id):
                    deleted_count += 1
        except Exception as e:
            logger.error(f"Error processing augmentation cleanup: {e}")
            continue

    logger.info(f"Cleaned up {deleted_count} old augmented datasets")
    return deleted_count


def get_augmentation_zip_path(aug_id: str) -> Optional[Path]:
    """
    Get path to augmented dataset zip file.

    Args:
        aug_id: Augmentation ID

    Returns:
        Path to zip file or None if not found
    """
    aug_path = get_augmentation_path(aug_id)
    zip_files = list(aug_path.glob('*.zip'))

    if zip_files:
        return zip_files[0]

    return None


def get_directory_size(path: Path) -> int:
    """
    Calculate total size of directory in bytes.

    Args:
        path: Directory path

    Returns:
        Size in bytes
    """
    total_size = 0
    for item in path.rglob('*'):
        if item.is_file():
            total_size += item.stat().st_size
    return total_size
