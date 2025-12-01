# Copyright (C) 2025 CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

"""URL configuration for data augmentation API."""

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=False)
router.register('augmentation', views.AugmentationViewSet, basename='augmentation')

urlpatterns = [
    path('', include(router.urls)),
]
