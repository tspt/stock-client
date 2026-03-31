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
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('scheduler')) {
              return 'vendor-react';
            }
            if (id.includes('echarts')) {
              return 'vendor-echarts';
            }
            if (id.includes('xlsx')) {
              return 'vendor-xlsx';
            }
            const normalized = id.replace(/\\/g, '/');
            const marker = '/node_modules/';
            const index = normalized.indexOf(marker);
            if (index === -1) {
              return 'vendor-misc';
            }
            const subPath = normalized.slice(index + marker.length);
            const segments = subPath.split('/');
            const packageName = segments[0].startsWith('@') ? `${segments[0]}-${segments[1]}` : segments[0];
            const safeName = packageName.replace(/[^a-zA-Z0-9_-]/g, '_');
            return `vendor-${safeName}`;
          }
          return undefined;
        },
      },
    },
  },
});

