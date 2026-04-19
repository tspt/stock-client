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
      '/api/tencent/rank': {
        target: 'https://proxy.finance.qq.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/tencent\/rank/, '/cgi/cgi-bin/rank'),
        headers: {
          Referer: 'https://finance.qq.com',
          Origin: 'https://finance.qq.com',
        },
      },
      '/api/tencent': {
        target: 'https://qt.gtimg.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/tencent/, ''),
        headers: {
          Referer: 'https://finance.qq.com',
          Origin: 'https://finance.qq.com',
        },
      },
      '/api/eastmoney': {
        target: 'https://push2.eastmoney.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/eastmoney/, '/api/qt'),
        headers: {
          Referer: 'https://data.eastmoney.com/bkzj/gn.html',
          Origin: 'https://data.eastmoney.com',
          Cookie:
            'qgqp_b_id=51d6d555c5e243b0256ceb1ac9c36628; st_nvi=TnWN91Owg3cX5WszqJeo-f8e2; nid18=0d86f08b814c455b1d6ebd09256a5ade; nid18_create_time=1775911116025; gviem=VcbSKTlarodHzNMYoAptO452f; gviem_create_time=1775911116025; fullscreengg=1; fullscreengg2=1; st_si=84713527048044; st_pvi=13325294659680; st_sp=2025-03-30%2015%3A14%3A18; st_inirUrl=https%3A%2F%2Femcreative.eastmoney.com%2F; st_sn=10; st_psi=20260417210401477-113200301353-6617435904; st_asi=20260417205038273-113300300820-2544757072-dfcfwsy_dfcfwxsy_ycl_ewmxt-3',
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
