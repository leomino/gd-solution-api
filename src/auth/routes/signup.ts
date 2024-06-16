import { Hono } from "hono";
import { users } from "@schema";
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { getAuth } from 'firebase';
import { UserRecord } from "firebase-admin/auth";
import { FirebaseError } from "firebase-admin";
import { db } from "@db";
import { createJWT } from "../lib/token";
import { eq } from "drizzle-orm";

const app = new Hono();

const signUpSchema = z.object({
    user: z.object({
        username: z.string(),
        name: z.string(),
        supports: z.object({
            id: z.string(),
            name: z.string(),
            nameShort: z.string()
        })
    }),
    email: z.string(),
    password: z.string()
});

const signUpRoute = app.post('', 
    zValidator('json', signUpSchema, ({ success }, c) => {
        if (!success) return c.json({ errorDescription: 'Incorrect schema.' }, 400);
    }),
    async (c) => {
        const { email, password, user } = c.req.valid('json');

        let createdFireBaseUser: UserRecord | undefined;
        
        const userNameTaken = await db.query.users.findFirst({
            where: eq(users.username, user.username)
        });

        if (userNameTaken) {
            return c.json({ errorDescription: 'Username already taken.' }, 500);
        }

        try {
            createdFireBaseUser = await getAuth().createUser({
                email,
                password
            });
        } catch (err: unknown) {
            const { message } = err as FirebaseError;
            return c.json({ errorDescription: message }, 424);
        }

        if (!createdFireBaseUser) {
            return c.json({ errorDescription: 'Failed to create user.'}, 500);
        }

        const firebaseId = createdFireBaseUser.uid;

        const [created] = await db.insert(users).values({ ...user, supportsTeamId: user.supports.id,firebaseId }).returning({ username: users.username });
        const token = await createJWT(firebaseId, created.username);

        const createdUser = await db.query.users.findFirst({
            where: eq(users.username, created.username),
            with: {
                supports: true
            },
            columns: {
                username: true,
                name: true,
                points: true,
                joinedAt: true,
            }
        });

        if (!createdUser) {
            // cascade delete firebase user or try again?
            return c.json({ errorDescription: 'Failed to create user.'}, 500);
        }

        return c.json({
            token,
            user: createdUser
        }, 201);
    }
);

export default signUpRoute;
