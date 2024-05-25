import { Hono } from 'hono'
import { db } from '@db';
import { teams } from '@schema';

const teamsRoute = new Hono()

teamsRoute.get('/', async (c) => {
  const result = await db.select().from(teams);
  return c.json(result);
});

export default teamsRoute
