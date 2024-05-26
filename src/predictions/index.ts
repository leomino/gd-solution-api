import { Hono } from 'hono'
import { db } from '@db';
import { and, eq } from 'drizzle-orm';
import { predictions } from '@schema';
import { jwt } from 'hono/jwt';

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
            username: true,
            awayTeamScore: true,
            homeTeamScore: true
        }
    });
    return c.json(result ?? null);
});

export default predictionsRoute;
