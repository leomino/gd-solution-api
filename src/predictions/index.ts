import { Hono } from 'hono'
import { db } from '@db';
import { and, eq } from 'drizzle-orm';
import { predictions } from '@schema';

const predictionsRoute = new Hono();

predictionsRoute.get('/:username', async (c) => {
    const { matchId } = c.req.query();
    const { username } = c.req.param();
    const result = await db.query.predictions.findFirst({
        where: and(
            eq(predictions.username, username),
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
