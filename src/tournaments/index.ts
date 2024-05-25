import { Hono } from 'hono'
import { db } from '@db';
import { tournaments } from '@schema';

const tournamentsRoute = new Hono();

tournamentsRoute.get('/', async (c) => {
  const result = await db.select().from(tournaments);
  return c.json(result);
});

export default tournamentsRoute
