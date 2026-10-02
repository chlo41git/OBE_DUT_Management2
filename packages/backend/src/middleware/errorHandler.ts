import type { ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { HttpError } from '../lib/httpError';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ code: err.code, message: err.message, details: err.details });
    return;
  }
  // 唯一鍵衝突：通常是同一筆操作被重複送出（例如同一個新 S/N 同時臨時建檔），由另一筆交易搶先完成
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    res.status(409).json({ code: 'DUPLICATE_SUBMIT', message: '資料已被其他操作更新（可能是重複送出），請重新刷取' });
    return;
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ code: 'INTERNAL_ERROR', message: '系統發生未預期錯誤' });
};
