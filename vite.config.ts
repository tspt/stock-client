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
  },
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        /**
         * 平衡型分包：减少 chunk 数量与「空 chunk」告警，同时保留常用大包独立缓存。
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          const n = id.replace(/\\/g, '/');

          if (/node_modules\/(react|react-dom|scheduler)(\/|$)/.test(n)) {
            return 'vendor-react';
          }
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

          // antd 本体与 rc/样式生态分开，避免单 chunk >500k 告警，同时仍比「按包名」少得多
          if (/node_modules\/antd(\/|$)/.test(n)) {
            return 'vendor-antd';
          }
          if (
            n.includes('@ant-design') ||
            n.includes('@rc-component') ||
            /node_modules\/rc-/.test(n) ||
            n.includes('@emotion') ||
            /node_modules\/stylis(\/|$)/.test(n) ||
            n.includes('@babel/runtime') ||
            n.includes('compute-scroll-into-view') ||
            n.includes('scroll-into-view-if-needed') ||
            n.includes('throttle-debounce') ||
            n.includes('resize-observer-polyfill') ||
            /node_modules\/classnames(\/|$)/.test(n) ||
            n.includes('json2mq') ||
            n.includes('string-convert') ||
            n.includes('toggle-selection') ||
            n.includes('copy-to-clipboard')
          ) {
            return 'vendor-antd-rc';
          }

          return 'vendor-misc';
        },
      },
    },
  },
});

