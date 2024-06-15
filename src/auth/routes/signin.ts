import { db } from '@db';
import { zValidator } from '@hono/zod-validator';
import { users } from '@schema';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { createJWT } from '../lib/token';

const app = new Hono()

type SignInResponse = {
    idToken: string;
    email: string;
    refreshToken: string;
    expiresIn: string;
    localId: string;
    registered: boolean;
}

const signInSchema = z.object({
    email: z.string(),
    password: z.string()
});

const signInRoute = app.post(
    '',
    zValidator('json', signInSchema, ({ success }, c) => {
        if (!success) return c.json({ errorDescription: 'Incorrect schema.' }, 400); 
    }),
    async (c) => {
        const schema = c.req.valid('json');
        
        const req = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`,
            {
                method: 'POST',
                body: JSON.stringify(schema)
            }
        );
        if (!req.ok) {
            const { error } = await req.json() as {
                error: {
                    code: number,
                    message: string,
                    errors: Array<Record<string, string>>[]
                }
            };
            return c.json({ errorDescription: error.message }, 401);
        }
        const res = await req.json() as SignInResponse;

        const user = await db.query.users.findFirst({
            where: eq(users.firebaseId, res.localId),
            with: {
                supports: true
            }
        });

        if (!user) {
            return c.json({ errorDescription: 'User not found.' }, 409);
        }

        const token = await createJWT(res.localId, user.username, user.role);

        const { role, firebaseId, supportsTeamId, ...relevantUserProperties } = user;

        return c.json({
            token,
            role,
            user: relevantUserProperties
        });
    }
);

export default signInRoute;