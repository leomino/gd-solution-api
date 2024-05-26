import { Hono } from 'hono'
import { db } from '@db';
import { matches } from '@schema';
import { asc, sql } from 'drizzle-orm';

const matchesRoute = new Hono()

matchesRoute.get('/', async (c) => {
  const result = await db.query.matches.findMany({
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
  });
  return c.json(result);
});

matchesRoute.get('/next', async (c) => {
  const currentTime = new Date();
  const currentDate = currentTime.toISOString().split('T')[0];
  let result = await db.query.matches.findMany({
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
    where: sql`(${matches.startAt} <= ${currentTime} AND ${matches.startAt} + interval '95 minutes' >= ${currentTime}) OR ${matches.startAt}::date = ${currentDate}`,
  });
  if (!result.length) {
    result = await db.query.matches.findMany({
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
      where: sql`${matches.startAt} > now()`,
      orderBy: asc(matches.startAt),
      limit: 3
    });
  }
  return c.json(result);
});

export default matchesRoute
