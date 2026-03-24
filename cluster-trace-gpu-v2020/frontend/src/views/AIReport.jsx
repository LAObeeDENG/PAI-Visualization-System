import React, { useState } from 'react';
import { Card, Button, Typography, Divider, Tag, message, Spin, Empty } from 'antd';
import { RobotOutlined, AuditOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title, Text } = Typography;

const AIReport = () => {
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState('');

  const handleAIAnalyze = async () => {
    setAiLoading(true);
    try {
      const res = await axios.post('http://127.0.0.1:8000/api/analysis/ai-report');
      if (res.data.analysis) {
        setAiAnalysis(res.data.analysis);
        message.success('AI 专家诊断报告已生成');
      }
    } catch (err) {
      message.error('AI 诊断接口异常，请检查后端服务');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div style={{ padding: '24px', background: '#f5f7fa', minHeight: '100vh' }}>
      <Title level={3} style={{ marginBottom: 24 }}>
        <AuditOutlined /> AI 智能分析
      </Title>

      <Card bordered={false} title="一键 AI 专家诊断">
        <Button
          icon={<RobotOutlined />}
          type="primary"
          size="large"
          loading={aiLoading}
          onClick={handleAIAnalyze}
          style={{ marginBottom: 24 }}
        >
          生成 AI 专家分析报告
        </Button>

        {aiLoading ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <Spin tip="AI 分析中..." />
          </div>
        ) : aiAnalysis ? (
          <Card
            size="small"
            title={<span style={{ color: '#1890ff' }}><RobotOutlined /> AI 诊断结论</span>}
            style={{ border: '1px solid #1890ff', background: '#f0f7ff' }}
            bodyStyle={{ maxHeight: '600px', overflowY: 'auto', padding: '12px' }}
          >
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: '1.8', color: '#262626' }}>
              {aiAnalysis}
            </div>
            <Divider style={{ margin: '16px 0 8px 0' }} />
            <div style={{ textAlign: 'right' }}>
              <Tag color="blue">通义千问 Qwen-Plus</Tag>
            </div>
          </Card>
        ) : (
          <div style={{
            height: '400px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            border: '2px dashed #d9d9d9',
            borderRadius: '8px',
            background: '#fafafa',
            color: '#bfbfbf'
          }}>
            <RobotOutlined style={{ fontSize: '48px', marginBottom: 16 }} />
            <p style={{ fontSize: '16px' }}>AI 专家报告将在此处生成</p>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AIReport;