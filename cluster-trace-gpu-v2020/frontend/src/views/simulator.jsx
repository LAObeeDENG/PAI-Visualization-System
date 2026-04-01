import React, { useState } from 'react';
import {
  Card, Row, Col, Button, Table, Typography, Divider,
  Tag, message, Radio, Checkbox, InputNumber, Form, Alert,
  Spin, Select, Switch, Tooltip
} from 'antd';
import {
  RocketOutlined, BarChartOutlined, SettingOutlined,
  FileSearchOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import ReactEcharts from 'echarts-for-react';
import axios from 'axios';

const { Title, Text, Paragraph } = Typography;

// 异构模式固定 GPU 总数（由 init_node_list_hetero 决定）
const HETERO_GPU_COUNT = 1352;

const customStyles = `
  .algo-list-container .ant-checkbox-wrapper,
  .algo-list-container .ant-radio-wrapper {
    display: flex !important;
    align-items: center !important;
    margin-bottom: 8px !important;
    margin-inline-end: 0 !important;
    width: 100%;
  }
  .algo-list-container .ant-checkbox + span,
  .algo-list-container .ant-radio + span {
    padding-inline-start: 10px;
    line-height: 1.4;
  }
`;

const ALGO_OPTIONS = [
  { label: 'SJF (最短作业优先·Oracle)', value: 0 },
  { label: 'SJU (SJF + 用户特征预测)', value: 1 },
  { label: 'SJG (SJF + Group+用户预测)', value: 2 },
  { label: 'SJGG (SJF + Group+用户+GPU预测)', value: 4 },
  { label: 'FIFO (先进先出·基准)', value: 8 },
];

const PACKING_LABELS = { 0: '负载均衡', 1: '打包策略' };
const GPU_MATCHING_LABELS = { 0: '无预留', 1: '严格预留', 2: 'V100专属' };
const PACKING_COLORS = { 0: 'blue', 1: 'orange' };
const GPU_MATCHING_COLORS = { 0: 'default', 1: 'red', 2: 'purple' };

// 单节点模式默认值
const SINGLE_DEFAULTS = { numJobs: 9000, arrivalRate: 1000, numGpus: 6500 };
// 异构模式推荐默认值（GPU总数约为单节点的1/5）
const HETERO_DEFAULTS = { numJobs: 2000, arrivalRate: 200 };

const Simulator = () => {
  const [mode, setMode] = useState('compare');
  const [selectedAlgos, setSelectedAlgos] = useState([0, 8]);
  const [singleAlgo, setSingleAlgo] = useState(0);
  const [numJobs, setNumJobs] = useState(SINGLE_DEFAULTS.numJobs);
  const [arrivalRate, setArrivalRate] = useState(SINGLE_DEFAULTS.arrivalRate);
  const [numGpus, setNumGpus] = useState(SINGLE_DEFAULTS.numGpus);
  const [packingPolicy, setPackingPolicy] = useState(0);
  const [gpuTypeMatching, setGpuTypeMatching] = useState(0);
  const [hetero, setHetero] = useState(false);
  const [currentConfig, setCurrentConfig] = useState(null);

  const [simLoading, setSimLoading] = useState(false);
  const [simData, setSimData] = useState([]);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);

  const activeAlgos = mode === 'single' ? [singleAlgo] : selectedAlgos;
  const canRun = mode === 'single' ? true : selectedAlgos.length >= 2;

  // ===== 切换异构模式时自动调整默认参数 =====
  const handleHeteroChange = (checked) => {
    setHetero(checked);
    if (checked) {
      setNumJobs(HETERO_DEFAULTS.numJobs);
      setArrivalRate(HETERO_DEFAULTS.arrivalRate);
    } else {
      setNumJobs(SINGLE_DEFAULTS.numJobs);
      setArrivalRate(SINGLE_DEFAULTS.arrivalRate);
      setNumGpus(SINGLE_DEFAULTS.numGpus);
      // 关闭异构模式时重置策略为默认值
      setPackingPolicy(0);
      setGpuTypeMatching(0);
    }
  };

  const handleRunSimulation = async () => {
    if (!canRun) {
      message.warning('对比模式下请至少选择 2 个算法');
      return;
    }
    setSimLoading(true);
    setSimData([]);
    try {
      const res = await axios.post('http://127.0.0.1:8000/api/simulator/run', {
        algorithms: activeAlgos,
        num_jobs: numJobs,
        arrival_rate: arrivalRate,
        num_gpus: hetero ? HETERO_GPU_COUNT : numGpus,
        packing_policy: hetero ? packingPolicy : 0,
        gpu_type_matching: hetero ? gpuTypeMatching : 0,
        hetero: hetero
      });
      if (res.data.success) {
        setSimData(res.data.data);
        setCurrentConfig({
          num_jobs: numJobs,
          arrival_rate: arrivalRate,
          num_gpus: hetero ? HETERO_GPU_COUNT : numGpus,
          packing_policy: hetero ? packingPolicy : 0,
          gpu_type_matching: hetero ? gpuTypeMatching : 0,
          hetero: hetero
        });
        message.success('仿真运行成功！');
        fetchHistory();
      } else {
        message.error(res.data.error || '仿真失败');
      }
    } catch (err) {
      message.error('仿真失败，请检查后端服务');
    } finally {
      setSimLoading(false);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
        const res = await axios.get('http://127.0.0.1:8000/api/simulator/history');
        setHistory(res.data.history || []);
    } catch (err) {
        console.error('获取历史记录失败:', err);
        message.error('获取历史记录失败');
    } finally {
        setHistoryLoading(false);
    }
};

  const handleLoadHistory = async (id) => {
    try {
        const res = await axios.get(`http://127.0.0.1:8000/api/simulator/history/${id}`);
        if (res.data.record) {
            setSimData(res.data.record.results);
            // ===== 修复：同步更新 currentConfig =====
            if (res.data.record.config) {
                setCurrentConfig(res.data.record.config);
            }
            message.success('已加载历史记录');
        }
    } catch (err) {
        message.error('加载失败');
    }
};

  const handleDeleteHistory = async (id) => {
    try {
      await axios.delete(`http://127.0.0.1:8000/api/simulator/history/${id}`);
      message.success('已删除');
      fetchHistory();
    } catch (err) {
      message.error('删除失败');
    }
  };

  const columns = [
    { title: '调度策略', dataIndex: 'algo', key: 'algo', render: text => <Text strong>{text}</Text> },
    { title: 'Avg JCT (s)', dataIndex: 'jct', key: 'jct', render: val => val.toFixed(2), sorter: (a, b) => a.jct - b.jct },
    { title: '排队等待 (s)', dataIndex: 'wait', key: 'wait', render: val => val.toFixed(2), sorter: (a, b) => a.wait - b.wait },
    { title: 'Makespan (s)', dataIndex: 'makespan', key: 'makespan', render: val => val?.toFixed(0) ?? '-' },
    { title: '评价', dataIndex: 'status', key: 'status', render: status => <Tag color={status === 'Optimal' ? 'green' : 'blue'}>{status}</Tag> },
  ];

  const jctBarOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '8%', bottom: '10%', containLabel: true },
    xAxis: { type: 'category', data: simData.map(d => d.algo), axisLabel: { color: '#555' } },
    yAxis: { type: 'value', name: 'Avg JCT (s)', nameTextStyle: { color: '#555' } },
    series: [{
      data: simData.map(d => ({ value: d.jct, itemStyle: { color: d.status === 'Optimal' ? '#52c41a' : '#1890ff' } })),
      type: 'bar', barWidth: '40%',
      label: { show: true, position: 'top', formatter: p => p.value.toFixed(0) }
    }]
  };

  const waitBarOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '8%', bottom: '10%', containLabel: true },
    xAxis: { type: 'category', data: simData.map(d => d.algo), axisLabel: { color: '#555' } },
    yAxis: { type: 'value', name: '等待时长 (s)', nameTextStyle: { color: '#555' } },
    series: [{
      data: simData.map(d => ({ value: d.wait, itemStyle: { color: d.status === 'Optimal' ? '#52c41a' : '#faad14' } })),
      type: 'bar', barWidth: '40%',
      label: { show: true, position: 'top', formatter: p => p.value.toFixed(0) }
    }]
  };

  const fifoData = simData.find(d => d.algo === 'FIFO');
  const improvementOption = fifoData ? {
    tooltip: { trigger: 'axis', formatter: params => `${params[0].name}<br/>改善幅度: ${params[0].value.toFixed(1)}%` },
    grid: { left: '3%', right: '8%', bottom: '10%', containLabel: true },
    xAxis: { type: 'category', data: simData.filter(d => d.algo !== 'FIFO').map(d => d.algo), axisLabel: { color: '#555' } },
    yAxis: { type: 'value', name: '相对 FIFO 改善 (%)', nameTextStyle: { color: '#555' } },
    series: [{
      data: simData.filter(d => d.algo !== 'FIFO').map(d => ({
        value: ((fifoData.wait - d.wait) / fifoData.wait * 100),
        itemStyle: { color: '#52c41a' }
      })),
      type: 'bar', barWidth: '40%',
      label: { show: true, position: 'top', formatter: p => p.value.toFixed(1) + '%' }
    }]
  } : null;

  return (
    <div style={{ padding: '24px', background: '#f5f7fa', minHeight: '100vh' }}>
      <style>{customStyles}</style>
      <Title level={3} style={{ marginBottom: 24 }}>
        <BarChartOutlined /> 调度算法仿真器
      </Title>

      <Row gutter={24}>
        {/* 左侧控制面板 */}
        <Col span={7}>
          <Card
            bordered={false}
            title={<span><SettingOutlined /> 仿真配置</span>}
            style={{ marginBottom: 16 }}
          >
            {/* 仿真模式 */}
            <Paragraph type="secondary" style={{ marginBottom: 8 }}>仿真模式</Paragraph>
            <Radio.Group
              value={mode}
              onChange={e => setMode(e.target.value)}
              style={{ marginBottom: 20, display: 'block' }}
            >
              <Radio.Button value="single">单算法</Radio.Button>
              <Radio.Button value="compare">算法对比</Radio.Button>
            </Radio.Group>

            {/* 算法选择 */}
            <Paragraph type="secondary" style={{ marginBottom: 8 }}>
              {mode === 'single' ? '选择算法' : '选择对比算法（至少2个）'}
            </Paragraph>
            <div className="algo-list-container" style={{
              background: '#fff', padding: '12px 16px',
              borderRadius: '8px', border: '1px solid #f0f0f0', marginBottom: 16
            }}>
              {mode === 'single' ? (
                <Radio.Group value={singleAlgo} onChange={e => setSingleAlgo(e.target.value)} style={{ width: '100%' }}>
                  {ALGO_OPTIONS.map(opt => <Radio key={opt.value} value={opt.value}>{opt.label}</Radio>)}
                </Radio.Group>
              ) : (
                <Checkbox.Group value={selectedAlgos} onChange={vals => setSelectedAlgos(vals)} style={{ width: '100%' }}>
                  {ALGO_OPTIONS.map(opt => <Checkbox key={opt.value} value={opt.value}>{opt.label}</Checkbox>)}
                </Checkbox.Group>
              )}
            </div>

            {mode === 'compare' && selectedAlgos.length < 2 && (
              <Alert message="请至少选择 2 个算法进行对比" type="warning" showIcon style={{ marginBottom: 16 }} />
            )}

            <Divider />

            {/* ===== 异构模式开关 ===== */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span>
                <Text strong>仿真模式</Text>
                <Tooltip title={`开启后使用 380 个异构节点（共 ${HETERO_GPU_COUNT} GPU），包含 T4/P100/V100/MISC 等多种型号，节点分配策略和 GPU 预留策略将真正生效`}>
                  <InfoCircleOutlined style={{ marginLeft: 6, color: '#999' }} />
                </Tooltip>
              </span>
              <Switch
                checked={hetero}
                onChange={handleHeteroChange}
                checkedChildren="异构"
                unCheckedChildren="单节点"
              />
            </div>

            {/* ===== 异构模式下才显示的策略选项 ===== */}
            {hetero && (
              <div style={{
                background: '#f6ffed', border: '1px solid #b7eb8f',
                borderRadius: 8, padding: '12px 16px', marginBottom: 16
              }}>
                <Paragraph type="secondary" style={{ marginBottom: 4, fontSize: 12 }}>
                  异构模式下以下策略将真正生效
                </Paragraph>
                <Form layout="vertical" size="small">
                  <Form.Item label="节点分配策略" style={{ marginBottom: 8 }}>
                    <Select
                      value={packingPolicy}
                      onChange={val => setPackingPolicy(val)}
                      style={{ width: '100%' }}
                      options={[
                        { value: 0, label: '负载均衡（优先最空闲节点）' },
                        { value: 1, label: '打包策略（优先填满已有节点）' },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item label="GPU 预留策略" style={{ marginBottom: 0 }}>
                    <Select
                      value={gpuTypeMatching}
                      onChange={val => setGpuTypeMatching(val)}
                      style={{ width: '100%' }}
                      options={[
                        { value: 0, label: '无预留（任意型号节点均可）' },
                        { value: 1, label: '严格预留（必须匹配指定型号）' },
                        { value: 2, label: 'V100 专属（仅 V100 严格匹配）' },
                      ]}
                    />
                  </Form.Item>
                </Form>
              </div>
            )}

            {/* ===== 仿真参数 ===== */}
            <Form layout="vertical" size="small">
              <Form.Item label="作业数量">
                <InputNumber
                  min={500} max={20000} step={hetero ? 500 : 1000}
                  value={numJobs} onChange={val => setNumJobs(val)}
                  style={{ width: '100%' }} addonAfter="个"
                />
              </Form.Item>
              <Form.Item label="到达率">
                <InputNumber
                  min={50} max={5000} step={hetero ? 50 : 100}
                  value={arrivalRate} onChange={val => setArrivalRate(val)}
                  style={{ width: '100%' }} addonAfter="jobs/min"
                />
              </Form.Item>
              {/* GPU 总数：仅单节点模式显示 */}
              {!hetero && (
                <Form.Item label="GPU 总数">
                  <InputNumber
                    min={1000} max={10000} step={500}
                    value={numGpus} onChange={val => setNumGpus(val)}
                    style={{ width: '100%' }} addonAfter="张"
                  />
                </Form.Item>
              )}
              {/* 异构模式下显示固定 GPU 总数提示 */}
              {hetero && (
                <Form.Item label="GPU 总数">
                  <div style={{
                    padding: '4px 11px', background: '#f5f5f5',
                    border: '1px solid #d9d9d9', borderRadius: 6,
                    color: '#888', fontSize: 14
                  }}>
                    {HETERO_GPU_COUNT} 张（异构固定）
                  </div>
                </Form.Item>
              )}
            </Form>

            <Divider />

            <Button
              type="primary" icon={<RocketOutlined />} block size="large"
              loading={simLoading} disabled={!canRun}
              onClick={handleRunSimulation}
            >
              {simLoading ? '仿真运行中...' : '启动仿真'}
            </Button>
          </Card>

          {/* 历史记录面板 */}
          <Card
            bordered={false}
            title={
              <div
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
                onClick={() => {
                  const next = !historyVisible;
                  setHistoryVisible(next);
                  if (next) fetchHistory();
                }}
              >
                <span>📋 仿真历史记录</span>
                <span>{historyVisible ? '▲' : '▼'}</span>
              </div>
            }
          >
            {historyVisible && (
              historyLoading
                ? <div style={{ textAlign: 'center', padding: '20px' }}><Spin tip="加载中..." /></div>
                : history.length === 0
                  ? <div style={{ color: '#999', textAlign: 'center', padding: '12px' }}>暂无历史记录</div>
                  : (
                    <div style={{ maxHeight: '260px', overflowY: 'auto', paddingRight: '8px' }}>
                      {history.map(record => (
                        <Card
                          key={record.id} size="small"
                          style={{ marginBottom: 12, borderRadius: '8px', border: '1px solid #f0f0f0' }}
                          bodyStyle={{ padding: '12px' }}
                        >
                          <div style={{ marginBottom: 8 }}>
                            <Text strong style={{ fontSize: 13 }}>{record.created_at}</Text>
                          </div>
                          <div style={{
                            display: 'flex', justifyContent: 'space-between',
                            background: '#f9f9f9', padding: '6px 10px',
                            borderRadius: '4px', fontSize: 12, color: '#8c8c8c'
                          }}>
                            <span>作业: <b style={{ color: '#555' }}>{record.num_jobs}</b></span>
                            <span>GPU: <b style={{ color: '#555' }}>{record.num_gpus}</b></span>
                          </div>
                          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                            <Button
                              size="small" icon={<FileSearchOutlined />}
                              style={{ flex: 1, borderRadius: '4px', color: '#1890ff', borderColor: '#91d5ff', background: '#e6f7ff' }}
                              onClick={() => handleLoadHistory(record.id)}
                            >加载结果</Button>
                            <Button
                              size="small" danger type="text"
                              style={{ borderRadius: '4px' }}
                              onClick={e => { e.stopPropagation(); handleDeleteHistory(record.id); }}
                            >删除</Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )
            )}
          </Card>
        </Col>

        {/* 右侧结果区 */}
        <Col span={17}>
          <Card title="仿真结果" bordered={false}>

            {/* 当前仿真环境面板 */}
            {currentConfig && (
              <div style={{
                marginBottom: 20, padding: '16px 24px',
                background: '#ffffff', borderRadius: '10px',
                borderLeft: `5px solid ${currentConfig.hetero ? '#52c41a' : '#1890ff'}`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
              }}>
                {/* 第一行：标题 + 三个数字指标 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <SettingOutlined style={{ fontSize: '20px', color: currentConfig.hetero ? '#52c41a' : '#1890ff' }} />
                    <Text strong style={{ fontSize: '16px', color: '#262626' }}>当前仿真环境</Text>
                    {/* 集群模式 Tag */}
                    <Tag color={currentConfig.hetero ? 'green' : 'blue'} style={{ marginLeft: 4 }}>
                      {currentConfig.hetero ? '🌐 异构多节点' : '⬛ 单节点'}
                    </Tag>
                  </div>
                  <div style={{ display: 'flex', gap: '32px' }}>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>作业数量</Text>
                      <Text strong style={{ fontSize: 18 }}>{currentConfig.num_jobs.toLocaleString()}</Text>
                      <Text style={{ marginLeft: 4, fontSize: 12, color: '#8c8c8c' }}>个</Text>
                    </div>
                    <Divider type="vertical" style={{ height: '40px', margin: '0' }} />
                    <div>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>任务到达率</Text>
                      <Text strong style={{ fontSize: 18, color: currentConfig.hetero ? '#52c41a' : '#1890ff' }}>
                        {currentConfig.arrival_rate}
                      </Text>
                      <Text style={{ marginLeft: 4, fontSize: 12, color: '#8c8c8c' }}>jobs/min</Text>
                    </div>
                    <Divider type="vertical" style={{ height: '40px', margin: '0' }} />
                    <div>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>GPU 总数</Text>
                      <Text strong style={{ fontSize: 18, color: '#722ed1' }}>
                        {currentConfig.num_gpus.toLocaleString()}
                      </Text>
                      <Text style={{ marginLeft: 4, fontSize: 12, color: '#8c8c8c' }}>
                        张{currentConfig.hetero ? '（固定）' : ''}
                      </Text>
                    </div>
                  </div>
                </div>

                {/* 第二行：策略 Tag，仅异构模式显示 */}
                {currentConfig.hetero && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>策略：</Text>
                    <Tag color={PACKING_COLORS[currentConfig.packing_policy]}>
                      节点分配 · {PACKING_LABELS[currentConfig.packing_policy]}
                    </Tag>
                    <Tag color={GPU_MATCHING_COLORS[currentConfig.gpu_type_matching]}>
                      GPU预留 · {GPU_MATCHING_LABELS[currentConfig.gpu_type_matching]}
                    </Tag>
                  </div>
                )}
              </div>
            )}

            <Table
              dataSource={simData} columns={columns}
              pagination={false} size="middle" rowKey="algo"
              locale={{ emptyText: '请在左侧配置参数后启动仿真' }}
            />

            {simData.length > 0 && (
              <>
                <Divider dashed>图表分析</Divider>
                <Row gutter={16}>
                  <Col span={12}>
                    <Card size="small" title="平均JCT对比" bordered={false} style={{ background: '#fafafa' }}>
                      <ReactEcharts option={jctBarOption} style={{ height: '280px' }} />
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small" title="平均排队等待时长对比" bordered={false} style={{ background: '#fafafa' }}>
                      <ReactEcharts option={waitBarOption} style={{ height: '280px' }} />
                    </Card>
                  </Col>
                </Row>
                {mode === 'compare' && fifoData && simData.length > 1 && (
                  <Row gutter={16} style={{ marginTop: 16 }}>
                    <Col span={24}>
                      <Card size="small" title="相对 FIFO 排队等待改善幅度" bordered={false} style={{ background: '#fafafa' }}>
                        <ReactEcharts option={improvementOption} style={{ height: '280px' }} />
                      </Card>
                    </Col>
                  </Row>
                )}
              </>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Simulator;