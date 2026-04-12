import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api/tencent': {
        target: 'https://qt.gtimg.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/tencent/, ''),
        headers: {
          Referer: 'https://finance.qq.com',
          Origin: 'https://finance.qq.com',
        },
      },
      '/api/tencent-sector-rank': {
        target: 'https://proxy.finance.qq.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/tencent-sector-rank/, ''),
        headers: {
          Referer: 'https://finance.qq.com',
          Origin: 'https://finance.qq.com',
        },
      },
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        /**
         * 更细粒度的分包策略：
         * - xlsx/echarts/axios/zustand 独立缓存
         * - antd 单独分包（体积大）
         * - react/react-dom 单独分包
         * - 其余 node_modules 统一进 vendor
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          const n = id.replace(/\\/g, '/');

          // 大型库独立分包
          if (n.includes('/xlsx/') || n.endsWith('/xlsx')) {
            return 'vendor-xlsx';
          }
          if (n.includes('echarts') || n.includes('zrender')) {
            return 'vendor-echarts';
          }
          if (n.includes('/axios/')) {
            return 'vendor-axios';
          }
          if (n.includes('/zustand/')) {
            return 'vendor-zustand';
          }
          if (n.includes('antd') || n.includes('@ant-design')) {
            return 'vendor-antd';
          }
          if (n.includes('/react/') || n.includes('/react-dom/') || n.includes('/scheduler/')) {
            return 'vendor-react';
          }

          // 其他第三方库
          return 'vendor';
        },
      },
    },
  },
});
