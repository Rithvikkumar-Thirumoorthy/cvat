// Copyright (C) 2025 CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { AugmentationActions, AugmentationActionTypes, AugmentedDataset } from 'actions/augmentation-actions';
import { AuthActions, AuthActionTypes } from 'actions/auth-actions';
import { ProjectOrTaskOrJob } from 'cvat-core-wrapper';

export interface AugmentationState {
    modal: {
        visible: boolean;
        instances: ProjectOrTaskOrJob[] | null;
    };
    stats: {
        fetching: boolean;
        data: AugmentedDataset[];
    };
}

const defaultState: AugmentationState = {
    modal: {
        visible: false,
        instances: null,
    },
    stats: {
        fetching: false,
        data: [],
    },
};

export default function (
    state: AugmentationState = defaultState,
    action: AugmentationActions | AuthActions,
): AugmentationState {
    switch (action.type) {
        case AugmentationActionTypes.OPEN_AUGMENT_MODAL: {
            return {
                ...state,
                modal: {
                    visible: true,
                    instances: action.payload.instances,
                },
            };
        }
        case AugmentationActionTypes.CLOSE_AUGMENT_MODAL: {
            return {
                ...state,
                modal: {
                    visible: false,
                    instances: null,
                },
            };
        }
        case AugmentationActionTypes.FETCH_AUGMENTATION_STATS: {
            return {
                ...state,
                stats: {
                    ...state.stats,
                    fetching: true,
                },
            };
        }
        case AugmentationActionTypes.FETCH_AUGMENTATION_STATS_SUCCESS: {
            return {
                ...state,
                stats: {
                    fetching: false,
                    data: action.payload.datasets,
                },
            };
        }
        case AugmentationActionTypes.FETCH_AUGMENTATION_STATS_FAILED: {
            return {
                ...state,
                stats: {
                    ...state.stats,
                    fetching: false,
                },
            };
        }
        case AugmentationActionTypes.DELETE_AUGMENTED_DATASET_SUCCESS: {
            return {
                ...state,
                stats: {
                    ...state.stats,
                    data: state.stats.data.filter((dataset) => dataset.id !== action.payload.id),
                },
            };
        }
        case AuthActionTypes.LOGOUT_SUCCESS: {
            return { ...defaultState };
        }
        default:
            return state;
    }
}
