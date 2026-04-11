import React, { useState } from 'react';
import { Layout, Menu, Button, Avatar, Dropdown, Typography } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UnorderedListOutlined,
  HistoryOutlined,
  ApiOutlined,
  LinkOutlined,
  UserOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { useAccountStore } from '../stores/accountStore';
import BrandLogo from './BrandLogo';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

interface MainLayoutProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({
  activeTab,
  onTabChange,
  onLogout,
  children,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const { currentAccount } = useAccountStore();

  const menuItems = [
    { key: 'tasks',       icon: <UnorderedListOutlined />, label: '任务管理' },
    { key: 'monitoring',  icon: <HistoryOutlined />,       label: '执行监控' },
    { key: 'debugger',    icon: <ApiOutlined />,           label: 'WebAPI 调试' },
    { key: 'trigger-api', icon: <LinkOutlined />,          label: '任务触发 API' },
  ];

  const userMenuItems = [
    { key: 'profile', icon: <UserOutlined />, label: '个人信息' },
    { type: 'divider' as const },
    { key: 'logout',  icon: <LogoutOutlined />, label: '退出登录', danger: true },
  ];

  const tabDescriptions: Record<string, string> = {
    tasks:       '配置并拖拽排序任务，快速管理同步策略',
    monitoring:  '查看执行进度、日志与失败原因',
    debugger:    '预览和排查 WebAPI 请求与响应',
    'trigger-api': '为任务生成独立 HTTP 触发地址，供外部系统调用',
    profile:     '账户信息与数据管理',
  };

  const handleUserMenuClick = ({ key }: { key: string }) => {
    if (key === 'logout') onLogout();
  };

  return (
    <Layout style={styles.layout}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        style={styles.sider}
        width={232}
        collapsedWidth={72}
        className="fresh-sider"
      >
        {/* Logo */}
        <div style={styles.logoWrap}>
          <div style={styles.logoIcon}>
            <BrandLogo size={collapsed ? 26 : 30} />
          </div>
          {!collapsed && (
            <div style={styles.logoText}>
              <span style={styles.logoTitle}>云桥</span>
              <span style={styles.logoSubtitle}>CloudLink</span>
            </div>
          )}
        </div>

        <Menu
          mode="inline"
          selectedKeys={[activeTab]}
          items={menuItems}
          onClick={({ key }) => onTabChange(key)}
          style={styles.menu}
          className="fresh-side-menu"
        />

        <div style={styles.collapseBtnWrap}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={styles.collapseBtn}
          />
        </div>
      </Sider>

      <Layout>
        <Header style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.pageTitleWrap}>
              <Text style={styles.pageTitle}>
                {menuItems.find((item) => item.key === activeTab)?.label || '工作台'}
              </Text>
              <Text style={styles.pageSubtitle}>
                {tabDescriptions[activeTab] || 'CloudLink 数据同步工作台'}
              </Text>
            </div>
          </div>

          <div style={styles.headerRight}>
            <Dropdown
              menu={{ items: userMenuItems, onClick: handleUserMenuClick }}
              placement="bottomRight"
            >
              <div style={styles.userPanel} className="fresh-user-panel">
                <Avatar size={28} style={styles.userAvatar} icon={<UserOutlined />} />
                <Text style={styles.userName}>{currentAccount?.username || '用户'}</Text>
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content style={styles.content}>{children}</Content>
      </Layout>
    </Layout>
  );
};

const BORDER = 'rgba(0, 0, 0, 0.07)';

const styles: { [key: string]: React.CSSProperties } = {
  layout: {
    minHeight: '100vh',
    background: '#F5F5F7',
  },
  sider: {
    background: '#FFFFFF',
    borderRight: `1px solid ${BORDER}`,
    position: 'relative',
  },
  logoWrap: {
    height: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 16px',
    borderBottom: `1px solid ${BORDER}`,
  },
  logoIcon: {
    width: '34px',
    height: '34px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  logoText: {
    marginLeft: '9px',
    display: 'flex',
    flexDirection: 'column',
  },
  logoTitle: {
    color: '#1D1D1F',
    fontSize: '14px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    lineHeight: '1.3',
  },
  logoSubtitle: {
    color: '#AEAEB2',
    fontSize: '10px',
    marginTop: '1px',
    letterSpacing: '0.03em',
    fontWeight: 400,
  },
  menu: {
    background: 'transparent',
    border: 'none',
    marginTop: '10px',
    padding: '0 12px',
  },
  collapseBtnWrap: {
    position: 'absolute',
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
  },
  collapseBtn: {
    color: '#AEAEB2',
    fontSize: '15px',
    width: 34,
    height: 34,
    borderRadius: '8px',
  },
  header: {
    background: '#FFFFFF',
    padding: '0 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: `1px solid ${BORDER}`,
    height: '56px',
    lineHeight: 'normal',
    boxShadow: 'none',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
  },
  pageTitleWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  pageTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#1D1D1F',
    letterSpacing: '-0.01em',
    lineHeight: '1.4',
  },
  pageSubtitle: {
    fontSize: '12px',
    color: '#AEAEB2',
    letterSpacing: '0',
    fontWeight: 400,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  userPanel: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    cursor: 'pointer',
    padding: '4px 10px',
    borderRadius: '8px',
    transition: 'background 0.12s',
  },
  userAvatar: {
    backgroundColor: '#1D1D1F',
  },
  userName: {
    color: '#1D1D1F',
    fontSize: '13px',
    fontWeight: 500,
  },
  content: {
    margin: '0',
    padding: '20px 24px',
    background: 'transparent',
    minHeight: 'calc(100vh - 56px)',
    overflow: 'auto',
  },
};

export default MainLayout;
