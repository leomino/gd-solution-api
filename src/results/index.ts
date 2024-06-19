import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { Hono } from "hono";
import { jwt } from "hono/jwt";
import { db, redis} from "@db";
import { eq } from "drizzle-orm";
import { communityMembers, matchResults, predictions } from "@schema";

const resultUpdatePayload = z.object({
    matchId: z.string(),
    homeTeamScore: z.number(),
    awayTeamScore: z.number(),
    finalized: z.boolean()
});

const requestPointCalculationPayload = resultUpdatePayload;

const matchResultsRoute = new Hono();
matchResultsRoute.use(
    '*',
    jwt({
        secret: process.env.JWT_SECRET!
    })
);

/**
 * Updates the result of a specific match.
 * @Conditions:
 * - user has the admin role.
 */
matchResultsRoute.put(
    '/',
    zValidator('json', resultUpdatePayload, ({ success }, c) => {
        if (!success) return c.json({ errorDescription: 'Incorrect schema.' }, 400);
    }),
    async (c) => {
        const { role } = c.get('jwtPayload');
        const { matchId, ...rest } = c.req.valid('json');

        if (role != 'admin') {
            return c.json({ errorDescription: 'Missing privileges to update match results.' }, 403)
        }

        const matchExists = await db.query.matchResults.findFirst({
            where: eq(matchResults.matchId, matchId)
        });

        if (!matchExists) {
            return c.json({ errorDescription: 'Match not found.' }, 404);
        }

        const [result] = await db.update(matchResults)
            .set({matchId, ...rest})
            .where(eq(matchResults.matchId, matchId))
            .returning();

        return c.json(result);
    }
);

/**
 * Increments scores of all users that placed a prediction for the given match.
 */
matchResultsRoute.post(
    '/',
    zValidator('json', requestPointCalculationPayload, ({ success }, c) => {
        if (!success) return c.json({ errorDescription: 'Incorrect schema.' }, 400);
    }),
    async (c) => {
        const { role } = c.get('jwtPayload');
        const { matchId, ...matchResult } = c.req.valid('json');

        if (role != 'admin') {
            return c.json({ errorDescription: 'Missing privileges to update match results.' }, 403)
        }

        if (!matchResult.finalized) {
            return c.json({ errorDescription: 'Match has to be finalized for points calculation.' }, 409)
        }

        const predictionsToConsider = await db.select({
            homeTeamScore: predictions.homeTeamScore,
            awayTeamScore: predictions.awayTeamScore,
            username: predictions.username,
            communityId: communityMembers.communityId,
        })
        .from(predictions)
        .where(eq(predictions.matchId, matchId))
        .innerJoin(communityMembers, eq(communityMembers.username, predictions.username));

        const taskQueue = Array<Promise<number>>();

        for (const prediction of predictionsToConsider) {
            const { homeTeamScore, awayTeamScore, username, communityId } = prediction;
            if (homeTeamScore == matchResult.homeTeamScore && awayTeamScore == matchResult.awayTeamScore) {
                taskQueue.push(redis.zIncrBy(communityId, 8, username));
                console.log(communityId, 8, username, 'home', homeTeamScore, 'away', awayTeamScore);
                continue;
            }

            const isDraw = matchResult.homeTeamScore == matchResult.awayTeamScore;
            if (!isDraw && homeTeamScore - awayTeamScore == matchResult.homeTeamScore - matchResult.awayTeamScore) {
                taskQueue.push(redis.zIncrBy(communityId, 6, username));
                console.log(communityId, 6, username, 'home', homeTeamScore, 'away', awayTeamScore)
                continue;
            }

            const tendency = homeTeamScore - awayTeamScore == 0 ? 0 : homeTeamScore > awayTeamScore ? 1 : -1;
            const actualTendency = isDraw ? 0 : matchResult.homeTeamScore > matchResult.awayTeamScore ? 1 : -1;

            if (tendency == actualTendency) {
                taskQueue.push(redis.zIncrBy(communityId, 4, username));
                console.log(communityId, 4, username, 'home', homeTeamScore, 'away', awayTeamScore)
            }
        }

        return c.json(await Promise.all(taskQueue));
    }
)

export default matchResultsRoute;
