import cors from 'cors';
import express from 'express';
import { errorHandler } from './middleware/errorHandler';
import { areasRouter } from './routes/areas';
import { mapRouter } from './routes/map';
import { slotsRouter } from './routes/slots';
import { checkinRouter } from './routes/checkin';
import { checkoutRouter } from './routes/checkout';
import { manualSlotRouter } from './routes/manualSlot';
import { eventsRouter } from './routes/events';
import { dashboardRouter } from './routes/dashboard';

export function createApp() {
  const app = express();
  app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  app.use('/api', areasRouter);
  app.use('/api', mapRouter);
  app.use('/api', slotsRouter);
  app.use('/api', checkinRouter);
  app.use('/api', checkoutRouter);
  app.use('/api', manualSlotRouter);
  app.use('/api', eventsRouter);
  app.use('/api', dashboardRouter);

  app.use(errorHandler);
  return app;
}
