// PM2 設定：正式模式（對應 docs/DEPLOYMENT.md §6 的兩個視窗）
//   npm run build                         # 先停掉 backend，否則 prisma generate 會 EPERM（pm2 stop obe-backend）
//   pm2 start ecosystem.config.cjs
//   pm2 save                              # 搭配開機自動啟動（見 DEPLOYMENT.md §8）
//
// Windows 上 PM2 無法可靠地啟動 npm/npx 的 .cmd shim，所以兩者都直接用 node 跑 .js。
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'obe-backend',
      // cwd 必須是 packages/backend：server.ts 用 `dotenv/config` 從 cwd 讀 .env
      cwd: path.join(__dirname, 'packages/backend'),
      script: 'dist/server.js',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      name: 'obe-frontend',
      // vite preview：提供 dist/ 靜態檔於 :5173，並把 /api 代理到 :4000（設定見 vite.config.ts）
      cwd: path.join(__dirname, 'packages/frontend'),
      script: 'node_modules/vite/bin/vite.js',
      args: 'preview',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};
