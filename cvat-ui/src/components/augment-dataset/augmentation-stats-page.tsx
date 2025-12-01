// Copyright (C) 2025 CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router';
import Table from 'antd/lib/table';
import Button from 'antd/lib/button';
import Space from 'antd/lib/space';
import Typography from 'antd/lib/typography';
import Card from 'antd/lib/card';
import Tag from 'antd/lib/tag';
import Spin from 'antd/lib/spin';
import Empty from 'antd/lib/empty';
import { DownloadOutlined, DeleteOutlined } from '@ant-design/icons';
import Modal from 'antd/lib/modal';
import Notification from 'antd/lib/notification';
import { CombinedState } from 'reducers';
import {
    fetchAugmentationStatsAsync,
    deleteAugmentedDatasetAsync,
    downloadAugmentedDatasetAsync,
    AugmentedDataset,
    AugmentationConfig,
} from 'actions/augmentation-actions';

const { Title, Text } = Typography;

function AugmentationStatsPage(): JSX.Element {
    const dispatch = useDispatch();
    const history = useHistory();

    const { fetching, data } = useSelector((state: CombinedState) => state.augmentation.stats);

    useEffect(() => {
        dispatch(fetchAugmentationStatsAsync());
    }, [dispatch]);

    const handleDownload = async (dataset: AugmentedDataset) => {
        try {
            await dispatch(downloadAugmentedDatasetAsync(dataset.id));
            Notification.success({
                message: 'Download started',
                description: `Downloading ${dataset.id}...`,
            });
        } catch (error: any) {
            Notification.error({
                message: 'Download failed',
                description: error.toString(),
            });
        }
    };

    const handleDelete = (dataset: AugmentedDataset) => {
        Modal.confirm({
            title: 'Delete augmented dataset',
            content: `Are you sure you want to delete ${dataset.id}?`,
            okText: 'Delete',
            okType: 'danger',
            onOk: async () => {
                try {
                    await dispatch(deleteAugmentedDatasetAsync(dataset.id));
                    Notification.success({
                        message: 'Dataset deleted',
                        description: `Successfully deleted ${dataset.id}`,
                    });
                } catch (error: any) {
                    Notification.error({
                        message: 'Delete failed',
                        description: error.toString(),
                    });
                }
            },
        });
    };

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
    };

    const columns = [
        {
            title: 'ID',
            dataIndex: 'id',
            key: 'id',
            width: 250,
            render: (id: string) => <Text code>{id}</Text>,
        },
        {
            title: 'Source',
            dataIndex: 'source',
            key: 'source',
            render: (source: AugmentedDataset['source']) => (
                <Space direction='vertical' size={0}>
                    <Text strong>{source.name}</Text>
                    <Text type='secondary'>
                        {source.type} #{source.id}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => {
                const colorMap: Record<string, string> = {
                    completed: 'success',
                    failed: 'error',
                    processing: 'processing',
                };
                return <Tag color={colorMap[status] || 'default'}>{status.toUpperCase()}</Tag>;
            },
        },
        {
            title: 'Images',
            key: 'images',
            render: (_: any, record: AugmentedDataset) => {
                const stats = record.stats;
                if (!stats) return '-';
                return (
                    <Space direction='vertical' size={0}>
                        <Text>{stats.original_images} → {stats.augmented_images}</Text>
                        <Text type='secondary' style={{ fontSize: 12 }}>
                            {stats.copies_per_image}x copies
                        </Text>
                    </Space>
                );
            },
        },
        {
            title: 'Size',
            key: 'size',
            render: (_: any, record: AugmentedDataset) => {
                if (!record.stats) return '-';
                return formatBytes(record.stats.total_size_bytes);
            },
        },
        {
            title: 'Created',
            dataIndex: 'created_at',
            key: 'created_at',
            render: (date: string) => {
                const d = new Date(date);
                return (
                    <Space direction='vertical' size={0}>
                        <Text>{d.toLocaleDateString()}</Text>
                        <Text type='secondary' style={{ fontSize: 12 }}>
                            {d.toLocaleTimeString()}
                        </Text>
                    </Space>
                );
            },
        },
        {
            title: 'Augmentations',
            dataIndex: 'augmentations',
            key: 'augmentations',
            render: (augmentations: AugmentationConfig[]) => {
                if (!augmentations || augmentations.length === 0) return '-';
                return (
                    <Space size={[0, 4]} wrap>
                        {augmentations.slice(0, 3).map((aug, idx) => (
                            <Tag key={idx}>{aug.type}</Tag>
                        ))}
                        {augmentations.length > 3 && (
                            <Tag>+{augmentations.length - 3} more</Tag>
                        )}
                    </Space>
                );
            },
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 150,
            render: (_: any, record: AugmentedDataset) => (
                <Space>
                    {record.status === 'completed' && (
                        <Button
                            type='link'
                            icon={<DownloadOutlined />}
                            onClick={() => handleDownload(record)}
                        >
                            Download
                        </Button>
                    )}
                    <Button
                        type='link'
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(record)}
                    >
                        Delete
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
            <Card>
                <Space direction='vertical' size='large' style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Title level={3}>Augmented Datasets</Title>
                        <Button onClick={() => dispatch(fetchAugmentationStatsAsync())}>
                            Refresh
                        </Button>
                    </div>

                    {fetching ? (
                        <div style={{ textAlign: 'center', padding: '48px' }}>
                            <Spin size='large' />
                        </div>
                    ) : data.length === 0 ? (
                        <Empty
                            description='No augmented datasets found'
                            style={{ padding: '48px' }}
                        >
                            <Button
                                type='primary'
                                onClick={() => history.push('/tasks')}
                            >
                                Go to Tasks
                            </Button>
                        </Empty>
                    ) : (
                        <Table
                            columns={columns}
                            dataSource={data}
                            rowKey='id'
                            pagination={{
                                pageSize: 10,
                                showSizeChanger: true,
                                showTotal: (total) => `Total ${total} datasets`,
                            }}
                        />
                    )}
                </Space>
            </Card>
        </div>
    );
}

export default AugmentationStatsPage;
