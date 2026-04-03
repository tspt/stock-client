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
         * 平衡型分包：保留 xlsx/echarts/axios/zustand 独立缓存。
         * 其余 node_modules 统一进 vendor-react-ui，避免 react / antd / react-is 等与 helper
         * 拆到不同 chunk 产生循环依赖，导致生产环境 undefined.useState。
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          const n = id.replace(/\\/g, '/');

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

          return 'vendor-react-ui';
        },
      },
    },
  },
});

