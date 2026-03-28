import React, { useState, useEffect, useRef } from 'react';
import {
  Card, Row, Col, Button, Input, Spin, Tag,
  Typography, Divider, Statistic, Tooltip, message
} from 'antd';
import {
  RobotOutlined, SendOutlined, ReloadOutlined,
  AuditOutlined, ThunderboltOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// ===== 预置问题 =====
const PRESET_QUESTIONS = [
  { label: '一键分析集群现状', text: '请综合分析当前集群的运行状况，包括GPU利用率、等待时间、超配情况，并给出主要问题。' },
  { label: '分析最近仿真结果', text: '请分析最近一次仿真的结果，对比各调度算法的性能差异，并说明哪种算法更适合当前集群。' },
  { label: 'GPU利用率为何偏低', text: '当前集群GPU低利用率占比较高，请分析导致GPU利用率偏低的主要原因，以及可以采取哪些措施改善。' },
  { label: '超配情况优化建议', text: '当前集群存在较高的GPU超配率，请针对这一情况给出具体的优化建议。' },
];

const AIReport = () => {
  // ===== 对话状态 =====
  const [messages, setMessages] = useState([]);       // {role, content}
  const [inputText, setInputText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // ===== 左侧快照状态 =====
  const [snapshot, setSnapshot] = useState(null);
  const [snapLoading, setSnapLoading] = useState(false);

  const messagesEndRef = useRef(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 首次加载快照
  useEffect(() => {
    fetchSnapshot();
  }, []);

  const fetchSnapshot = async () => {
    setSnapLoading(true);
    try {
      const res = await axios.get('http://127.0.0.1:8000/api/analysis/cluster-snapshot');
      setSnapshot(res.data);
    } catch {
      message.error('获取集群快照失败');
    } finally {
      setSnapLoading(false);
    }
  };

  const sendMessage = async (text) => {
  const userText = text || inputText.trim();
  if (!userText) return;

  // 1. 生成包含最新提问的消息数组
  const newMessages = [...messages, { role: 'user', content: userText }];

  // 更新 UI 状态（用户立即看到自己的提问）
  setMessages(newMessages);
  setInputText('');
  setAiLoading(true);

  try {
    // 2. 【核心逻辑】只截取最近 10 条消息（即 5 轮对话）发送给 AI
    // slice(-10) 确保即便对话再长，发送给后端的 Token 也是受控的
    const limitedMessages = newMessages.slice(-10);

    // 3. 对齐接口：使用 8000 端口，路径为 /api/analysis/ai-report
    const res = await axios.post('http://127.0.0.1:8000/api/analysis/ai-report', {
      messages: limitedMessages
    });

    // 4. 对齐字段：后端 server.py 返回的是 { "reply": "..." }
    if (res.data && res.data.reply) {
      setMessages([...newMessages, { role: 'assistant', content: res.data.reply }]);
    }
  } catch (error) {
    message.error('AI 服务异常，请检查后端');
    // 如果失败，在界面上显示错误提示
    setMessages([...newMessages, { role: 'assistant', content: 'AI 服务暂时不可用，请稍后重试。' }]);
    console.error("AI Chat Error:", error);
  } finally {
    setAiLoading(false);
  }
};

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ===== 左侧快照面板 =====
  const renderSnapshot = () => {
    if (snapLoading) return <Spin style={{ display: 'block', margin: '40px auto' }} />;
    if (!snapshot || snapshot.error) return <Text type="secondary">快照加载失败</Text>;

    const { kpi, sim_summary } = snapshot;

    return (
      <>
        {/* KPI 指标 */}
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>集群状态</Text>
          <Row gutter={[8, 8]} style={{ marginTop: 8 }}>
            <Col span={12}>
              <Card size="small" style={{ background: '#f0f7ff', border: 'none', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#1890ff' }}>{kpi.total_gpu}</div>
                <div style={{ fontSize: 11, color: '#888' }}>总GPU数</div>
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" style={{ background: '#f6ffed', border: 'none', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#52c41a' }}>{kpi.active_jobs}</div>
                <div style={{ fontSize: 11, color: '#888' }}>活跃作业数</div>
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" style={{ background: '#fffbe6', border: 'none', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#faad14' }}>{kpi.avg_wait_min}m</div>
                <div style={{ fontSize: 11, color: '#888' }}>平均等待</div>
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" style={{ background: '#fff0f6', border: 'none', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#eb2f96' }}>{kpi.avg_overprov}%</div>
                <div style={{ fontSize: 11, color: '#888' }}>平均超配率</div>
              </Card>
            </Col>
            <Col span={12}>
              <Tooltip title="GPU利用率处于0-20%区间的任务占比，反映资源浪费程度">
                <Card size="small" style={{ background: '#fff2e8', border: 'none', textAlign: 'center', cursor: 'help' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#fa541c' }}>{kpi.low_util_pct}%</div>
                  <div style={{ fontSize: 11, color: '#888' }}>低利用率占比</div>
                </Card>
              </Tooltip>
            </Col>
            <Col span={12}>
              <Tooltip title="排队等待超过1小时的任务占比，反映调度压力">
                <Card size="small" style={{ background: '#f9f0ff', border: 'none', textAlign: 'center', cursor: 'help' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#722ed1' }}>{kpi.long_wait_pct}%</div>
                  <div style={{ fontSize: 11, color: '#888' }}>长等待占比</div>
                </Card>
              </Tooltip>
            </Col>
          </Row>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* 最近仿真摘要 */}
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>最近仿真结果</Text>
          {sim_summary ? (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>{sim_summary.created_at}</div>
              <div style={{ fontSize: 12, marginBottom: 6 }}>
                <Tag color="blue">{sim_summary.mode === 'single' ? '单算法' : '对比'}</Tag>
                作业: {sim_summary.num_jobs} | GPU: {sim_summary.num_gpus}
              </div>
              {sim_summary.results.map(r => (
                <div key={r.algo} style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: 12, padding: '3px 0',
                  borderBottom: '1px solid #f0f0f0'
                }}>
                  <span>
                    <Tag color={r.status === 'Optimal' ? 'green' : 'default'} style={{ fontSize: 11 }}>
                      {r.algo}
                    </Tag>
                  </span>
                  <span style={{ color: '#666' }}>等待 {r.wait.toFixed(0)}s</span>
                </div>
              ))}
              {sim_summary.best_algo && sim_summary.improve_pct && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#52c41a' }}>
                  ✓ {sim_summary.best_algo} 相比 FIFO 改善 {sim_summary.improve_pct}%
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
              暂无仿真数据，建议先运行仿真以获得更深入的分析
            </div>
          )}
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* 刷新按钮 */}
        <Button
          icon={<ReloadOutlined />}
          size="small"
          block
          onClick={fetchSnapshot}
          loading={snapLoading}
        >
          刷新数据快照
        </Button>
      </>
    );
  };

  // ===== 消息气泡 =====
  const renderMessages = () => {
    if (messages.length === 0) {
      return (
        <div style={{ textAlign: 'center', color: '#bbb', padding: '60px 20px' }}>
          <RobotOutlined style={{ fontSize: 48, marginBottom: 12 }} />
          <div>向 AI 专家提问，或点击下方预置问题快速开始</div>
        </div>
      );
    }
    return messages.map((msg, idx) => (
      <div
        key={idx}
        style={{
          display: 'flex',
          justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
          marginBottom: 12
        }}
      >
        {msg.role === 'assistant' && (
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: '#1890ff', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginRight: 8, flexShrink: 0, fontSize: 14
          }}>
            AI
          </div>
        )}
        <div style={{
          maxWidth: '75%',
          padding: '10px 14px',
          borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          background: msg.role === 'user' ? '#1890ff' : '#f0f2f5',
          color: msg.role === 'user' ? '#fff' : '#262626',
          fontSize: 14,
          lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}>
          {msg.content}
        </div>
        {msg.role === 'user' && (
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: '#52c41a', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginLeft: 8, flexShrink: 0, fontSize: 12
          }}>
            我
          </div>
        )}
      </div>
    ));
  };

  return (
    <div style={{ padding: '24px', background: '#f5f7fa', minHeight: '100vh' }}>
      <Title level={3} style={{ marginBottom: 24 }}>
        <AuditOutlined /> AI 智能分析
      </Title>

      <Row gutter={20} style={{ height: 'calc(100vh - 120px)' }}>

        {/* 左侧：数据快照面板 */}
        <Col span={6}>
          <Card
            bordered={false}
            title={<span>📊 当前数据快照</span>}
            style={{ height: '100%', overflowY: 'auto' }}
            bodyStyle={{ padding: '16px' }}
          >
            {renderSnapshot()}
          </Card>
        </Col>

        {/* 右侧：对话区 */}
        <Col span={18} style={{ height: '100%' }}>
          <Card
              bordered={false}
              style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column'
              }}
              bodyStyle={{
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden' // 2. 关键：禁止 Card Body 溢出，强制内部元素处理滚动
              }}
          >
            {/* 预置问题按钮 */}
            <div style={{marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8, flexShrink: 0}}>
              {PRESET_QUESTIONS.map((q, idx) => (
                  <Button
                      key={idx}
                      size="small"
                      icon={<ThunderboltOutlined/>}
                      onClick={() => sendMessage(q.text)}
                      disabled={aiLoading}
                      style={{borderRadius: 16}}
                  >
                    {q.label}
                  </Button>
              ))}
            </div>

            <Divider style={{ margin: '0 0 12px 0', flexShrink: 0 }} />

            {/* 消息列表 */}
            <div style={{
              flex: 1,           // 3. 占据剩余所有空间
              overflowY: 'auto', // 允许纵向滚动
              padding: '8px 4px',
              marginBottom: 12,
              minHeight: 0       // 4. 关键：在某些浏览器中防止 flex 容器被内容撑开
            }}>
              {renderMessages()}
              {aiLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#999', fontSize: 13, marginTop: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: '#1890ff', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14
          }}>AI</div>
          <Spin size="small" /> 思考中...
        </div>
      )}
              <div ref={messagesEndRef}/>
            </div>

            {/* 输入框 */}
            <div style={{display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0, paddingTop: 8}}>
              <TextArea
        value={inputText}
        onChange={e => setInputText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入问题，回车发送（Shift+Enter 换行）"
        autoSize={{ minRows: 1, maxRows: 4 }}
        style={{ borderRadius: 8, flex: 1 }}
        disabled={aiLoading}
      />
              <Button
                  type="primary"
                  icon={<SendOutlined/>}
                  onClick={() => sendMessage()}
                  loading={aiLoading}
                  disabled={!inputText.trim()}
                  style={{borderRadius: 8, height: 40}}
              >
                发送
              </Button>
              {messages.length > 0 && (
                  <Button
                      onClick={() => setMessages([])}
                      style={{borderRadius: 8, height: 40}}
                      disabled={aiLoading}
                  >
                    清空
                  </Button>
              )}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default AIReport;