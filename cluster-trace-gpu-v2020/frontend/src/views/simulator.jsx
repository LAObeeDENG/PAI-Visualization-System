import React, { useState } from 'react';
import {
  Card, Row, Col, Button, Table, Typography, Divider,
  Tag, message, Radio, Checkbox, InputNumber, Form, Alert,Spin,
} from 'antd';
import { RocketOutlined, BarChartOutlined, SettingOutlined,FileSearchOutlined } from '@ant-design/icons';
import ReactEcharts from 'echarts-for-react';
import axios from 'axios';

const { Title, Text, Paragraph } = Typography;
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
// 算法列表定义
const ALGO_OPTIONS = [
  { label: 'SJF (最短作业优先·Oracle)', value: 0 },
  { label: 'SJU (SJF + 用户特征预测)', value: 1 },
  { label: 'SJG (SJF + Group+用户预测)', value: 2 },
  { label: 'SJGG (SJF + Group+用户+GPU预测)', value: 4 },
  { label: 'FIFO (先进先出·基准)', value: 8 },
];

const Simulator = () => {
  // ===== 控制面板状态 =====
  const [mode, setMode] = useState('compare');             // 'single' | 'compare'
  const [selectedAlgos, setSelectedAlgos] = useState([0, 8]); // 对比模式默认选 SJF + FIFO
  const [singleAlgo, setSingleAlgo] = useState(0);           // 单算法模式
  const [numJobs, setNumJobs] = useState(9000);
  const [arrivalRate, setArrivalRate] = useState(1000);
  const [numGpus, setNumGpus] = useState(6500);
  const [currentConfig, setCurrentConfig] = useState(null);

  // ===== 仿真结果状态 =====
  const [simLoading, setSimLoading] = useState(false);
  const [simData, setSimData] = useState([]);

  // ===== 当前实际提交的算法列表 =====
  const activeAlgos = mode === 'single' ? [singleAlgo] : selectedAlgos;

  // ===== 对比模式下是否可以启动（至少选2个）=====
  const canRun = mode === 'single' ? true : selectedAlgos.length >= 2;

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
        num_gpus: numGpus
      });
      if (res.data.success) {
        setSimData(res.data.data);
        setCurrentConfig(res.data.config); // 保存本次运行的参数
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

  // ===== 表格列定义 =====
  const columns = [
    {
      title: '调度策略', dataIndex: 'algo', key: 'algo',
      render: text => <Text strong>{text}</Text>
    },
    {
      title: 'Avg JCT (s)', dataIndex: 'jct', key: 'jct',
      render: val => val.toFixed(2),
      sorter: (a, b) => a.jct - b.jct
    },
    {
      title: '排队等待 (s)', dataIndex: 'wait', key: 'wait',
      render: val => val.toFixed(2),
      sorter: (a, b) => a.wait - b.wait
    },
    {
      title: 'Makespan (s)', dataIndex: 'makespan', key: 'makespan',
      render: val => val?.toFixed(0) ?? '-'
    },
    {
      title: '评价', dataIndex: 'status', key: 'status',
      render: status => (
        <Tag color={status === 'Optimal' ? 'green' : 'blue'}>{status}</Tag>
      )
    },
  ];

  // ===== 图表：JCT 对比柱状图 =====
  const jctBarOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '8%', bottom: '10%', containLabel: true },
    xAxis: {
      type: 'category',
      data: simData.map(d => d.algo),
      axisLabel: { color: '#555' }
    },
    yAxis: { type: 'value', name: 'Avg JCT (s)', nameTextStyle: { color: '#555' } },
    series: [{
      data: simData.map(d => ({
        value: d.jct,
        itemStyle: { color: d.status === 'Optimal' ? '#52c41a' : '#1890ff' }
      })),
      type: 'bar',
      barWidth: '40%',
      label: { show: true, position: 'top', formatter: p => p.value.toFixed(0) }
    }]
  };

  // ===== 图表：等待时长对比柱状图 =====
  const waitBarOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '8%', bottom: '10%', containLabel: true },
    xAxis: {
      type: 'category',
      data: simData.map(d => d.algo),
      axisLabel: { color: '#555' }
    },
    yAxis: { type: 'value', name: '等待时长 (s)', nameTextStyle: { color: '#555' } },
    series: [{
      data: simData.map(d => ({
        value: d.wait,
        itemStyle: { color: d.status === 'Optimal' ? '#52c41a' : '#faad14' }
      })),
      type: 'bar',
      barWidth: '40%',
      label: { show: true, position: 'top', formatter: p => p.value.toFixed(0) }
    }]
  };

  // ===== 图表：相对 FIFO 的改善幅度（仅对比模式且有 FIFO 时显示）=====
  const fifoData = simData.find(d => d.algo === 'FIFO');
  const improvementOption = fifoData ? {
    tooltip: { trigger: 'axis', formatter: params => `${params[0].name}<br/>改善幅度: ${params[0].value.toFixed(1)}%` },
    grid: { left: '3%', right: '8%', bottom: '10%', containLabel: true },
    xAxis: {
      type: 'category',
      data: simData.filter(d => d.algo !== 'FIFO').map(d => d.algo),
      axisLabel: { color: '#555' }
    },
    yAxis: { type: 'value', name: '相对 FIFO 改善 (%)', nameTextStyle: { color: '#555' } },
    series: [{
      data: simData.filter(d => d.algo !== 'FIFO').map(d => ({
        value: ((fifoData.wait - d.wait) / fifoData.wait * 100),
        itemStyle: { color: '#52c41a' }
      })),
      type: 'bar',
      barWidth: '40%',
      label: {
        show: true, position: 'top',
        formatter: p => p.value.toFixed(1) + '%'
      }
    }]
  } : null;

  const [history, setHistory] = useState([]);
