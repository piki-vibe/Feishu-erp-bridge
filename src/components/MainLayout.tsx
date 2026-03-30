import React, { useState } from 'react';
import { Layout, Menu, Button, Avatar, Dropdown, Typography } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UnorderedListOutlined,
  HistoryOutlined,
  ApiOutlined,
  FileSearchOutlined,
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
  const isInvoiceOcrTab = activeTab === 'invoice-ocr';

  const menuItems = [
    {
      key: 'tasks',
      icon: <UnorderedListOutlined />,
      label: '任务管理',
    },
    {
      key: 'monitoring',
      icon: <HistoryOutlined />,
      label: '执行监控',
    },
    {
      key: 'debugger',
      icon: <ApiOutlined />,
      label: 'WebAPI 调试',
    },
    {
      key: 'invoice-ocr',
      icon: <FileSearchOutlined />,
      label: '发票OCR',
    },
    {
      key: 'trigger-api',
      icon: <LinkOutlined />,
      label: '任务触发 API',
    },
  ];

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人信息',
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
    },
  ];

  const tabDescriptions: Record<string, string> = {
    tasks: '配置并拖拽排序任务，快速管理同步策略',
    monitoring: '查看执行进度、日志与失败原因',
    debugger: '预览和排查 WebAPI 请求与响应',
    'invoice-ocr': '上传图片或 PDF，提取发票号码',
    'trigger-api': '为任务生成独立 HTTP 触发地址，供外部系统调用',
    profile: '账户信息与数据管理',
  };

  const handleUserMenuClick = ({ key }: { key: string }) => {
    if (key === 'logout') {
      onLogout();
    }
  };

  const contentStyle: React.CSSProperties = isInvoiceOcrTab
    ? {
      ...styles.content,
      margin: '14px',
      padding: 0,
      background: 'transparent',
      border: 'none',
      boxShadow: 'none',
      minHeight: 'auto',
      overflow: 'visible',
    }
    : styles.content;

  return (
    <Layout style={styles.layout}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        style={styles.sider}
        width={248}
        collapsedWidth={84}
        className="fresh-sider"
      >
        <div style={styles.logoWrap}>
          <div style={styles.logoIcon}>
            <BrandLogo size={collapsed ? 36 : 42} />
          </div>
          {!collapsed && (
            <div style={styles.logoText}>
              <span style={styles.logoTitle}>金蝶数据传输平台</span>
              <span style={styles.logoSubtitle}>Fresh ERP Bridge</span>
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
                {tabDescriptions[activeTab] || '金蝶与飞书数据同步工作台'}
              </Text>
            </div>
          </div>

          <div style={styles.headerRight}>
            <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenuClick }} placement="bottomRight">
              <div style={styles.userPanel} className="fresh-user-panel">
                <Avatar size="small" style={styles.userAvatar} icon={<UserOutlined />} />
                <span style={styles.userOnlineDot} />
                <Text style={styles.userName}>{currentAccount?.username || '用户'}</Text>
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content style={contentStyle}>{children}</Content>
      </Layout>
    </Layout>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  layout: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #f5f8fa 0%, #edf3f6 100%)',
  },
  sider: {
    background: 'linear-gradient(180deg, #f2f6f9 0%, #e8eef3 100%)',
    borderRight: '1px solid #d7e0e7',
    boxShadow: '2px 0 14px rgba(86, 103, 117, 0.08)',
    position: 'relative',
  },
  logoWrap: {
    height: '86px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '14px',
    borderBottom: '1px solid rgba(126, 143, 156, 0.22)',
  },
  logoIcon: {
    width: '44px',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    marginLeft: '12px',
    display: 'flex',
    flexDirection: 'column',
  },
  logoTitle: {
    color: '#2c4253',
    fontSize: '16px',
    fontWeight: 700,
    letterSpacing: '0.25px',
  },
  logoSubtitle: {
    color: '#677d8d',
    fontSize: '11px',
    marginTop: '2px',
    letterSpacing: '0.3px',
  },
  menu: {
    background: 'transparent',
    border: 'none',
    marginTop: '16px',
    padding: '0 8px',
  },
  collapseBtnWrap: {
    position: 'absolute',
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
  },
  collapseBtn: {
    color: '#607988',
    fontSize: '18px',
    width: 40,
    height: 40,
    borderRadius: '12px',
  },
  header: {
    background: 'rgba(251, 253, 255, 0.93)',
    backdropFilter: 'blur(8px)',
    padding: '0 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid #dbe3e8',
    height: '68px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
  },
  pageTitleWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  pageTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#263c4d',
    letterSpacing: '0.25px',
  },
  pageSubtitle: {
    fontSize: '13px',
    color: '#5f7384',
    letterSpacing: '0.15px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  userPanel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    padding: '4px 12px',
    borderRadius: '20px',
    background: '#e9f0f4',
    border: '1px solid #ced9e1',
    transition: 'all 0.2s ease',
  },
  userAvatar: {
    backgroundColor: '#597a8d',
  },
  userOnlineDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#6ca9bf',
    boxShadow: '0 0 0 2px rgba(255,255,255,0.8)',
  },
  userName: {
    color: '#31485a',
    fontSize: '14px',
    fontWeight: 600,
  },
  content: {
    margin: '18px',
    padding: '22px',
    background: 'linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)',
    borderRadius: '16px',
    border: '1px solid #d8e1e8',
    boxShadow: '0 10px 24px rgba(86, 103, 117, 0.08)',
    minHeight: 'calc(100vh - 104px)',
    overflow: 'auto',
  },
};

export default MainLayout;

