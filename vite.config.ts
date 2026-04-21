import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '');

  return {
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
            Referer: env.VITE_TENCENT_RANK_REFERER,
            Origin: env.VITE_TENCENT_RANK_ORIGIN,
          },
        },
        '/api/tencent': {
          target: 'https://qt.gtimg.cn',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/tencent/, ''),
          headers: {
            Referer: env.VITE_TENCENT_REFERER,
            Origin: env.VITE_TENCENT_ORIGIN,
          },
        },
        // 注意: 更具体的路径必须放在前面
        '/api/eastmoney-data': {
          target: 'https://data.eastmoney.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/eastmoney-data/, '/dataapi'),
          headers: {
            Referer: env.VITE_EASTMONEY_REFERER,
            Origin: env.VITE_EASTMONEY_ORIGIN,
            Cookie: env.VITE_EASTMONEY_COOKIE || '',
          },
        },
        '/api/eastmoney': {
          target: 'https://push2.eastmoney.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/eastmoney/, '/api/qt'),
          headers: {
            Referer: env.VITE_EASTMONEY_REFERER,
            Origin: env.VITE_EASTMONEY_ORIGIN,
            Cookie: env.VITE_EASTMONEY_COOKIE || '',
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
  };
});
