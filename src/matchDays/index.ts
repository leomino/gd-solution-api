import { Hono } from 'hono'
import { db } from '@db';
import { matchDays, matches, predictions } from '@schema';
import { asc, eq } from 'drizzle-orm';
import { jwt } from 'hono/jwt';

const matchDaysRoute = new Hono();
matchDaysRoute.use(
  '*',
  jwt({
      secret: process.env.JWT_SECRET!
  })
);

matchDaysRoute.get('/', async (c) => {
  const { sub } = c.get('jwtPayload');
  const result = await db.query.matchDays.findMany({
    with: {
      matches: {
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
      },
    },
    orderBy: [asc(matchDays.from)]
  });
  
  return c.json(result.map(({ matches, ...rest }) => ({...rest, matches: matches.map(({predictions, ...rest}) => ({...rest, prediction: predictions[0] ?? null}))})));
});

export default matchDaysRoute;
