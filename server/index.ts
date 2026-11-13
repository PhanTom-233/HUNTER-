/**
 * Express 服务入口：装配路由、托管前端构建产物、SPA fallback、兜底错误处理。
 *
 * 生产：`npm run build && npm start` → http://localhost:3001
 * 开发：`npm run dev`（后端 3001 + Vite 5173，Vite 代理 /api）
 *
 * 只绑 127.0.0.1：这是一个本地单机工具，不对外提供任何服务。
 */

import fs from 'fs';
import path from 'path';

import express from 'express';
import type { NextFunction, Request, Response } from 'express';

import { APP_VERSION } from '../shared/constants';
import { AI_SCHEMA } from './aiSchema';
import { apiNotFoundHandler, errorHandler } from './http';
import assetsRouter from './routes/assets';
import endpointsRouter from './routes/endpoints';
import graphRouter from './routes/graph';
import projectsRouter from './routes/projects';
import reportsRouter from './routes/reports';
import seedsRouter from './routes/seeds';
import settingsRouter from './routes/settings';
import testsRouter from './routes/tests';
import * as store from './store';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 3001);
const PROJECT_ROOT = process.cwd();
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');

async function main(): Promise<void> {
  await store.init();

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8mb' }));

  // 本地工具，允许 Vite dev server 直接调（dev 走代理，这里只是兜底）
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // 机器可读的 API 结构：供外部 AI 直接读取后自动填表 / 调用；只含结构，不含项目数据
  app.get('/api/ai-schema', (_req: Request, res: Response) => {
    res.json({ ok: true, data: AI_SCHEMA });
  });

  app.use('/api', projectsRouter);
  app.use('/api', assetsRouter);
  app.use('/api', graphRouter);
  app.use('/api', endpointsRouter);
  app.use('/api', testsRouter);
  app.use('/api', reportsRouter);
  app.use('/api', settingsRouter);
  app.use('/api', seedsRouter);
  app.use('/api', apiNotFoundHandler);

  const indexHtml = path.join(DIST_DIR, 'index.html');
  const hasBuild = fs.existsSync(indexHtml);

  if (hasBuild) {
    app.use(express.static(DIST_DIR, { index: false, maxAge: 0 }));
    // 非 /api 的 GET 一律回 index.html，前端路由自己决定渲染哪一页
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(indexHtml);
    });
  } else {
    app.get('/', (_req: Request, res: Response) => {
      res
        .status(200)
        .type('text/plain; charset=utf-8')
        .send(
          [
            `HUNTER v${APP_VERSION} 后端已启动（未检测到 dist/ 构建产物）。`,
            '',
            '开发模式：请另开一个终端跑 `npm run dev`，然后访问 http://127.0.0.1:5173',
            '生产模式：先 `npm run build`，再 `npm start`，然后访问 http://localhost:3001',
            '',
            `数据目录：${store.getDataDir()}`,
          ].join('\n'),
        );
    });
  }

  app.use(errorHandler);

  const server = app.listen(PORT, HOST, () => {
    console.log(`[hunter] v${APP_VERSION} 后端已启动: http://${HOST}:${PORT}`);
    console.log(`[hunter] 数据目录: ${store.getDataDir()}`);
    console.log(
      hasBuild
        ? `[hunter] 已托管 dist/，直接打开 http://${HOST}:${PORT}`
        : '[hunter] 未检测到 dist/，开发请用 npm run dev（前端 127.0.0.1:5173）',
    );
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[hunter] 端口 ${PORT} 已被占用。请关掉占用它的进程，或用 PORT=3002 npm run dev 换个端口。`,
      );
    } else {
      console.error('[hunter] 服务启动失败', err);
    }
    process.exit(1);
  });

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[hunter] 收到 ${signal}，正在把内存中的改动落盘…`);
    try {
      await store.flushAll();
    } catch (err) {
      console.error('[hunter] 退出前落盘失败', err);
    }
    server.close(() => {
      console.log('[hunter] 已安全退出');
      process.exit(0);
    });
    // 兜底：连接迟迟不断就强退，flush 已经做完了
    setTimeout(() => process.exit(0), 3000).unref();
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  // Windows 关闭控制台窗口时 Node 会收到 SIGHUP，此时没时间做异步 flush，
  // 直接同步落盘，让「关窗口＝安全退出」成立。
  process.on('SIGHUP', () => {
    try {
      store.flushAllSync();
      console.log('[hunter] 控制台窗口关闭，数据已同步落盘');
    } catch (err) {
      console.error('[hunter] 关闭前同步落盘失败', err);
    }
    process.exit(0);
  });
  process.on('beforeExit', () => {
    void store.flushAll();
  });
  process.on('exit', () => {
    store.flushAllSync();
  });
}

main().catch((err: unknown) => {
  console.error('[hunter] 启动失败', err);
  process.exit(1);
});
