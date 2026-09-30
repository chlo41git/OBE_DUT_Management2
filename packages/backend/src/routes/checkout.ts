import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { getOperator } from '../lib/operator';
import { confirmCheckOut, scanOutSlot } from '../services/checkoutService';

export const checkoutRouter = Router();

checkoutRouter.post(
  '/checkout/scan-slot',
  asyncHandler(async (req, res) => {
    res.json(await scanOutSlot(String(req.body.code || '')));
  }),
);

checkoutRouter.post(
  '/checkout/confirm',
  asyncHandler(async (req, res) => {
    res.json(await confirmCheckOut(String(req.body.slotCode || ''), getOperator(req)));
  }),
);
