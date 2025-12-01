// Copyright (C) 2025 CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { useHistory } from 'react-router';
import Modal from 'antd/lib/modal';
import Notification from 'antd/lib/notification';
import Text from 'antd/lib/typography/Text';
import Form from 'antd/lib/form';
import Input from 'antd/lib/input';
import Slider from 'antd/lib/slider';
import Checkbox from 'antd/lib/checkbox';
import Collapse from 'antd/lib/collapse';
import Space from 'antd/lib/space';
import InputNumber from 'antd/lib/input-number';
import CVATMarkdown from 'components/common/cvat-markdown';
import { CombinedState } from 'reducers';
import { augmentationActions, augmentDatasetAsync, AugmentationConfig } from 'actions/augmentation-actions';
import { makeBulkOperationAsync } from 'actions/bulk-actions';
import { ProjectOrTaskOrJob, Project, Task } from 'cvat-core-wrapper';

type FormValues = {
    flip: boolean;
    horizontal_flip: boolean;
    vertical_flip: boolean;
    rotate: boolean;
    rotateLimit: number;
    brightness_contrast: boolean;
    brightnessLimit: number;
    contrastLimit: number;
    hue_saturation: boolean;
    gaussian_noise: boolean;
    blur: boolean;
    blurLimit: number;
    crop: boolean;
    cropHeight: number;
    cropWidth: number;
    mosaic: boolean;
    cutout: boolean;
    cutoutHoles: number;
    cutoutSize: number;
    copiesPerImage: number;
    filename: string;
};

const initialValues: FormValues = {
    flip: false,
    horizontal_flip: true,
    vertical_flip: false,
    rotate: false,
    rotateLimit: 45,
    brightness_contrast: true,
    brightnessLimit: 0.2,
    contrastLimit: 0.2,
    hue_saturation: false,
    gaussian_noise: false,
    blur: false,
    blurLimit: 5,
    crop: false,
    cropHeight: 256,
    cropWidth: 256,
    mosaic: false,
    cutout: false,
    cutoutHoles: 8,
    cutoutSize: 16,
    copiesPerImage: 3,
    filename: '',
};

