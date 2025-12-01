# Copyright (C) 2025 CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

"""API views for data augmentation."""

from pathlib import Path
from django.http import FileResponse, Http404
from django.conf import settings
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from cvat.apps.engine.models import Task, Project
from cvat.apps.engine.permissions import TaskPermission, ProjectPermission

from .background import DataAugmenter
from .serializers import (
    CreateAugmentationSerializer,
    AugmentationStatsSerializer,
)
from . import utils


class AugmentationViewSet(viewsets.ViewSet):
    """ViewSet for data augmentation operations."""

    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['POST'], url_path='datasets')
    def create_augmentation(self, request):
        """
        Create augmentation job for tasks or projects.

        POST /api/augmentation/datasets
        Body: {
            "task_ids": [1, 2],  // or "project_ids": [1]
            "augmentations": [
                {"type": "flip", "params": {}},
                {"type": "brightness_contrast", "params": {"brightness_limit": 0.2}}
            ],
            "copies_per_image": 3,
            "filename": "augmented_{id}_{timestamp}"  // optional
        }

        Returns: {"rq_id": "..."}
        """
        serializer = CreateAugmentationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        has_tasks = 'task_ids' in data and data['task_ids']

        rq_ids = []

        if has_tasks:
            # Process tasks
            for task_id in data['task_ids']:
                try:
                    task = Task.objects.get(pk=task_id)

                    # Check permissions
                    if not TaskPermission().has_object_permission(request, self, task):
                        return Response(
                            {'detail': f'No permission to access task {task_id}'},
                            status=status.HTTP_403_FORBIDDEN
                        )

                    # Create augmentation job
                    augmenter = DataAugmenter(request=request, db_instance=task)
                    augmenter.init()
                    rq_id = augmenter.enqueue_job()

                    rq_ids.append({'task_id': task_id, 'rq_id': rq_id})

                except Task.DoesNotExist:
                    return Response(
                        {'detail': f'Task {task_id} not found'},
                        status=status.HTTP_404_NOT_FOUND
                    )
                except Exception as e:
                    return Response(
                        {'detail': str(e)},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR
                    )
        else:
            # Process projects
            for project_id in data['project_ids']:
                try:
                    project = Project.objects.get(pk=project_id)

                    # Check permissions
                    if not ProjectPermission().has_object_permission(request, self, project):
                        return Response(
                            {'detail': f'No permission to access project {project_id}'},
                            status=status.HTTP_403_FORBIDDEN
                        )

                    # Create augmentation job
                    augmenter = DataAugmenter(request=request, db_instance=project)
                    augmenter.init()
                    rq_id = augmenter.enqueue_job()

                    rq_ids.append({'project_id': project_id, 'rq_id': rq_id})

                except Project.DoesNotExist:
                    return Response(
                        {'detail': f'Project {project_id} not found'},
                        status=status.HTTP_404_NOT_FOUND
                    )
                except Exception as e:
                    return Response(
                        {'detail': str(e)},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR
                    )

        # For single request, return single rq_id
        if len(rq_ids) == 1:
            return Response({'rq_id': rq_ids[0]['rq_id']}, status=status.HTTP_202_ACCEPTED)

        # For bulk requests, return list
        return Response({'results': rq_ids}, status=status.HTTP_202_ACCEPTED)

    @action(detail=False, methods=['GET'], url_path='datasets/list')
    def list_augmentations(self, request):
        """
        List all augmented datasets for current user.

        GET /api/augmentation/datasets/list?task_id=X&project_id=Y

        Returns: [
            {
                "id": "aug-task-123-20250130-143052",
                "source": {"type": "task", "id": 123, "name": "My Task"},
                "created_at": "2025-01-30T14:30:52Z",
                "status": "completed",
                ...
            }
        ]
        """
        task_id = request.query_params.get('task_id')
        project_id = request.query_params.get('project_id')

        # Get all augmentations
        augmentations = utils.list_all_augmentations()

        # Filter by user (only show user's own augmentations)
        user_augmentations = [
            aug for aug in augmentations
            if aug.get('user_id') == request.user.id
        ]

        # Filter by task_id or project_id if specified
        if task_id:
            user_augmentations = [
                aug for aug in user_augmentations
                if aug.get('source', {}).get('type') == 'task'
                and aug.get('source', {}).get('id') == int(task_id)
            ]

        if project_id:
            user_augmentations = [
                aug for aug in user_augmentations
                if aug.get('source', {}).get('type') == 'project'
                and aug.get('source', {}).get('id') == int(project_id)
            ]

        serializer = AugmentationStatsSerializer(user_augmentations, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['GET'], url_path='datasets/(?P<aug_id>[^/.]+)/stats')
    def get_stats(self, request, aug_id=None):
        """
        Get statistics for specific augmented dataset.

        GET /api/augmentation/datasets/{aug_id}/stats

        Returns: {
            "id": "aug-task-123-20250130-143052",
            "stats": {...},
            "distribution": {...}
        }
        """
        metadata = utils.load_metadata(aug_id)

        if not metadata:
            raise Http404("Augmented dataset not found")

        # Check if user owns this augmentation
        if metadata.get('user_id') != request.user.id:
            return Response(
                {'detail': 'Permission denied'},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = AugmentationStatsSerializer(metadata)
        return Response(serializer.data)

    @action(detail=False, methods=['GET'], url_path='datasets/(?P<aug_id>[^/.]+)/download')
    def download(self, request, aug_id=None):
        """
        Download augmented dataset zip file.

        GET /api/augmentation/datasets/{aug_id}/download

        Returns: File stream (application/zip)
        """
        metadata = utils.load_metadata(aug_id)

        if not metadata:
            raise Http404("Augmented dataset not found")

        # Check if user owns this augmentation
        if metadata.get('user_id') != request.user.id:
            return Response(
                {'detail': 'Permission denied'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Get zip file path
        zip_path = utils.get_augmentation_zip_path(aug_id)

        if not zip_path or not zip_path.exists():
            raise Http404("Augmented dataset file not found")

        # Stream file
        response = FileResponse(
            open(zip_path, 'rb'),
            content_type='application/zip'
        )
        response['Content-Disposition'] = f'attachment; filename="{zip_path.name}"'
        return response

    @action(detail=False, methods=['DELETE'], url_path='datasets/(?P<aug_id>[^/.]+)')
    def delete_augmentation(self, request, aug_id=None):
        """
        Delete augmented dataset.

        DELETE /api/augmentation/datasets/{aug_id}

        Returns: 204 No Content
        """
        metadata = utils.load_metadata(aug_id)

        if not metadata:
            raise Http404("Augmented dataset not found")

        # Check if user owns this augmentation
        if metadata.get('user_id') != request.user.id:
            return Response(
                {'detail': 'Permission denied'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Delete augmentation
        success = utils.delete_augmentation(aug_id)

        if success:
            return Response(status=status.HTTP_204_NO_CONTENT)
        else:
            return Response(
                {'detail': 'Failed to delete augmentation'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
