# Copyright (C) 2025 CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

"""Background job processing for data augmentation using RQ."""

import os
import cv2
import zipfile
import numpy as np
from dataclasses import dataclass
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime

from django.conf import settings
from rest_framework import serializers
from rest_framework.reverse import reverse

from cvat.apps.engine.models import (
    Project,
    Task,
    RequestAction,
    RequestTarget,
)
from cvat.apps.engine.rq import ExportRequestId
from cvat.apps.engine.log import ServerLogManager
from cvat.apps.redis_handler.background import AbstractExporter
from cvat.apps.engine.frame_provider import FrameProvider

from .processors import AugmentationProcessor
from . import utils

slogger = ServerLogManager(__name__)


class DataAugmenter(AbstractExporter):
    """Handles data augmentation export requests."""

    SUPPORTED_TARGETS = {RequestTarget.PROJECT, RequestTarget.TASK}

    @dataclass
    class ExportArgs(AbstractExporter.ExportArgs):
        augmentations: List[Dict[str, Any]]
        copies_per_image: int

    def init_request_args(self) -> None:
        super().init_request_args()

        augmentations = self.request.data.get("augmentations", [])
        copies_per_image = int(self.request.data.get("copies_per_image", 1))

        self.export_args: DataAugmenter.ExportArgs = self.ExportArgs(
            **self.export_args.to_dict(),
            augmentations=augmentations,
            copies_per_image=copies_per_image,
        )

    def validate_request(self):
        super().validate_request()

        if not self.export_args.augmentations:
            raise serializers.ValidationError("No augmentations specified")

        max_copies = getattr(settings, 'AUGMENTATION_MAX_COPIES', 10)
        if self.export_args.copies_per_image < 1 or self.export_args.copies_per_image > max_copies:
            raise serializers.ValidationError(
                f"copies_per_image must be between 1 and {max_copies}"
            )

        # Validate augmentation types
        valid_types = AugmentationProcessor.TRANSFORM_MAP.keys()
        for aug in self.export_args.augmentations:
            if aug.get('type') not in valid_types:
                raise serializers.ValidationError(
                    f"Invalid augmentation type: {aug.get('type')}"
                )

    def build_request_id(self):
        # Generate unique augmentation ID
        aug_id = utils.generate_augmentation_id(
            self.target,
            self.db_instance.pk
        )

        return ExportRequestId(
            action=RequestAction.EXPORT,
            target=RequestTarget(self.target),
            target_id=self.db_instance.pk,
            user_id=self.user_id,
            format=aug_id,  # Use aug_id as format field
        ).render()

    def validate_request_id(self, request_id, /) -> None:
        parsed_request_id: ExportRequestId = ExportRequestId.parse_and_validate_queue(
            request_id, expected_queue=self.QUEUE_NAME, try_legacy_format=True
        )

        if (
            parsed_request_id.action != RequestAction.EXPORT
            or parsed_request_id.target != RequestTarget(self.target)
            or parsed_request_id.target_id != self.db_instance.pk
        ):
            raise ValueError(
                "The provided request id does not match augmentation target"
            )

    def _init_callback_with_params(self):
        self.callback = augment_dataset

        # Extract augmentation ID from request_id
        parsed_request_id: ExportRequestId = ExportRequestId.parse_and_validate_queue(
            self.request_id, expected_queue=self.QUEUE_NAME, try_legacy_format=True
        )
        aug_id = parsed_request_id.format  # We stored aug_id in format field

        self.callback_args = (
            self.db_instance.pk,
            self.target,
            self.export_args.augmentations,
            self.export_args.copies_per_image,
            aug_id,
            self.user_id,
        )

    def get_result_filename(self) -> str:
        filename = self.export_args.filename

        if not filename:
            # Extract augmentation ID from request
            parsed_request_id: ExportRequestId = ExportRequestId.parse_and_validate_queue(
                self.request_id, expected_queue=self.QUEUE_NAME, try_legacy_format=True
            )
            aug_id = parsed_request_id.format
            filename = f"augmented_dataset_{aug_id}.zip"

        return filename

    def get_result_endpoint_url(self) -> str:
        # We'll create a custom download endpoint
        return reverse(
            "augmentation-download",
            args=[self.db_instance.pk],
            request=self.request
        )


