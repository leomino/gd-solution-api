import { Hono } from 'hono'
import { db } from '@db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { predictions } from '@schema';
import { jwt } from 'hono/jwt';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { logger } from 'hono/logger';

const predictionsRoute = new Hono();
predictionsRoute.use(
    '*',
    jwt({
        secret: process.env.JWT_SECRET!
    })
);

predictionsRoute.get('/', async (c) => {
    const { sub } = c.get('jwtPayload');
    const { matchId } = c.req.query();
    const result = await db.query.predictions.findFirst({
        where: and(
            eq(predictions.username, sub),
            eq(predictions.matchId, matchId)
        ),
        columns: {
            matchId: true,
            awayTeamScore: true,
            homeTeamScore: true
        }
    });
    return c.json(result ?? null);
});

const predictionBulkRequestSchema = z.array(z.string());

predictionsRoute.post(
    '/',
    zValidator('json', predictionBulkRequestSchema, ({ success }, c) => {
        if (!success) return c.json({ error: 'Incorrect schema.' }, 400); 
    }),
    async (c) => {
        const { sub } = c.get('jwtPayload');
        const matchIds = c.req.valid('json');
        const result = await db.query.predictions.findMany({
            where: and(
                eq(predictions.username, sub),
                inArray(predictions.matchId, matchIds)
            ),
            columns: {
                matchId: true,
                awayTeamScore: true,
                homeTeamScore: true
            }
        });
        return c.json(result);
    }
);

const predictionCreateOrUpdate = z.object({
    homeTeamScore: z.number(),
    awayTeamScore: z.number()
});

predictionsRoute.put(
    '/',
    zValidator('json', predictionCreateOrUpdate, ({ success }, c) => {
        if (!success) return c.json({ error: 'Incorrect schema.' }, 400); 
    }),
    async (c) => {
        const { sub } = c.get('jwtPayload');
        const matchId = c.req.query('matchId');
        if (!matchId) {
            return c.json({ error: 'Incorrect schema.' }, 400);
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
