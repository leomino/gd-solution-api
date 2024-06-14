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

// get all matches including predictions for current-user.
matchesRoute.get('/', async (c) => {
  const { sub } = c.get('jwtPayload');
  return c.json(await getAllMatches(sub));
});

// get currently playing or next matches
matchesRoute.get('/next', async (c) => {
  const { sub } = c.get('jwtPayload');
  const result = await getAboutToStart(sub);
  return c.json(result);
});

const getAllMatches = async (currentUsername: string) => {
  const result = await db.query.matches.findMany({
    with: {
      homeTeam: true,
      awayTeam: true,
      result: {
        columns: {
          matchId: true,
          finalized: true,
          homeTeamScore: true,
          awayTeamScore: true,
        }
      },
      predictions: {
        where: eq(predictions.username, currentUsername),
        columns: {
          awayTeamScore: true,
          homeTeamScore: true
        }
      }
    },
    columns: {
      id: true,
      startAt: true
    },
    orderBy: asc(matches.startAt)
  });
  return result.map(({ predictions, ...rest}) => ({ ...rest, prediction: predictions[0] ?? null }));
}

const getAboutToStart = async (currentUsername: string) => {
  const result = await db.query.matches.findMany({
    with: {
      homeTeam: true,
      awayTeam: true,
      result: {
        columns: {
          matchId: true,
          finalized: true,
          homeTeamScore: true,
          awayTeamScore: true,
        }
      },
      predictions: {
        where: eq(predictions.username, currentUsername),
        columns: {
          awayTeamScore: true,
          homeTeamScore: true
        }
      }
    },
    columns: {
      id: true,
      startAt: true
    },
    orderBy: asc(matches.startAt),
    limit: 3
  });

  return result.map(({ predictions, ...rest}) => ({ ...rest, prediction: predictions[0] ?? null }));
}

export default matchesRoute;
