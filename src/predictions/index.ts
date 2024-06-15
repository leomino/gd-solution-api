import { Hono } from 'hono'
import { db } from '@db';
import { eq } from 'drizzle-orm';
import { matches, predictions } from '@schema';
import { jwt } from 'hono/jwt';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const predictionCreateOrUpdate = z.object({
    homeTeamScore: z.number(),
    awayTeamScore: z.number()
});

const predictionsRoute = new Hono();
predictionsRoute.use(
    '*',
    jwt({
        secret: process.env.JWT_SECRET!
    })
);

/**
 * Place or update a match prediction.
 * @Conditions:
 * - Match exists.
 * - Match has not started.
 */
predictionsRoute.put(
    '/',
    zValidator('json', predictionCreateOrUpdate, ({ success }, c) => {
        if (!success) return c.json({ errorDescription: 'Incorrect schema.' }, 400); 
    }),
    async (c) => {
        const { sub } = c.get('jwtPayload');
        const matchId = c.req.query('matchId');
        if (!matchId) {
            return c.json({ errorDescription: 'Incorrect schema.' }, 400);
        }
        
        const match = await db.query.matches.findFirst({
            where: eq(matches.id, matchId)
        });

        if (!match) {
            return c.json({ errorDescription: 'Match not found' }, 404);
        }

        const currentTime = new Date();
        const matchStartAt = new Date(match.startAt)

        if (matchStartAt < currentTime) {
            return c.json({ errorDescription: 'Its not allowed to bet on matches that have already started or are over.' }, 409);
        }

        const prediction = c.req.valid('json');
        const upserted = await db.insert(predictions)
            .values({
                ...prediction,
                matchId, 
                username: sub
            })
            .onConflictDoUpdate({
                target: [predictions.matchId, predictions.username],
                set: {
                    homeTeamScore: prediction.homeTeamScore,
                    awayTeamScore: prediction.awayTeamScore
                }
            })
            .returning();
        const { homeTeamScore, awayTeamScore } = upserted[0];
        return c.json({ homeTeamScore, awayTeamScore });
    }
);

export default predictionsRoute;