def augment_dataset(
    instance_id: int,
    instance_type: str,
    augmentations: List[Dict[str, Any]],
    copies_per_image: int,
    aug_id: str,
    user_id: int,
) -> str:
    """
    Main augmentation function executed by RQ worker.

    Args:
        instance_id: Task or Project ID
        instance_type: 'task' or 'project'
        augmentations: List of augmentation configurations
        copies_per_image: Number of augmented copies per image
        aug_id: Augmentation ID for storage
        user_id: User ID who initiated the augmentation

    Returns:
        Path to the created zip file
    """
    slogger.glob.info(f"Starting augmentation {aug_id} for {instance_type} {instance_id}")

    try:
        # Load instance
        if instance_type == 'task':
            instance = Task.objects.get(pk=instance_id)
            tasks = [instance]
        else:  # project
            instance = Project.objects.get(pk=instance_id)
            tasks = Task.objects.filter(project=instance)

        # Create output directory
        aug_path = utils.get_augmentation_path(aug_id)
        images_dir = aug_path / 'images'
        images_dir.mkdir(parents=True, exist_ok=True)

        # Initialize processor
        processor = AugmentationProcessor(augmentations)

        # Statistics
        original_count = 0
        augmented_count = 0
        distribution = {aug['type']: 0 for aug in augmentations}

        # Process each task
        for task in tasks:
            if not task.data:
                continue

            # Get frame provider
            frame_provider = FrameProvider(task.data)

            for frame_id in range(task.data.size):
                try:
                    # Load frame
                    frame_data = frame_provider.get_frame(frame_id)
                    frame = cv2.imdecode(
                        np.frombuffer(frame_data[0].getvalue(), dtype=np.uint8),
                        cv2.IMREAD_COLOR
                    )

                    if frame is None:
                        slogger.glob.warning(f"Failed to load frame {frame_id} from task {task.pk}")
                        continue

                    original_count += 1

                    # Generate augmented images
                    augmented_frames = processor.augment_image(frame, copies_per_image)

                    # Save augmented images
                    for idx, aug_frame in enumerate(augmented_frames):
                        output_filename = f"task_{task.pk}_frame_{frame_id:06d}_aug_{idx}.jpg"
                        output_path = images_dir / output_filename

                        cv2.imwrite(str(output_path), aug_frame)
                        augmented_count += 1

                        # Update distribution (count each augmentation type)
                        for aug in augmentations:
                            distribution[aug['type']] += 1

                except Exception as e:
                    slogger.glob.error(f"Error processing frame {frame_id} from task {task.pk}: {e}")
                    continue

        # Create metadata
        metadata = {
            'id': aug_id,
            'source': {
                'type': instance_type,
                'id': instance_id,
                'name': instance.name,
            },
            'created_at': datetime.now().isoformat() + 'Z',
            'status': 'completed',
            'user_id': user_id,
            'stats': {
                'original_images': original_count,
                'augmented_images': augmented_count,
                'copies_per_image': copies_per_image,
                'total_size_bytes': utils.get_directory_size(images_dir),
            },
            'augmentations': processor.get_augmentation_summary(),
            'distribution': distribution,
        }

        # Save metadata
        utils.save_metadata(aug_id, metadata)

        # Create zip archive
        zip_path = aug_path / f"augmented_dataset_{aug_id}.zip"
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # Add all images
            for img_file in images_dir.rglob('*'):
                if img_file.is_file():
                    arcname = img_file.relative_to(aug_path)
                    zipf.write(img_file, arcname)

            # Add metadata
            metadata_path = aug_path / 'metadata.json'
            zipf.write(metadata_path, 'metadata.json')

        slogger.glob.info(
            f"Augmentation {aug_id} completed: {original_count} -> {augmented_count} images"
        )

        return str(zip_path)

    except Exception as e:
        slogger.glob.error(f"Augmentation {aug_id} failed: {e}")

        # Update metadata with error status
        error_metadata = {
            'id': aug_id,
            'source': {
                'type': instance_type,
                'id': instance_id,
            },
            'created_at': datetime.now().isoformat() + 'Z',
            'status': 'failed',
            'error': str(e),
        }
        utils.save_metadata(aug_id, error_metadata)
        raise