const [historyLoading, setHistoryLoading] = useState(false);
const [historyVisible, setHistoryVisible] = useState(false); // 控制历史面板展开/收起

// 拉取历史记录
const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
        const res = await axios.get('http://127.0.0.1:8000/api/simulator/history');
        setHistory(res.data.history);
    } catch (err) {
        message.error('获取历史记录失败');
    } finally {
        setHistoryLoading(false);
    }
};

// 点击历史记录，把结果加载进当前视图
const handleLoadHistory = async (id) => {
    try {
    const res = await axios.get(`http://127.0.0.1:8000/api/simulator/history/${id}`);
    if (res.data.record) {
      setSimData(res.data.record.results);
      setCurrentConfig(res.data.record.config); // 加载历史中的参数
      message.success('已加载历史记录');
    }
  } catch (err) {
        message.error('加载失败');
    }
};

// 删除历史记录
const handleDeleteHistory = async (id) => {
    try {
        await axios.delete(`http://127.0.0.1:8000/api/simulator/history/${id}`);
        message.success('已删除');
        fetchHistory();
    } catch (err) {
        message.error('删除失败');
    }
};

  return (
      <div style={{padding: '24px', background: '#f5f7fa', minHeight: '100vh'}}>
        <style>{customStyles}</style>
        <Title level={3} style={{marginBottom: 24}}>
          <BarChartOutlined/> 调度算法仿真器
        </Title>

        <Row gutter={24}>
          {/* 左侧控制面板 */}
          <Col span={7}>
            <Card
                bordered={false}
                title={<span><SettingOutlined/> 仿真配置</span>}
                style={{marginBottom: 16}}
            >
              {/* 模式切换 */}
              <Paragraph type="secondary" style={{marginBottom: 8}}>仿真模式</Paragraph>
              <Radio.Group
                  value={mode}
                  onChange={e => setMode(e.target.value)}
                  style={{marginBottom: 20, display: 'block'}}
              >
                <Radio.Button value="single">单算法</Radio.Button>
                <Radio.Button value="compare">算法对比</Radio.Button>
              </Radio.Group>

              {/* 算法选择 */}
              <Paragraph type="secondary" style={{marginBottom: 8}}>
                {mode === 'single' ? '选择算法' : '选择对比算法（至少2个）'}
              </Paragraph>

              <div className="algo-list-container" style={{
                background: '#fff',
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1px solid #f0f0f0',
                marginBottom: 16
              }}>
                {mode === 'single' ? (
                    <Radio.Group
                        value={singleAlgo}
                        onChange={e => setSingleAlgo(e.target.value)}
                        style={{width: '100%'}}
                    >
                      {ALGO_OPTIONS.map(opt => (
                          <Radio key={opt.value} value={opt.value}>
                            {opt.label}
                          </Radio>
                      ))}
                    </Radio.Group>
                ) : (
                    <Checkbox.Group
                        value={selectedAlgos}
                        onChange={vals => setSelectedAlgos(vals)}
                        style={{width: '100%'}}
                    >
                      {ALGO_OPTIONS.map(opt => (
                          <Checkbox key={opt.value} value={opt.value}>
                            {opt.label}
                          </Checkbox>
                      ))}
                    </Checkbox.Group>
                )}
              </div>

              {/* 对比模式少于2个时的提示 */}
              {mode === 'compare' && selectedAlgos.length < 2 && (
                  <Alert message="请至少选择 2 个算法进行对比" type="warning" showIcon style={{marginBottom: 16}}/>
              )}

              <Divider/>

              {/* 参数配置 */}
              <Paragraph type="secondary" style={{marginBottom: 8}}>仿真参数</Paragraph>
              <Form layout="vertical" size="small">
                <Form.Item label="作业数量">
                  <InputNumber
                      min={1000} max={20000} step={1000}
                      value={numJobs}
                      onChange={val => setNumJobs(val)}
                      style={{width: '100%'}}
                      addonAfter="个"
                  />
                </Form.Item>
                <Form.Item label="到达率">
                  <InputNumber
                      min={100} max={5000} step={100}
                      value={arrivalRate}
                      onChange={val => setArrivalRate(val)}
                      style={{width: '100%'}}
                      addonAfter="jobs/min"
                  />
                </Form.Item>
                <Form.Item label="GPU 总数">
                  <InputNumber
                      min={1000} max={10000} step={500}
                      value={numGpus}
                      onChange={val => setNumGpus(val)}
                      style={{width: '100%'}}
                      addonAfter="张"
                  />
                </Form.Item>
              </Form>

              <Divider/>

              {/* 启动按钮 */}
              <Button
                  type="primary"
                  icon={<RocketOutlined/>}
                  block
                  size="large"
                  loading={simLoading}
                  disabled={!canRun}
                  onClick={handleRunSimulation}
              >
                {simLoading ? '仿真运行中...' : '启动仿真'}
              </Button>
            </Card>
            {/* 历史记录面板 */}
<Card
    bordered={false}
    title={
        <div // 改用 div 避免点击区域过小
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
            onClick={() => {
                const nextVisible = !historyVisible;
                setHistoryVisible(nextVisible);
                if (nextVisible) fetchHistory(); // 展开时立即拉取
            }}
        >
            <span>📋 仿真历史记录</span>
            <span>{historyVisible ? '▲' : '▼'}</span>
        </div>
    }
>
    {historyVisible && (
        historyLoading ? (
            <div style={{ textAlign: 'center', padding: '20px' }}><Spin tip="加载中..." /></div>
        ) : (
            history.length === 0
                ? <div style={{ color: '#999', textAlign: 'center', padding: '12px' }}>暂无历史记录</div>
: (
                /* --- 新增：滚动容器开始 --- */
                <div style={{
                    maxHeight: '260px',    // 设置一个固定最大高度（约可容纳 3-4 条记录）
                    overflowY: 'auto',      // 允许垂直滚动
                    paddingRight: '8px',   // 为滚动条留点空间
                    paddingBottom: '4px'   // 底部留白
                }} className="history-scroll-container">
                { history.map(record => (
                    <Card
        key={record.id}
        size="small"
        style={{
            marginBottom: 12,
            borderRadius: '8px',
            border: '1px solid #f0f0f0',
            boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}
        bodyStyle={{ padding: '12px' }}
    >
        {/* 第一行：自动生成的标题 */}
        <div style={{ marginBottom: 8 }}>
            <Text strong style={{ fontSize: '14px', color: '#262626' }}>
                {record.created_at} {/* 这里显示我们刚才生成的 auto_name */}
            </Text>
        </div>

        {/* 第二行：参数微型面板 */}
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            background: '#f9f9f9',
            padding: '6px 10px',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#8c8c8c'
        }}>
            <span>作业: <b style={{color: '#555'}}>{record.num_jobs}</b></span>
            <span>GPU: <b style={{color: '#555'}}>{record.num_gpus}</b></span>
        </div>

        {/* 第三行：操作按钮 */}
                      <div style={{marginTop: 10, display: 'flex', gap: 8}}>
                        <Button
                            size="small"
                            type="default" // 改为 default 类型
                            icon={<FileSearchOutlined/>} // 换一个“文件查询”图标
                            style={{
                              flex: 1,
                              borderRadius: '4px',
                              color: '#1890ff', // 文字蓝色
                              borderColor: '#91d5ff', // 边框浅蓝
                              background: '#e6f7ff' // 极浅蓝底色
                            }}
                            onClick={() => handleLoadHistory(record.id)}
                        >
                          加载结果
                        </Button>
                        <Button
                            size="small"
                            danger
                            type="text" // 保持文本删除按钮，更简洁
                            style={{borderRadius: '4px'}}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteHistory(record.id);
                            }}
                        >
                          删除
                        </Button>
                      </div>
                    </Card>
                ))}
             </div>
        ))
    )}
