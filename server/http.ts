/**
 * HTTP 层公用件：统一响应格式、错误类型、错误处理中间件。
 *
 * 成功：`{ ok: true, data }`
 * 失败：`{ ok: false, error: { code, message, details? } }`
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export class ApiError extends Error {
  readonly code: string;

  readonly status: number;

  readonly details?: unknown;

  constructor(code: string, message: string, status = 500, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** 参数校验失败 → 400 */
export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

/** 资源不存在 → 404 */
export class NotFoundError extends ApiError {
  constructor(message = '资源不存在') {
    super('NOT_FOUND', message, 404);
    this.name = 'NotFoundError';
  }
}

/** 状态冲突 → 409 */
export class ConflictError extends ApiError {
  constructor(message: string, details?: unknown) {
    super('CONFLICT', message, 409, details);
    this.name = 'ConflictError';
  }
}

export function sendOk<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ ok: true, data });
}

/** 把 async 路由包一层，让 reject 能进错误中间件（Express 4 不会自动捕获） */
export function wrap(
  handler: (req: Request, res: Response) => Promise<void> | void,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

/** 统一错误响应 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // Express 依据 4 个形参识别错误中间件，这个参数不能删
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    const body: { code: string; message: string; details?: unknown } = {
      code: err.code,
      message: err.message,
    };
    if (err.details !== undefined) body.details = err.details;
    res.status(err.status).json({ ok: false, error: body });
    return;
  }

  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      ok: false,
      error: { code: 'INVALID_JSON', message: '请求体不是合法 JSON' },
    });
    return;
  }

  console.error('[api] 未处理异常', err);
  res.status(500).json({
    ok: false,
    error: { code: 'INTERNAL_ERROR', message: '服务器内部错误，请查看后端控制台日志' },
  });
}

/** 兜底 404（只对 /api 生效，由 index.ts 的管线决定） */
export const apiNotFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({
    ok: false,
    error: { code: 'NOT_FOUND', message: '接口不存在' },
  });
};
