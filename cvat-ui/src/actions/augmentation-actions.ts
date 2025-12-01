// Copyright (C) 2025 CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { ActionUnion, createAction, ThunkAction } from 'utils/redux';
import { ProjectOrTaskOrJob, getCore } from 'cvat-core-wrapper';
import { getInstanceType } from './common';

export enum AugmentationActionTypes {
    OPEN_AUGMENT_MODAL = 'OPEN_AUGMENT_MODAL',
    CLOSE_AUGMENT_MODAL = 'CLOSE_AUGMENT_MODAL',
    AUGMENT_DATASET = 'AUGMENT_DATASET',
    AUGMENT_DATASET_SUCCESS = 'AUGMENT_DATASET_SUCCESS',
    AUGMENT_DATASET_FAILED = 'AUGMENT_DATASET_FAILED',
    FETCH_AUGMENTATION_STATS = 'FETCH_AUGMENTATION_STATS',
    FETCH_AUGMENTATION_STATS_SUCCESS = 'FETCH_AUGMENTATION_STATS_SUCCESS',
    FETCH_AUGMENTATION_STATS_FAILED = 'FETCH_AUGMENTATION_STATS_FAILED',
    DELETE_AUGMENTED_DATASET = 'DELETE_AUGMENTED_DATASET',
    DELETE_AUGMENTED_DATASET_SUCCESS = 'DELETE_AUGMENTED_DATASET_SUCCESS',
    DELETE_AUGMENTED_DATASET_FAILED = 'DELETE_AUGMENTED_DATASET_FAILED',
}

const core = getCore();

export interface AugmentationConfig {
    type: string;
    params?: Record<string, any>;
}

export interface AugmentedDataset {
    id: string;
    source: {
        type: string;
        id: number;
        name: string;
    };
    created_at: string;
    status: string;
    user_id: number;
    stats?: {
        original_images: number;
        augmented_images: number;
        copies_per_image: number;
        total_size_bytes: number;
    };
    augmentations?: AugmentationConfig[];
    distribution?: Record<string, number>;
    filename?: string;
    error?: string;
}

export const augmentationActions = {
    openAugmentModal: (instances: ProjectOrTaskOrJob[]) => (
        createAction(AugmentationActionTypes.OPEN_AUGMENT_MODAL, { instances })
    ),
    closeAugmentModal: () => (
        createAction(AugmentationActionTypes.CLOSE_AUGMENT_MODAL)
    ),
    augmentDatasetSuccess: (
        instance: ProjectOrTaskOrJob,
        instanceType: 'project' | 'task',
        rqId: string,
    ) => (
        createAction(AugmentationActionTypes.AUGMENT_DATASET_SUCCESS, {
            instance,
            instanceType,
            rqId,
        })
    ),
    augmentDatasetFailed: (
        instance: ProjectOrTaskOrJob,
        instanceType: 'project' | 'task',
        error: any,
    ) => (
        createAction(AugmentationActionTypes.AUGMENT_DATASET_FAILED, {
            instance,
            instanceType,
            error,
        })
    ),
    fetchAugmentationStatsSuccess: (datasets: AugmentedDataset[]) => (
        createAction(AugmentationActionTypes.FETCH_AUGMENTATION_STATS_SUCCESS, { datasets })
    ),
    fetchAugmentationStatsFailed: (error: any) => (
        createAction(AugmentationActionTypes.FETCH_AUGMENTATION_STATS_FAILED, { error })
    ),
    deleteAugmentedDatasetSuccess: (id: string) => (
        createAction(AugmentationActionTypes.DELETE_AUGMENTED_DATASET_SUCCESS, { id })
    ),
    deleteAugmentedDatasetFailed: (id: string, error: any) => (
        createAction(AugmentationActionTypes.DELETE_AUGMENTED_DATASET_FAILED, { id, error })
    ),
};

/**
 * Create augmentation job for a task or project
 */
export const augmentDatasetAsync = (
    instance: ProjectOrTaskOrJob,
    augmentations: AugmentationConfig[],
    copiesPerImage: number,
    filename?: string,
): ThunkAction => async (dispatch) => {
    const instanceType = getInstanceType(instance);

    // Only support tasks and projects (not jobs)
    if (instanceType === 'job') {
        throw new Error('Augmentation is not supported for jobs');
    }

    try {
        dispatch(createAction(AugmentationActionTypes.AUGMENT_DATASET, {
            instance,
            instanceType,
        }));

        const rqId = await core.server.augmentation.createAugmentation(
            instanceType,
            instance.id,
            augmentations,
            copiesPerImage,
            filename,
        );

        dispatch(augmentationActions.augmentDatasetSuccess(
            instance,
            instanceType as 'project' | 'task',
            rqId,
        ));

        return rqId;
    } catch (error) {
        dispatch(augmentationActions.augmentDatasetFailed(
            instance,
            instanceType as 'project' | 'task',
            error,
        ));
        throw error;
    }
};

/**
 * Fetch all augmentation stats for current user
 */
export const fetchAugmentationStatsAsync = (
    taskId?: number,
    projectId?: number,
): ThunkAction => async (dispatch) => {
    try {
        dispatch(createAction(AugmentationActionTypes.FETCH_AUGMENTATION_STATS));

        const datasets = await core.server.augmentation.listAugmentations(taskId, projectId);

        dispatch(augmentationActions.fetchAugmentationStatsSuccess(datasets));
    } catch (error) {
        dispatch(augmentationActions.fetchAugmentationStatsFailed(error));
        throw error;
    }
};

/**
 * Delete an augmented dataset
 */
export const deleteAugmentedDatasetAsync = (
    id: string,
): ThunkAction => async (dispatch) => {
    try {
        dispatch(createAction(AugmentationActionTypes.DELETE_AUGMENTED_DATASET, { id }));

        await core.server.augmentation.deleteAugmentation(id);

        dispatch(augmentationActions.deleteAugmentedDatasetSuccess(id));

        // Refresh stats after deletion
        dispatch(fetchAugmentationStatsAsync());
    } catch (error) {
        dispatch(augmentationActions.deleteAugmentedDatasetFailed(id, error));
        throw error;
    }
};

/**
 * Download an augmented dataset
 */
export const downloadAugmentedDatasetAsync = (
    id: string,
): ThunkAction => async () => {
    try {
        await core.server.augmentation.downloadAugmentation(id);
    } catch (error) {
        throw error;
    }
};

export type AugmentationActions = ActionUnion<typeof augmentationActions>;
