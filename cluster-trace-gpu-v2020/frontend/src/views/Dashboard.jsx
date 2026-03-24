import React from 'react';
import { Row, Col, Statistic, Card, Spin, Typography } from 'antd';
import { RocketOutlined, HourglassOutlined, DeploymentUnitOutlined, DashboardOutlined } from '@ant-design/icons';
import ReactEcharts from 'echarts-for-react';

const { Title } = Typography;

const Dashboard = ({ loading, data }) => {

  // 定义视觉配色方案
  const colors = ['#00D8FF', '#00B5FF', '#0085FF', '#0055FF', '#52c41a', '#faad14', '#ff4d4f'];

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

const hourlyTaskOption = {
  tooltip: {
    trigger: 'axis',
    formatter: params => {
      const hour = params[0].dataIndex;
      const day = ['日', '一', '二', '三', '四', '五', '六'][Math.floor(hour / 24)];
      return `周${day} ${hour % 24}:00<br/>Task 数: ${params[0].value}`;
    }
  },
  grid: { left: '3%', right: '4%', bottom: '12%', containLabel: true },
  xAxis: {
    type: 'category',
    data: Array.from({ length: 168 }, (_, i) => i),
    axisLabel: {
      color: '#888',
      interval: 23,  // 每24小时显示一个刻度
      formatter: val => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][Math.floor(val / 24)]
    },
    // 用竖线标出每天分界
    splitLine: {
      show: true,
      interval: 23,
      lineStyle: { color: '#1a2b3c', type: 'dashed' }
    }
  },
  yAxis: {
    type: 'value',
    name: 'Task 数',
    axisLabel: { color: '#888' },
    splitLine: { lineStyle: { color: '#1a2b3c' } }
  },
  series: [{
    type: 'line',
    // 把数据库返回的稀疏数据（只有有记录的小时）展开成完整168个点
    data: (() => {
      const arr = new Array(168).fill(0);
      data.hourlyTasks.forEach(d => { arr[d.hour_of_week] = d.task_count; });
      return arr;
    })(),
    smooth: true,
    symbol: 'none',
    lineStyle: { color: '#ff6b6b', width: 2 },
    areaStyle: {
      color: {
        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: 'rgba(255,107,107,0.4)' },
          { offset: 1, color: 'rgba(255,107,107,0.02)' }
        ]
      }
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

  // 实例运行时长 CDF（对数X轴）
const runtimeCdfOption = {
  tooltip: {
    trigger: 'axis',
    formatter: params => `运行时长: ${params[0].value[0].toFixed(0)}s<br/>CDF: ${params[0].value[1]}%`
  },
  grid: { left: '3%', right: '5%', bottom: '10%', containLabel: true },
  xAxis: {
    type: 'log',
    name: '运行时长 (秒)',
    nameLocation: 'middle',   // 改为居中显示，不再贴着右端
    nameGap: 30,              // 与轴线的距离
    nameTextStyle: { color: '#888' },
    axisLabel: {
      color: '#888',
      formatter: val => {
        if (val >= 3600) return (val / 3600).toFixed(0) + 'h';
        if (val >= 60)   return (val / 60).toFixed(0) + 'm';
        return val + 's';
      }
    },
    splitLine: { lineStyle: { color: '#1a2b3c' } }
  },
  yAxis: {
    type: 'value',
    name: 'CDF (%)',
    min: 0, max: 100,
    nameTextStyle: { color: '#888' },
    axisLabel: { color: '#888', formatter: val => val + '%' },
    splitLine: { lineStyle: { color: '#1a2b3c' } }
  },
  series: [{
    type: 'line',
    data: data.runtimeCdf.map(d => [d.value, d.cdf]),
    smooth: false,
    symbol: 'none',
    lineStyle: { color: '#00D8FF', width: 2 },
    areaStyle: {
      color: {
        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: 'rgba(0,216,255,0.3)' },
          { offset: 1, color: 'rgba(0,216,255,0.02)' }
        ]
      }
    }
  }]
};

// GPU 申请量 vs 实际使用量 CDF
const gpuCdfOption = {
  tooltip: {
    trigger: 'axis',
    formatter: params => {
        // 按系列名去重，每个系列只取第一个
        const seen = new Set();
        const lines = params
            .filter(p => {
                if (seen.has(p.seriesName)) return false;
                seen.add(p.seriesName);
                return true;
            })
            .map(p => `${p.seriesName}: ${p.value[0].toFixed(1)}%`);
        return `CDF: ${params[0].value[1]}%<br/>${lines.join('<br/>')}`;
    }
},
  legend: {
     data: [
        { name: 'GPU 申请量',    icon: 'circle',itemStyle: { color: '#00D8FF' } },
        { name: 'GPU 实际使用量', icon: 'circle',itemStyle: { color: '#faad14' } }
    ],
    textStyle: { color: '#ccc' },
    bottom: 0
  },
  grid: { left: '3%', right: '5%', bottom: '15%', containLabel: true },
  xAxis: {
    type: 'value',
    name: 'GPU 占比 (%)',
    nameLocation: 'middle',
    nameGap: 25,
    nameTextStyle: { color: '#888' },
    axisLabel: { color: '#888', formatter: val => val + '%' },
    splitLine: { lineStyle: { color: '#1a2b3c' } },
  },
  yAxis: {
    type: 'value',
    name: 'CDF (%)',
    min: 0, max: 100,
    nameTextStyle: { color: '#888' },
    axisLabel: { color: '#888', formatter: val => val + '%' },
    splitLine: { lineStyle: { color: '#1a2b3c' } }
  },
  series: [
    {
      name: 'GPU 申请量',
      type: 'line',
      data: data.planCdf.map(d => [d.value, d.cdf]),
      smooth: false,
      symbol: 'none',
      lineStyle: { color: '#00D8FF', width: 2 }
    },
    {
      name: 'GPU 实际使用量',
      type: 'line',
      data: data.utilCdf.map(d => [d.value, d.cdf]),
      smooth: false,
      symbol: 'none',
      lineStyle: { color: '#faad14', width: 2, type: 'dashed' }
    }
  ]
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
          <Card
            title={<span style={{color:'#ccd6f6'}}>一周内各小时任务提交量（均值）</span>}
            style={cardStyle}
          >
            <ReactEcharts option={hourlyTaskOption} style={{ height: '350px' }} />
          </Card>
        </Col>
        <Col span={10}>
          <Card title={<span style={{color:'#ccd6f6'}}>等待时长区间分布</span>} style={cardStyle}>
            <ReactEcharts option={waitBucketOption} style={{ height: '350px' }} />
          </Card>
        </Col>
      </Row>
      {/* 第四排：两张 CDF 图 */}
<Row gutter={16} style={{ marginTop: '24px' }}>
  <Col span={12}>
    <Card
      title={<span style={{ color: '#ccd6f6' }}>实例运行时长分布（CDF）</span>}
      style={cardStyle}
    >
      <ReactEcharts option={runtimeCdfOption} style={{ height: '300px' }} />
    </Card>
  </Col>
  <Col span={12}>
    <Card
      title={<span style={{ color: '#ccd6f6' }}>GPU 申请量 vs 实际使用量（CDF）</span>}
      style={cardStyle}
    >
      <ReactEcharts option={gpuCdfOption} style={{ height: '300px' }} />
    </Card>
  </Col>
</Row>
    </div>
  );
};

export default Dashboard;