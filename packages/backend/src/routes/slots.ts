import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { getOperator } from '../lib/operator';
import { blockSlot, unblockSlot } from '../services/rackService';

export const slotsRouter = Router();

slotsRouter.patch(
  '/slots/:code/block',
  asyncHandler(async (req, res) => {
    const operator = getOperator(req);
    res.json(await blockSlot(req.params.code, String(req.body.reason || ''), operator));
  }),
);

slotsRouter.patch(
  '/slots/:code/unblock',
  asyncHandler(async (req, res) => {
    const operator = getOperator(req);
    res.json(await unblockSlot(req.params.code, operator));
  }),
);
