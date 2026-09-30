import { Router } from 'express';
import type { SystemConfigDTO } from '@obe/shared';
import { asyncHandler } from '../middleware/asyncHandler';
import { getOperator } from '../lib/operator';
import { CFG, BLOCK_REASONS } from '../lib/areaDefs';
import { SLOT_FORMAT_HINT } from '../lib/logic';
import { createRack, freeCountByArea, listAreas, listRacks, toggleRack } from '../services/rackService';

export const areasRouter = Router();

areasRouter.get(
  '/config',
  asyncHandler(async (_req, res) => {
    const cfg: SystemConfigDTO & { blockReasons: string[] } = { ...CFG, slotFormatHint: SLOT_FORMAT_HINT, blockReasons: BLOCK_REASONS };
    res.json(cfg);
  }),
);

areasRouter.get(
  '/areas',
  asyncHandler(async (_req, res) => {
    res.json(await listAreas());
  }),
);

areasRouter.get(
  '/areas/free-count',
  asyncHandler(async (_req, res) => {
    res.json(await freeCountByArea());
  }),
);

areasRouter.get(
  '/racks',
  asyncHandler(async (_req, res) => {
    res.json(await listRacks());
  }),
);

areasRouter.post(
  '/racks',
  asyncHandler(async (req, res) => {
    res.status(201).json(await createRack(String(req.body.areaCode || ''), getOperator(req)));
  }),
);

areasRouter.patch(
  '/racks/:code/toggle',
  asyncHandler(async (req, res) => {
    res.json(await toggleRack(req.params.code, getOperator(req)));
  }),
);
