import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { getOperator } from '../lib/operator';
import { registerManualSlot } from '../services/manualSlotService';

export const manualSlotRouter = Router();

manualSlotRouter.post(
  '/manual-slot',
  asyncHandler(async (req, res) => {
    const operator = getOperator(req);
    res.json(await registerManualSlot(String(req.body.code || ''), String(req.body.reason || ''), operator));
  }),
);
