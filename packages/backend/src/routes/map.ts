import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { findUnitLocation, getUnitOrThrow, listSlotsForMap } from '../services/slotService';

export const mapRouter = Router();

mapRouter.get(
  '/map/slots',
  asyncHandler(async (req, res) => {
    res.json(await listSlotsForMap(req.query.rackCode as string | undefined));
  }),
);

mapRouter.get(
  '/map/find',
  asyncHandler(async (req, res) => {
    res.json(await findUnitLocation(String(req.query.kw || '')));
  }),
);

mapRouter.get(
  '/units/:sn',
  asyncHandler(async (req, res) => {
    res.json(await getUnitOrThrow(req.params.sn));
  }),
);
