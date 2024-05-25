import { Hono } from 'hono'
import { db } from '@db';
import { matchDays, matches } from '@schema';
import { asc } from 'drizzle-orm';

const matchDaysRoute = new Hono();

matchDaysRoute.get('/', async (c) => {
  const result = await db.query.matchDays.findMany({
    with: {
      matches: {
        with: {
          homeTeam: true,
          awayTeam: true,
          winnerTeam: true
        },
        columns: {
          id: true,
          homeTeamScore: true,
          awayTeamScore: true,
          startAt: true
        },
        orderBy: [asc(matches.startAt)]
      },
    },
    orderBy: [asc(matchDays.from)]
  });
  
  return c.json(result);
});

export default matchDaysRoute;
