import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const enableProxyDebug = process.env.VITE_PROXY_DEBUG === 'true'
const vendorChunkMap: Array<[string, string[]]> = [
  ['react-vendor', ['node_modules/react', 'node_modules/react-dom', 'node_modules/scheduler']],
  ['antd-table', ['node_modules/antd/es/table', 'node_modules/rc-table', 'node_modules/rc-pagination']],
  ['antd-modal', ['node_modules/antd/es/modal', 'node_modules/rc-dialog', 'node_modules/rc-motion']],
  ['antd-form', ['node_modules/antd/es/form', 'node_modules/antd/es/input', 'node_modules/antd/es/select', 'node_modules/rc-field-form', 'node_modules/rc-input', 'node_modules/rc-select', 'node_modules/rc-textarea']],
  ['antd-feedback', ['node_modules/antd/es/message', 'node_modules/antd/es/notification', 'node_modules/antd/es/alert', 'node_modules/antd/es/spin']],
  ['antd-nav', ['node_modules/antd/es/tabs', 'node_modules/antd/es/menu', 'node_modules/rc-tabs', 'node_modules/rc-menu']],
  ['antd-ui', ['node_modules/antd/es/button', 'node_modules/antd/es/card', 'node_modules/antd/es/collapse', 'node_modules/antd/es/empty', 'node_modules/antd/es/progress', 'node_modules/antd/es/space', 'node_modules/antd/es/steps', 'node_modules/antd/es/switch', 'node_modules/antd/es/tag', 'node_modules/antd/es/tooltip', 'node_modules/antd/es/typography', 'node_modules/antd/es/badge', 'node_modules/antd/es/popconfirm']],
  ['icons-vendor', ['node_modules/@ant-design']],
  ['router-vendor', ['node_modules/react-router']],
  ['network-vendor', ['node_modules/axios']],
  ['state-vendor', ['node_modules/zustand', 'node_modules/persist']],
]

const debugProxy = (...args: unknown[]) => {
  if (enableProxyDebug) {
    console.log(...args)
  }
}

const manualChunks = (id: string) => {
  if (!id.includes('node_modules')) {
    return
  }

  for (const [chunkName, packagePaths] of vendorChunkMap) {
    if (packagePaths.some((packagePath) => id.includes(packagePath))) {
      return chunkName
    }
  }

  return 'vendor'
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  server: {
    host: true, // 允许局域网访问
    port: 5173,
    strictPort: true, // 如果端口被占用则报错，而不是自动切换端口
    allowedHosts: [
      '.trycloudflare.com',
      'keyupan.cn',
      'www.keyupan.cn',
      'erp.keyupan.cn',
      '.keyupan.cn',
    ], // 允许 Cloudflare Tunnel 与 keyupan 域名访问
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            debugProxy('Proxying API request:', req.method, req.url, '->', options.target + proxyReq.path);
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            debugProxy('Received API response:', proxyRes.statusCode, req.url);
          });
          proxy.on('error', (err) => {
            console.error('API proxy error:', err);
          });
        },
      },
      // 金蝶 WebAPI 代理 - 通过后端动态代理，支持用户自定义服务器地址
      '/K3Cloud': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            debugProxy('Proxying Kingdee request to backend:', req.method, req.url, '->', options.target + proxyReq.path);
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            debugProxy('Received Kingdee response from backend:', proxyRes.statusCode, req.url);
          });
          proxy.on('error', (err) => {
            console.error('Kingdee proxy error:', err);
          });
        },
      },
      // 飞书 API 代理
      '/open-apis': {
        target: 'https://open.feishu.cn',
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            debugProxy('Proxying request:', req.method, req.url, '->', options.target + proxyReq.path);
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            debugProxy('Received response:', proxyRes.statusCode, req.url);
          });
          proxy.on('error', (err) => {
            console.error('Proxy error:', err);
          });
        },
      },
    },
  },
})
