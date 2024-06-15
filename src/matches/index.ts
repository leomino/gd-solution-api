import { Hono } from 'hono'
import { db } from '@db';
import { matchResults, matches, predictions, stadiums, teams } from '@schema';
import { asc, eq, and } from 'drizzle-orm';
import { jwt } from 'hono/jwt';
import { alias } from 'drizzle-orm/pg-core';

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
      },
      stadium: true
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
  const homeTeam = alias(teams, "homeTeam");
  const awayTeam = alias(teams, "awayTeam");
  const result = await db.select({
    id: matches.id,
    startAt: matches.startAt,
    homeTeam,
    awayTeam,
    result: matchResults,
    stadium: stadiums,
    prediction: predictions
  })
  .from(matches)
  .leftJoin(homeTeam, eq(homeTeam.id, matches.homeTeamId))
  .leftJoin(awayTeam, eq(awayTeam.id, matches.awayTeamId))
  .leftJoin(matchResults, eq(matchResults.matchId, matches.id))
  .leftJoin(stadiums, eq(stadiums.id, matches.stadiumId))
  .leftJoin(predictions, and(
    eq(predictions.matchId, matches.id),
    eq(predictions.username, currentUsername)
  ))
  .where(eq(matchResults.finalized, false))
  .orderBy(asc(matches.startAt))
  .limit(3);

  return result;
}

export default matchesRoute;
