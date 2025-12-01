# Copyright (C) 2025 CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

"""Serializers for data augmentation API."""

from rest_framework import serializers


class AugmentationConfigSerializer(serializers.Serializer):
    """Serializer for single augmentation configuration."""
    type = serializers.ChoiceField(choices=[
        'flip',
        'horizontal_flip',
        'vertical_flip',
        'rotate',
        'brightness_contrast',
        'hue_saturation',
        'gaussian_noise',
        'blur',
        'crop',
        'mosaic',
        'cutout',
    ])
    params = serializers.DictField(required=False, default=dict)


class CreateAugmentationSerializer(serializers.Serializer):
    """Serializer for creating augmentation job."""
    task_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=False,
    )
    project_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=False,
    )
    augmentations = serializers.ListField(
        child=AugmentationConfigSerializer(),
        allow_empty=False,
    )
    copies_per_image = serializers.IntegerField(min_value=1, max_value=10)
    filename = serializers.CharField(required=False, allow_blank=True)

    def validate(self, data):
        # Must specify either task_ids or project_ids, but not both
        has_tasks = 'task_ids' in data and data['task_ids']
        has_projects = 'project_ids' in data and data['project_ids']

        if not has_tasks and not has_projects:
            raise serializers.ValidationError(
                "Must specify either task_ids or project_ids"
            )

        if has_tasks and has_projects:
            raise serializers.ValidationError(
                "Cannot specify both task_ids and project_ids"
            )

        return data


class AugmentationStatsSerializer(serializers.Serializer):
    """Serializer for augmentation statistics."""
    id = serializers.CharField()
    source = serializers.DictField()
    created_at = serializers.CharField()
    status = serializers.CharField()
    user_id = serializers.IntegerField()
    stats = serializers.DictField()
    augmentations = serializers.ListField()
    distribution = serializers.DictField()
    filename = serializers.CharField(required=False)
    error = serializers.CharField(required=False)
