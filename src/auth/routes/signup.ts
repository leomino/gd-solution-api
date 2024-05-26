import { Hono } from "hono";
import { User, users } from "@schema";
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { createInsertSchema } from "drizzle-zod";
import { getAuth } from 'firebase';
import { UserRecord } from "firebase-admin/auth";
import { FirebaseError } from "firebase-admin";
import { db } from "@db";
import { createJWT } from "../lib/token";

const app = new Hono();

const signUpSchema = z.object({
    user: createInsertSchema(users),
    email: z.string(),
    password: z.string()
})

const signUpRoute = app.post('', 
    zValidator('json', signUpSchema, ({ success }, c) => {
        if (!success) return c.json({ error: 'Incorrect schema.' }, 400);
    }),
    async (c) => {
        const { email, password, user } = c.req.valid('json');

        let createdUser: UserRecord | undefined;
        
        try {
            createdUser = await getAuth().createUser({
                email,
                password
            });
        } catch (err: unknown) {
            const { message } = err as FirebaseError;
            return c.json({ message }, 409);
        }

        if (!createdUser) {
            return c.json({ message: 'Failed to create user.'}, 500);
        }

        const firebaseId = createdUser.uid;

        const [created] = await db.insert(users).values({ ...user, firebaseId }).returning({ username: users.username });

        const token = await createJWT(firebaseId, created.username);

        return c.json({ token }, 201);
    }
);

export default signUpRoute;
