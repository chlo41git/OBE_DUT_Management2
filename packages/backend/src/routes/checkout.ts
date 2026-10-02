import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { getOperator } from '../lib/operator';
import { checkoutByUnit, registerManualSn } from '../services/checkoutService';

export const checkoutRouter = Router();

/** 刷退：刷機台 S/N 即釋放（POC v04-1） */
checkoutRouter.post(
  '/checkout/scan-unit',
  asyncHandler(async (req, res) => {
    res.json(await checkoutByUnit(String(req.body.sn || ''), getOperator(req)));
  }),
);

/** S/N 標籤破損手動輸入：只寫稽核紀錄 */
checkoutRouter.post(
  '/checkout/manual-sn',
  asyncHandler(async (req, res) => {
    res.json(await registerManualSn(String(req.body.sn || ''), String(req.body.reason || ''), getOperator(req)));
  }),
);
