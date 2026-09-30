import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { listEventTypes, listMovements } from '../services/eventService';

export const eventsRouter = Router();

eventsRouter.get(
  '/events',
  asyncHandler(async (req, res) => {
    res.json(
      await listMovements({
        type: req.query.type as string | undefined,
        keyword: req.query.kw as string | undefined,
        sn: req.query.sn as string | undefined,
        limit: req.query.limit ? Math.min(Number(req.query.limit) || 300, 1000) : undefined,
      }),
    );
  }),
);

eventsRouter.get(
  '/events/types',
  asyncHandler(async (_req, res) => {
    res.json(await listEventTypes());
  }),
);