function AugmentDatasetModal(): JSX.Element {
    const [form] = Form.useForm();
    const dispatch = useDispatch();
    const history = useHistory();

    const { visible, instances } = useSelector((state: CombinedState) => state.augmentation.modal, shallowEqual);
    const {
        selectedIds,
        allTasks,
        allProjects,
    } = useSelector((state: CombinedState) => {
        const instanceType = instances && instances.length > 0 ? (
            instances[0] instanceof Project ? 'project' : 'task'
        ) : '';

        const getSelectedIds = (): number[] => {
            if (instanceType === 'project') {
                return state.projects.selected;
            }
            if (instanceType === 'task') {
                return state.tasks.selected;
            }
            return [];
        };

        return {
            selectedIds: getSelectedIds(),
            allTasks: state.tasks.current,
            allProjects: state.projects.current,
        };
    }, shallowEqual);

    const [selectedInstances, setSelectedInstances] = useState<(Project | Task)[]>([]);
    const instanceType = instances && instances.length > 0 ? (
        instances[0] instanceof Project ? 'project' : 'task'
    ) : '';

    const isBulkMode = selectedIds.length > 1;

    useEffect(() => {
        if (isBulkMode) {
            let filtered: (Project | Task)[] = [];
            if (instanceType === 'task') {
                filtered = allTasks.filter((t) => selectedIds.includes(t.id)) as Task[];
            } else if (instanceType === 'project') {
                filtered = allProjects.filter((p) => selectedIds.includes(p.id)) as Project[];
            }
            setSelectedInstances(filtered);
        } else if (instances && instances.length > 0) {
            setSelectedInstances(instances as (Project | Task)[]);
        } else {
            setSelectedInstances([]);
        }
    }, [isBulkMode, instanceType, allTasks, allProjects, instances]);

    const closeModal = useCallback(() => {
        dispatch(augmentationActions.closeAugmentModal());
        form.resetFields();
    }, [dispatch, form]);

    const handleSubmit = useCallback(async (values: FormValues) => {
        const augmentations: AugmentationConfig[] = [];

        // Build augmentations array based on selected options
        if (values.horizontal_flip) {
            augmentations.push({ type: 'horizontal_flip', params: {} });
        }
        if (values.vertical_flip) {
            augmentations.push({ type: 'vertical_flip', params: {} });
        }
        if (values.flip) {
            augmentations.push({ type: 'flip', params: {} });
        }
        if (values.rotate) {
            augmentations.push({ type: 'rotate', params: { limit: values.rotateLimit } });
        }
        if (values.brightness_contrast) {
            augmentations.push({
                type: 'brightness_contrast',
                params: {
                    brightness_limit: values.brightnessLimit,
                    contrast_limit: values.contrastLimit,
                },
            });
        }
        if (values.hue_saturation) {
            augmentations.push({ type: 'hue_saturation', params: {} });
        }
        if (values.gaussian_noise) {
            augmentations.push({ type: 'gaussian_noise', params: {} });
        }
        if (values.blur) {
            augmentations.push({ type: 'blur', params: { blur_limit: values.blurLimit } });
        }
        if (values.crop) {
            augmentations.push({
                type: 'crop',
                params: {
                    height: values.cropHeight,
                    width: values.cropWidth,
                },
            });
        }
        if (values.mosaic) {
            augmentations.push({ type: 'mosaic', params: {} });
        }
        if (values.cutout) {
            augmentations.push({
                type: 'cutout',
                params: {
                    max_holes: values.cutoutHoles,
                    max_height: values.cutoutSize,
                    max_width: values.cutoutSize,
                },
            });
        }

        if (augmentations.length === 0) {
            Notification.error({
                message: 'No augmentations selected',
                description: 'Please select at least one augmentation type',
            });
            return;
        }

        try {
            if (isBulkMode) {
                await dispatch(makeBulkOperationAsync<Project | Task>(
                    selectedInstances,
                    async (inst: Project | Task, idx: number) => {
                        let filename = values.filename;
                        if (filename) {
                            filename = filename
                                .replace('{{id}}', String(inst.id))
                                .replace('{{name}}', inst.name || '')
                                .replace('{{index}}', String(idx + 1))
                                .replace('{{timestamp}}', new Date().toISOString().replace(/[:.]/g, '-'));
                        }

                        await dispatch(augmentDatasetAsync(
                            inst,
                            augmentations,
                            values.copiesPerImage,
                            filename,
                        ));
                    },
                    (inst: Project | Task, idx: number, total: number) => (
                        `Augmenting dataset for ${instanceType}#${inst.id} [${idx + 1}/${total}]`
                    ),
                ));
            } else if (selectedInstances.length > 0) {
                const inst = selectedInstances[0];
                await dispatch(augmentDatasetAsync(
                    inst,
                    augmentations,
                    values.copiesPerImage,
                    values.filename,
                ));
            }

            Notification.info({
                message: 'Augmentation started',
                description: (
                    <CVATMarkdown history={history}>
                        Dataset augmentation was started. You can check progress [here](/requests).
                    </CVATMarkdown>
                ),
            });

            closeModal();
        } catch (error: any) {
            Notification.error({
                message: 'Failed to start augmentation',
                description: error.toString(),
            });
        }
    }, [dispatch, isBulkMode, selectedInstances, instanceType, history, closeModal]);

    const title = isBulkMode
        ? `Augment ${selectedInstances.length} ${instanceType}s`
        : `Augment ${instanceType}`;

    return (
        <Modal
            title={<Text strong>{title}</Text>}
            open={visible}
            onCancel={closeModal}
            onOk={() => form.submit()}
            okText='Start Augmentation'
            width={700}
            destroyOnClose
        >
            <Form
                form={form}
                layout='vertical'
                initialValues={initialValues}
                onFinish={handleSubmit}
            >
                <Form.Item
                    label='Number of augmented copies per image'
                    name='copiesPerImage'
                    rules={[{ required: true, type: 'number', min: 1, max: 10 }]}
                >
                    <Slider
                        min={1}
                        max={10}
                        marks={{ 1: '1', 5: '5', 10: '10' }}
                    />
                </Form.Item>

                <Collapse
                    defaultActiveKey={['geometric', 'color']}
                    items={[
                        {
                            key: 'geometric',
                            label: 'Geometric Transformations',
                            children: (
                                <Space direction='vertical' style={{ width: '100%' }}>
                                    <Form.Item name='horizontal_flip' valuePropName='checked' noStyle>
                                        <Checkbox>Horizontal Flip</Checkbox>
                                    </Form.Item>
                                    <Form.Item name='vertical_flip' valuePropName='checked' noStyle>
                                        <Checkbox>Vertical Flip</Checkbox>
                                    </Form.Item>
                                    <Form.Item name='flip' valuePropName='checked' noStyle>
                                        <Checkbox>Random Flip (Horizontal or Vertical)</Checkbox>
                                    </Form.Item>
                                    <Form.Item name='rotate' valuePropName='checked' noStyle>
                                        <Checkbox>Rotate</Checkbox>
                                    </Form.Item>
                                    <Form.Item
                                        noStyle
                                        shouldUpdate={(prev, curr) => prev.rotate !== curr.rotate}
                                    >
                                        {({ getFieldValue }) => getFieldValue('rotate') && (
                                            <Form.Item
                                                label='Rotation limit (degrees)'
                                                name='rotateLimit'
                                                style={{ marginLeft: 24 }}
                                            >
                                                <InputNumber min={1} max={180} />
                                            </Form.Item>
                                        )}
                                    </Form.Item>
                                    <Form.Item name='crop' valuePropName='checked' noStyle>
                                        <Checkbox>Random Crop</Checkbox>
                                    </Form.Item>
                                    <Form.Item
                                        noStyle
                                        shouldUpdate={(prev, curr) => prev.crop !== curr.crop}
                                    >
                                        {({ getFieldValue }) => getFieldValue('crop') && (
                                            <Space style={{ marginLeft: 24 }}>
                                                <Form.Item label='Height' name='cropHeight'>
                                                    <InputNumber min={64} max={1024} />
                                                </Form.Item>
                                                <Form.Item label='Width' name='cropWidth'>
                                                    <InputNumber min={64} max={1024} />
                                                </Form.Item>
                                            </Space>
                                        )}
                                    </Form.Item>
                                </Space>
                            ),
                        },
                        {
                            key: 'color',
                            label: 'Color Transformations',
                            children: (
                                <Space direction='vertical' style={{ width: '100%' }}>
                                    <Form.Item name='brightness_contrast' valuePropName='checked' noStyle>
                                        <Checkbox>Brightness & Contrast</Checkbox>
                                    </Form.Item>
                                    <Form.Item
                                        noStyle
                                        shouldUpdate={(prev, curr) => prev.brightness_contrast !== curr.brightness_contrast}
                                    >
                                        {({ getFieldValue }) => getFieldValue('brightness_contrast') && (
                                            <Space style={{ marginLeft: 24 }}>
                                                <Form.Item label='Brightness limit' name='brightnessLimit'>
                                                    <InputNumber min={0} max={1} step={0.1} />
                                                </Form.Item>
                                                <Form.Item label='Contrast limit' name='contrastLimit'>
                                                    <InputNumber min={0} max={1} step={0.1} />
                                                </Form.Item>
                                            </Space>
                                        )}
                                    </Form.Item>
                                    <Form.Item name='hue_saturation' valuePropName='checked' noStyle>
                                        <Checkbox>Hue & Saturation</Checkbox>
                                    </Form.Item>
                                </Space>
                            ),
                        },
                        {
                            key: 'effects',
                            label: 'Effects & Noise',
                            children: (
                                <Space direction='vertical' style={{ width: '100%' }}>
                                    <Form.Item name='gaussian_noise' valuePropName='checked' noStyle>
                                        <Checkbox>Gaussian Noise</Checkbox>
                                    </Form.Item>
                                    <Form.Item name='blur' valuePropName='checked' noStyle>
                                        <Checkbox>Blur</Checkbox>
                                    </Form.Item>
                                    <Form.Item
                                        noStyle
                                        shouldUpdate={(prev, curr) => prev.blur !== curr.blur}
                                    >
                                        {({ getFieldValue }) => getFieldValue('blur') && (
                                            <Form.Item
                                                label='Blur limit'
                                                name='blurLimit'
                                                style={{ marginLeft: 24 }}
                                            >
                                                <InputNumber min={3} max={15} step={2} />
                                            </Form.Item>
                                        )}
                                    </Form.Item>
                                    <Form.Item name='cutout' valuePropName='checked' noStyle>
                                        <Checkbox>Cutout (Random holes)</Checkbox>
                                    </Form.Item>
                                    <Form.Item
                                        noStyle
                                        shouldUpdate={(prev, curr) => prev.cutout !== curr.cutout}
                                    >
                                        {({ getFieldValue }) => getFieldValue('cutout') && (
                                            <Space style={{ marginLeft: 24 }}>
                                                <Form.Item label='Max holes' name='cutoutHoles'>
                                                    <InputNumber min={1} max={16} />
                                                </Form.Item>
                                                <Form.Item label='Hole size' name='cutoutSize'>
                                                    <InputNumber min={8} max={64} />
                                                </Form.Item>
                                            </Space>
                                        )}
                                    </Form.Item>
                                </Space>
                            ),
                        },
                        {
                            key: 'advanced',
                            label: 'Advanced',
                            children: (
                                <Space direction='vertical' style={{ width: '100%' }}>
                                    <Form.Item name='mosaic' valuePropName='checked' noStyle>
                                        <Checkbox>Mosaic (Combine multiple images)</Checkbox>
                                    </Form.Item>
                                </Space>
                            ),
                        },
                    ]}
                />

                <Form.Item
                    label='Filename (optional)'
                    name='filename'
                    help={isBulkMode ? 'Template variables: {{id}}, {{name}}, {{index}}, {{timestamp}}' : ''}
                    style={{ marginTop: 16 }}
                >
                    <Input placeholder={isBulkMode ? 'augmented_{{id}}_{{timestamp}}' : 'augmented_dataset'} />
                </Form.Item>
            </Form>
        </Modal>
    );
}

export default AugmentDatasetModal;