</Card>
          </Col>

          {/* 右侧结果区 */}
          <Col span={17}>
            <Card title="仿真结果" bordered={false}>
              {/* 新增：参数展示条 */}
              {/* 右侧结果区 - 顶部参数展示条美化 */}
              {currentConfig && (
                  <div style={{
                    marginBottom: 20,
                    padding: '16px 24px',
                    background: '#ffffff', // 改为纯白背景
                    borderRadius: '10px',
                    borderLeft: '5px solid #1890ff', // 侧边粗蓝条，增加视觉重心
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)', // 微弱阴影，增加立体感
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div style={{display: 'flex', alignItems: 'center'}}>
                      <SettingOutlined style={{fontSize: '20px', color: '#1890ff', marginRight: '12px'}}/>
                      <Text strong style={{ fontSize: '16px', color: '#262626' }}>当前仿真环境</Text>
    </div>

    <div style={{ display: 'flex', gap: '40px' }}>
      <div>
        <Text type="secondary" style={{ fontSize: '14px', display: 'block' }}>作业数量</Text>
        <Text strong style={{ fontSize: '18px' }}>{currentConfig.num_jobs.toLocaleString()}</Text>
        <Text style={{ marginLeft: 4, fontSize: '12px', color: '#8c8c8c' }}>个</Text>
      </div>

      <Divider type="vertical" style={{ height: '40px', margin: '0' }} />

      <div>
        <Text type="secondary" style={{ fontSize: '14px', display: 'block' }}>任务到达率</Text>
        <Text strong style={{ fontSize: '18px', color: '#1890ff' }}>{currentConfig.arrival_rate}</Text>
        <Text style={{ marginLeft: 4, fontSize: '12px', color: '#8c8c8c' }}>jobs/min</Text>
      </div>

      <Divider type="vertical" style={{ height: '40px', margin: '0' }} />

      <div>
        <Text type="secondary" style={{ fontSize: '14px', display: 'block' }}>GPU 资源总数</Text>
        <Text strong style={{ fontSize: '18px', color: '#52c41a' }}>{currentConfig.num_gpus.toLocaleString()}</Text>
        <Text style={{ marginLeft: 4, fontSize: '12px', color: '#8c8c8c' }}>张</Text>
      </div>
    </div>
  </div>
)}
              <Table
                  dataSource={simData}
                  columns={columns}
                  pagination={false}
                  size="middle"
                  rowKey="algo"
                  locale={{emptyText: '请在左侧配置参数后启动仿真'}}
              />

              {simData.length > 0 && (
                  <>
                    <Divider dashed>图表分析</Divider>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Card size="small" title="平均JCT对比" bordered={false} style={{background: '#fafafa'}}>
                          <ReactEcharts option={jctBarOption} style={{height: '280px'}}/>
                        </Card>
                      </Col>
                      <Col span={12}>
                        <Card size="small" title="平均排队等待时长对比" bordered={false}
                              style={{background: '#fafafa'}}>
                          <ReactEcharts option={waitBarOption} style={{height: '280px'}}/>
                        </Card>
                      </Col>
                    </Row>

                    {/* 改善幅度图：仅对比模式且结果中有 FIFO 时显示 */}
                    {mode === 'compare' && fifoData && simData.length > 1 && (
                        <Row gutter={16} style={{marginTop: 16}}>
                          <Col span={24}>
                            <Card size="small" title="相对 FIFO 排队等待改善幅度" bordered={false}
                                  style={{background: '#fafafa'}}>
                              <ReactEcharts option={improvementOption} style={{height: '280px'}}/>
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