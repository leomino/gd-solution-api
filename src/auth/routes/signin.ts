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
        if (!success) return c.json({ error: 'Incorrect schema.' }, 400); 
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
            return c.json({ message: req.statusText }, 401);
        }
        const res = await req.json() as SignInResponse;

        const user = await db.query.users.findFirst({
            where: eq(users.firebaseId, res.localId),
            with: {
                supports: true
            }
        });

        if (!user) {
            return c.json({
                message: 'User not found.'
            }, 412);
        }

        const token = await createJWT(res.localId, user.username);

        return c.json({
            token,
            user
        });
    }
);

export default signInRoute;