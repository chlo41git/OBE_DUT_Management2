import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { getOperator } from '../lib/operator';
import { blockLeftCheckIn, commitCheckIn, rejectCheckIn, scanSlot, scanUnit } from '../services/checkinService';

export const checkinRouter = Router();

checkinRouter.post(
  '/checkin/scan-slot',
  asyncHandler(async (req, res) => {
    res.json(await scanSlot(String(req.body.code || '')));
  }),
);

checkinRouter.post(
  '/checkin/scan-unit',
  asyncHandler(async (req, res) => {
    res.json(await scanUnit(String(req.body.slotCode || ''), String(req.body.sn || '')));
  }),
);

checkinRouter.post(
  '/checkin/reject',
  asyncHandler(async (req, res) => {
    res.json(await rejectCheckIn(String(req.body.slotCode || ''), String(req.body.sn || ''), getOperator(req)));
  }),
);

checkinRouter.post(
  '/checkin/block-left',
  asyncHandler(async (req, res) => {
    res.json(await blockLeftCheckIn(String(req.body.slotCode || ''), String(req.body.sn || ''), getOperator(req)));
  }),
);

checkinRouter.post(
  '/checkin/commit',
  asyncHandler(async (req, res) => {
    res.json(
      await commitCheckIn(
        {
          slotCode: String(req.body.slotCode || ''),
          sn: String(req.body.sn || ''),
          decision: req.body.decision,
          reason: req.body.reason,
        },
        getOperator(req),
      ),
    );
  }),
);
