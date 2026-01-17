// src/App.jsx
import React, { useState } from 'react';
import { Layout, Menu } from 'antd';
import { DashboardOutlined, FileTextOutlined } from '@ant-design/icons';
import Dashboard from './views/Dashboard';
import Report from './views/Report';
import './App.css';

const { Sider, Content } = Layout;

function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [activeKey, setActiveKey] = useState('1');

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
    collapsible
    collapsed={collapsed}
    onCollapse={setCollapsed}
    width={210}                   // 固定宽度，避免折叠时跳
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
              style={{
    marginTop: collapsed ? 62 : 0, // 折叠时向下留 16 px
    flex: 1,
  }}
              onClick={({key}) => setActiveKey(key)}
              items={[
                  {key: '1', icon: <DashboardOutlined/>, label: '集群仪表盘'},
                  {key: '2', icon: <FileTextOutlined/>, label: '智能分析报告'},
              ]}
          />
      </Sider>
      <Layout>
        <Content style={{ margin: '0' }}>
          {/* 2. 这里根据 activeKey 切换显示的组件 */}
          {activeKey === '1' ? <Dashboard /> : <Report />}
        </Content>
      </Layout>
    </Layout>
  );
}

export default App;