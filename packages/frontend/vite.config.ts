import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // 監聽 0.0.0.0：其它機台直接開 http://<app 主機 IP>:5173/dash，不需要各自安裝 frontend/backend
    host: true,
    port: 5173,
    // 5173 被佔用時直接報錯，而不是自動換埠——換了埠，所有機台的網址就失效
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  // 正式模式（npm run build 後 vite preview）沿用同一個埠；preview.proxy 未設定時沿用 server.proxy
  preview: {
    host: true,
    port: 5173,
    strictPort: true,
  },
});
