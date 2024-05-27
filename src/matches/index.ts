import { Hono } from 'hono'
import { db } from '@db';
import { matches, predictions } from '@schema';
import { asc, eq, sql } from 'drizzle-orm';
import { jwt } from 'hono/jwt';

const matchesRoute = new Hono()
matchesRoute.use(
  '*',
  jwt({
      secret: process.env.JWT_SECRET!
  })
);

matchesRoute.get('/', async (c) => {
  const { sub } = c.get('jwtPayload');
  const result = await db.query.matches.findMany({
    with: {
      homeTeam: true,
      awayTeam: true,
      winnerTeam: true,
      predictions: {
        where: eq(predictions.username, sub),
        columns: {
          awayTeamScore: true,
          homeTeamScore: true
        }
      }
    },
    columns: {
      id: true,
      homeTeamScore: true,
      awayTeamScore: true,
      startAt: true
    },
    orderBy: [asc(matches.startAt)]
  });
  return c.json(result.map(({ predictions, ...rest}) => ({ ...rest, prediction: predictions[0] ?? null })));
});

matchesRoute.get('/next', async (c) => {
  const { sub } = c.get('jwtPayload');
  const currentTime = new Date();
  const currentDate = currentTime.toISOString().split('T')[0];
  let result = await db.query.matches.findMany({
    with: {
      homeTeam: true,
      awayTeam: true,
      winnerTeam: true,
      predictions: {
        where: eq(predictions.username, sub),
        columns: {
          awayTeamScore: true,
          homeTeamScore: true
        }
      }
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
        winnerTeam: true,
        predictions: {
          where: eq(predictions.username, sub),
          columns: {
            awayTeamScore: true,
            homeTeamScore: true
          }
        }
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
  return c.json(result.map(({ predictions, ...rest}) => ({ ...rest, prediction: predictions[0] ?? null })));
});

export default matchesRoute
