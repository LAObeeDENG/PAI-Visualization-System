import React, { useState } from 'react';
import { Card, Row, Col, Button, Table, Typography, Divider, Tag, message, Spin, Empty } from 'antd';
import { RocketOutlined, AuditOutlined, RobotOutlined, BarChartOutlined } from '@ant-design/icons';
import ReactEcharts from 'echarts-for-react';
import axios from 'axios';

const { Title, Paragraph, Text } = Typography;

const Report = () => {
  const [simLoading, setSimLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [simData, setSimData] = useState([]);
  const [aiAnalysis, setAiAnalysis] = useState(""); // 存储 AI 文本报告

  // 1. 运行仿真逻辑
  const handleRunSimulation = async () => {
    setSimLoading(true);
    try {
      const res = await axios.post('http://127.0.0.1:8000/api/simulator/run');
      if (res.data.success) {
        setSimData(res.data.data);
        message.success('仿真运行成功，数据已更新！');
      }
    } catch (err) {
      message.error('仿真失败，请检查后端服务');
    } finally {
      setSimLoading(false);
    }
  };

  // 2. 一键 AI 诊断逻辑
  const handleAIAnalyze = async () => {
    if (simData.length === 0) {
      message.warning('请先运行算法仿真，获取数据后再进行 AI 诊断');
      return;
    }
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

  // 仿真结果表格列定义
  const columns = [
    { title: '调度策略', dataIndex: 'algo', key: 'algo', render: (text) => <Text strong>{text}</Text> },
    { title: 'Avg JCT', dataIndex: 'jct', key: 'jct', render: (val) => `${val.toFixed(2)}s` },
    { title: '排队等待', dataIndex: 'wait', key: 'wait', render: (val) => `${val.toFixed(2)}s` },
    {
      title: '评价',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'Optimal' ? 'green' : 'blue'}>{status}</Tag>
      )
    },
  ];

  // 图表配置 - 这里的样式在渲染时调整
  const barOption = {
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: simData.map(d => d.algo) },
    yAxis: { type: 'value', name: '等待时长 (s)' },
    series: [{
      data: simData.map(d => d.wait),
      type: 'bar',
      itemStyle: { color: '#1890ff' },
      label: { show: true, position: 'top' },
      barWidth: '40%'
    }]
  };

  return (
    <div style={{ padding: '24px', background: '#f5f7fa', minHeight: '100vh' }}>
      <Title level={3} style={{ marginBottom: 24 }}>
        <AuditOutlined /> 智能分析与调度报告系统
      </Title>

      <Row gutter={24}>
        {/* 左侧控制区 */}
        <Col span={9}>
          <Card bordered={false} title="策略控制中心">
            <Paragraph type="secondary">
              基于 <Text strong>多算法仿真引擎</Text>，模拟不同调度策略在当前负载下的性能表现。
            </Paragraph>

            <Button
              type="primary"
              icon={<RocketOutlined />}
              block
              size="large"
              loading={simLoading}
              onClick={handleRunSimulation}
            >
              启动算法仿真器
            </Button>

            <Divider orientation="left" style={{ fontSize: '12px', color: '#999' }}>AI 专家建议</Divider>

            <Button
              icon={<RobotOutlined />}
              block
              danger={!!aiAnalysis}
              onClick={handleAIAnalyze}
              loading={aiLoading}
              style={{ marginBottom: 20 }}
            >
              一键生成 AI 专家分析报告
            </Button>

            {/* --- AI 报告展示/占位区域 --- */}
            <div style={{ minHeight: '400px' }}>
              {aiLoading ? (
                <div style={{
                  textAlign: 'center',
                  padding: '100px 0',
                  background: '#fff',
                  borderRadius: '8px',
                  border: '1px solid #f0f0f0'
                }}>
                  <Spin tip="ai分析中..." />
                </div>
              ) : aiAnalysis ? (
                <Card
                  size="small"
                  title={<span style={{ color: '#1890ff' }}><RobotOutlined /> AI 诊断结论</span>}
                  style={{ border: '1px solid #1890ff', background: '#f0f7ff' }}
                  // 增加内部纵向滚动条逻辑
                  bodyStyle={{
                    maxHeight: '400px',
                    overflowY: 'auto',
                    padding: '12px'
                  }}
                >
                  <div style={{
                    whiteSpace: 'pre-wrap',
                    fontSize: '14px',
                    lineHeight: '1.8',
                    color: '#262626'
                  }}>
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
            </div>
          </Card>
        </Col>

        {/* 右侧看板区 */}
        <Col span={15}>
          <Card title="调度算法仿真结果" bordered={false}>
            <Table
              dataSource={simData}
              columns={columns}
              pagination={false}
              size="middle"
              rowKey="algo"
              locale={{ emptyText: '请先启动算法仿真器以填充基准数据' }}
            />
            {simData.length > 0 && (
              <div style={{ marginTop: '32px' }}>
                <Divider dashed>各调度策略平均排队延迟对比</Divider>
                {/* 增加图表高度到 420px */}
                <ReactEcharts option={barOption} style={{ height: '420px' }} />
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Report;