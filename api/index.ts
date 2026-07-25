import { handle } from '@hono/node-server/vercel';
import app from '../dist/src/index.js';

export default handle(app);
