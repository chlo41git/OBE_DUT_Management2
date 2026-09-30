import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { getDashboard } from '../services/dashboardService';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    res.json(await getDashboard());
  }),
);
