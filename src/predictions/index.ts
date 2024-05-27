import { Hono } from 'hono'
import { db } from '@db';
import { and, eq, inArray } from 'drizzle-orm';
import { predictions } from '@schema';
import { jwt } from 'hono/jwt';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

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

const predictionBulkSchema = z.array(z.string());

predictionsRoute.post(
    '/',
    zValidator('json', predictionBulkSchema, ({ success }, c) => {
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
)

export default predictionsRoute;
