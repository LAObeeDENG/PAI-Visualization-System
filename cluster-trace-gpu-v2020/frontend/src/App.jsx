import React, { useState, useEffect } from 'react';
import { Layout, Menu, Spin } from 'antd';
import { DashboardOutlined, FileTextOutlined, ExperimentOutlined, RobotOutlined } from '@ant-design/icons';
import axios from 'axios';
import Dashboard from './views/Dashboard';
import Simulator from './views/Simulator';
import AIReport from './views/AIReport';
import './App.css';

const { Sider, Content } = Layout;

function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [activeKey, setActiveKey] = useState('1');

  // ===== 从 Dashboard.jsx 移过来的数据状态 =====
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    kpi: {},
    gpuDist: [],
    gpuModels: [],
    hourlyTasks: [],
    waitBuckets: [],
    runtimeCdf: [],
    planCdf: [],
    utilCdf: []
  });

  // ===== 只在 App 首次挂载时请求一次 =====
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [kpiRes, midRes, botRes, cdfRes] = await Promise.all([
          axios.get('http://127.0.0.1:8000/api/dashboard/kpi'),
          axios.get('http://127.0.0.1:8000/api/dashboard/charts/middle'),
          axios.get('http://127.0.0.1:8000/api/dashboard/charts/bottom'),
          axios.get('http://127.0.0.1:8000/api/dashboard/charts/cdf')
        ]);
        setDashboardData({
          kpi: kpiRes.data,
          gpuDist: midRes.data.gpuDist,
          gpuModels: midRes.data.gpuModels,
          hourlyTasks: botRes.data.hourlyTasks,
          waitBuckets: botRes.data.waitBuckets,
          runtimeCdf: cdfRes.data.runtimeCdf,
          planCdf: cdfRes.data.planCdf,
          utilCdf: cdfRes.data.utilCdf
        });
      } catch (err) {
        console.error("Fetch Error:", err);
      } finally {
        setDashboardLoading(false);
      }
    };

    fetchData();
    const timer = setInterval(fetchData, 60000);
    return () => clearInterval(timer);
  }, []); // 空依赖数组，只执行一次

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={210}
      >
        {!collapsed && (
          <div style={{
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #00D8FF 0%, #0085FF 100%)',
            color: '#020c1b',
            fontSize: 16,
            fontWeight: 600,
            borderRadius: 20,
            margin: '16px 16px 8px 16px',
            boxShadow: '0 2px 8px rgba(0,216,255,.35)',
            letterSpacing: 0.5,
          }}>
            PAI 分析系统
          </div>
        )}
        <Menu
          theme="dark"
          defaultSelectedKeys={['1']}
          mode="inline"
          style={{ marginTop: collapsed ? 62 : 0, flex: 1 }}
          onClick={({ key }) => setActiveKey(key)}
          items={[
            { key: '1', icon: <DashboardOutlined />, label: '集群仪表盘' },
            { key: '2', icon: <ExperimentOutlined />,  label: '调度仿真器' },
            { key: '3', icon: <RobotOutlined />,       label: 'AI 智能分析' },
          ]}
        />
      </Sider>
      <Layout>
        <Content style={{ margin: '0' }}>
  <div style={{ display: activeKey === '1' ? 'block' : 'none' }}>
    <Dashboard loading={dashboardLoading} data={dashboardData} />
  </div>
  <div style={{ display: activeKey === '2' ? 'block' : 'none' }}>
    <Simulator />
  </div>
  <div style={{ display: activeKey === '3' ? 'block' : 'none' }}>
    <AIReport />
  </div>
</Content>
      </Layout>
    </Layout>
  );
}

export default App;