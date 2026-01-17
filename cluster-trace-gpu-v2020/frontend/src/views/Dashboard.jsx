import React, { useState, useEffect } from 'react';
import { Row, Col, Statistic, Card, Spin, Typography, ConfigProvider, theme } from 'antd';
import { RocketOutlined, HourglassOutlined, DeploymentUnitOutlined, DashboardOutlined } from '@ant-design/icons';
import ReactEcharts from 'echarts-for-react';
import axios from 'axios';

const { Title } = Typography;

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    kpi: {},
    gpuDist: [],
    gpuModels: [],
    top10: [],
    waitBuckets: []
  });

  // 定义视觉配色方案
  const colors = ['#00D8FF', '#00B5FF', '#0085FF', '#0055FF', '#52c41a', '#faad14', '#ff4d4f'];

  const fetchData = async () => {
    try {
      // 模拟/调用后端聚合接口
      const [kpiRes, midRes, botRes] = await Promise.all([
        axios.get('http://127.0.0.1:8000/api/dashboard/kpi'),
        axios.get('http://127.0.0.1:8000/api/dashboard/charts/middle'),
        axios.get('http://127.0.0.1:8000/api/dashboard/charts/bottom')
      ]);

      setData({
        kpi: kpiRes.data,
        gpuDist: midRes.data.gpuDist,
        gpuModels: midRes.data.gpuModels,
        top10: botRes.data.top10,
        waitBuckets: botRes.data.waitBuckets
      });
    } catch (err) {
      console.error("Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 60000); // 1分钟轮询
    return () => clearInterval(timer);
  }, []);

  // --- 图表配置 ---

  const gpuModelOption = {
    tooltip: { trigger: 'item' ,formatter: '{b}<br/>{d}%'},
    legend: { bottom: '0', textStyle: { color: '#ccc' } },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      itemStyle: { borderRadius: 5 },
      data: data.gpuModels,
      label: { color: '#ccc' ,}
    }]
  };

    const gpuDistOption = {
  tooltip: { trigger: 'item', formatter: '{b}<br/>{d}%' },
  legend: { bottom: 0, textStyle: { color: '#ccc' } },
  color: ['#203caf', '#00D8FF', '#faad14', '#ff7a45', '#ff4d4f'],
  series: [{
    type: 'pie',
    radius: ['0%', '70%'],
    itemStyle: { borderRadius: 5},
    data: data.gpuDist,
   label: { color: '#ccc' ,},
    //emphasis: { label: { show: true, color: '#fff' } }
  }]
};


  const top10Option = {
  tooltip: { trigger: 'axis' },
  grid: {
    left: '3%',
    right: '12%', // 加大右侧边距，给溢出的数字留空间
    bottom: '3%',
    containLabel: true
  },
  xAxis: {
    type: 'value',
    max: '800',
    axisLabel: {
    color: '#888',
  },
    splitLine: { lineStyle: { color: '#1a2b3c' } }
  },
  yAxis: {
    type: 'category',
    data: data.top10.map(d => d.name),
    inverse: true, // 重要：让第一名显示在最上方
    axisLabel: { color: '#00D8FF' }
  },
  series: [{
  type: 'bar',
  data: data.top10.map(d => ({
    value: d.val,
    itemStyle: {
      color: d.val > 80 ? '#75cdf5' : '#00D8FF'
    }
  })),
  barWidth: '60%',
  label: {
    show: true,
    position: 'right',
    // 使用 formatter 格式化数值
    formatter: function(params) {
      return params.value.toFixed(3) + '%';
    },
    color: '#fff',
    distance: 10
  }
}]
};

  const waitBucketOption = {
  tooltip: { trigger: 'axis' },
  grid: { left: '3%', right: '8%', bottom: '3%', containLabel: true },
  xAxis: { type: 'value', axisLabel: { color: '#888' , formatter: function (val) {
      if (val >= 1e6) return (val / 1e6).toFixed(1) + 'm';
      if (val >= 1e3) return (val / 1e3).toFixed(1) + 'k';
      return val.toFixed(0);
    }} },
  yAxis: {
    type: 'category',
    data: ['<1 min', '1-10 min', '10-60 min', '>1 h'],
    axisLabel: { color: '#ccd6f6' }
  },
  series: [{
    type: 'bar',
    data: data.waitBuckets.map((d, i) => ({
      value: d.value,

      itemStyle: {
        color: ['#0fd5ef', '#0337dc', '#479cff', '#07baf8'][i],
        borderRadius: 4
      }
    })),
    barWidth: '60%',
    label: {
      show: true,
      position: 'right',
      color: '#fff',
      formatter: p => (p.value / 10000).toFixed(1) + 'm' // 统一单位
    }
  }]
};


  const cardStyle = { background: '#0a192f', border: '1px solid #172a45', borderRadius: '8px' };

  if (loading) return <div style={{background:'#020c1b', height:'100vh', display:'flex', justifyContent:'center', alignItems:'center'}}><Spin size="large" /></div>;

  return (
    <div style={{ background: '#020c1b', minHeight: '100vh', padding: '24px', color: '#fff' }}>
      <Title level={2} style={{ color: '#00D8FF', textAlign: 'center', marginBottom: '32px' }}>
        PAI 数据概览大屏
      </Title>

      {/* 第一排：KPI 栏 */}
      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col span={6}>
          <Card style={cardStyle}>
            <Statistic title={<span style={{color:'#8892b0'}}>总 GPU 数量</span>} value={data.kpi.total_gpu} prefix={<DashboardOutlined />} valueStyle={{color:'#64ffda'}} />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={cardStyle}>
            <Statistic title={<span style={{color:'#8892b0'}}>历史活跃作业数</span>} value={data.kpi.active_jobs} prefix={<RocketOutlined />} valueStyle={{color:'#00D8FF'}} />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={cardStyle}>
            <Statistic title={<span style={{color:'#8892b0'}}>平均等待时间</span>} value={data.kpi.avg_wait} prefix={<HourglassOutlined />} valueStyle={{color:'#faad14'}} />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={cardStyle}>
            <Statistic title={<span style={{color:'#8892b0'}}>平均超配率</span>} value={data.kpi.overprov} prefix={<DeploymentUnitOutlined />} suffix="%" valueStyle={{color:'#52c41a'}} />
          </Card>
        </Col>
      </Row>

      {/* 第二排：中间层 (利用率分布 & 型号占比) */}
      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col span={12}>
          <Card title={<span style={{color:'#ccd6f6'}}>GPU 利用率区间分布</span>} style={cardStyle}>
            <ReactEcharts option={gpuDistOption} style={{ height: '300px' }} />
          </Card>
        </Col>
        <Col span={12}>
          <Card title={<span style={{color:'#ccd6f6'}}>机器/GPU 型号占比</span>} style={cardStyle}>
            <ReactEcharts option={gpuModelOption} style={{ height: '300px' }} />
          </Card>
        </Col>
      </Row>

      {/* 第三排：底部 (TOP 10 & 等待时长) */}
      <Row gutter={16}>
        <Col span={14}>
          <Card title={<span style={{color:'#ccd6f6'}}>高负载节点 TOP 10 (Worker ID 末8位)</span>} style={cardStyle}>
            <ReactEcharts option={top10Option} style={{ height: '350px' }} />
          </Card>
        </Col>
        <Col span={10}>
          <Card title={<span style={{color:'#ccd6f6'}}>等待时长区间分布</span>} style={cardStyle}>
            <ReactEcharts option={waitBucketOption} style={{ height: '350px' }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;