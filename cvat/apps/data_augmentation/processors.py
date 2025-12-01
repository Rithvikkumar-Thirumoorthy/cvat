# Copyright (C) 2025 CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

"""Image augmentation processor using Albumentations library."""

from typing import List, Dict, Any
import numpy as np
import albumentations as A


class AugmentationProcessor:
    """Handles image augmentation using Albumentations library."""

    # Mapping of augmentation types to Albumentations transforms
    TRANSFORM_MAP = {
        'flip': lambda p: A.Flip(p=1.0),
        'horizontal_flip': lambda p: A.HorizontalFlip(p=1.0),
        'vertical_flip': lambda p: A.VerticalFlip(p=1.0),
        'rotate': lambda p: A.Rotate(
            limit=p.get('limit', 90),
            p=1.0
        ),
        'brightness_contrast': lambda p: A.RandomBrightnessContrast(
            brightness_limit=p.get('brightness_limit', 0.2),
            contrast_limit=p.get('contrast_limit', 0.2),
            p=1.0
        ),
        'hue_saturation': lambda p: A.HueSaturationValue(
            hue_shift_limit=p.get('hue_shift_limit', 20),
            sat_shift_limit=p.get('sat_shift_limit', 30),
            val_shift_limit=p.get('val_shift_limit', 20),
            p=1.0
        ),
        'gaussian_noise': lambda p: A.GaussNoise(
            var_limit=p.get('var_limit', (10.0, 50.0)),
            p=1.0
        ),
        'blur': lambda p: A.Blur(
            blur_limit=p.get('blur_limit', 7),
            p=1.0
        ),
        'crop': lambda p: A.RandomCrop(
            height=p.get('height', 256),
            width=p.get('width', 256),
            p=1.0
        ),
        'mosaic': lambda p: A.Mosaic(p=1.0),
        'cutout': lambda p: A.CoarseDropout(
            max_holes=p.get('max_holes', 8),
            max_height=p.get('max_height', 16),
            max_width=p.get('max_width', 16),
            fill_value=p.get('fill_value', 0),
            p=1.0
        ),
    }

    def __init__(self, augmentation_configs: List[Dict[str, Any]]):
        """
        Initialize augmentation processor.

        Args:
            augmentation_configs: List of augmentation configurations
                Example: [
                    {'type': 'flip', 'params': {}},
                    {'type': 'brightness_contrast', 'params': {'brightness_limit': 0.3}}
                ]
        """
        self.configs = augmentation_configs
        self.pipelines = self._build_pipelines()

    def _build_pipelines(self) -> List[A.Compose]:
        """Build Albumentations pipelines for each augmentation."""
        pipelines = []
        for config in self.configs:
            aug_type = config['type']
            params = config.get('params', {})

            if aug_type not in self.TRANSFORM_MAP:
                raise ValueError(f"Unknown augmentation type: {aug_type}")

            transform = self.TRANSFORM_MAP[aug_type](params)
            pipelines.append(A.Compose([transform]))

        return pipelines

    def augment_image(self, image: np.ndarray, num_copies: int) -> List[np.ndarray]:
        """
        Generate augmented copies of an image.

        Args:
            image: Input image as numpy array (H, W, C)
            num_copies: Number of augmented copies to generate

        Returns:
            List of augmented images
        """
        augmented = []

        for copy_idx in range(num_copies):
            current_image = image.copy()

            # Apply each augmentation pipeline sequentially
            for pipeline in self.pipelines:
                result = pipeline(image=current_image)
                current_image = result['image']

            augmented.append(current_image)

        return augmented

    def get_augmentation_summary(self) -> List[Dict[str, Any]]:
        """Get summary of configured augmentations."""
        return [
            {
                'type': config['type'],
                'params': config.get('params', {})
            }
            for config in self.configs
        ]
