import 'dotenv/config';
import { createApp } from './app';

const port = Number(process.env.PORT || 4000);
const app = createApp();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`OBE DUT backend listening on http://localhost:${port}`);
});
