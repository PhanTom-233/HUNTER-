import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 说明：package.json 未开启 "type": "module"，Vite 会把本文件单独打包后加载，
// 因此这里使用 ESM 语法（Vite 官方支持），而 tailwind/postcss 配置按 CJS 书写。
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
