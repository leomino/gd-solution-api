import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { Hono } from "hono";
import { jwt } from "hono/jwt";
import { db } from "@db";
import { eq } from "drizzle-orm";
import { matchResults } from "@schema";

const resultUpdate = z.object({
    matchId: z.string(),
    homeTeamScore: z.number(),
    awayTeamScore: z.number(),
    finalized: z.boolean()
});

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
    zValidator('json', resultUpdate, ({ success }, c) => {
        if (!success) return c.json({ errorDescription: 'Incorrect schema.' }, 400);
    }),
    async (c) => {
        const { role } = c.get('jwtPayload');
        const { matchId, ...rest } = c.req.valid('json');

        if (role != 'admin') {
            return c.json({ errorDescription: 'Missing privileges for this operation.' }, 403)
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

export default matchResultsRoute;
