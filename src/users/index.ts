import { Hono } from 'hono'
import { db } from '@db';
import {inArray} from "drizzle-orm";
import {users} from "@schema";
import {zValidator} from "@hono/zod-validator";
import {z} from "zod";

const usersRoute = new Hono();

const getUserBulk = z.array(z.string());

// secure users data behind auth wall?
usersRoute.post(
    '/',
    zValidator('json', getUserBulk, ({success}, c) => {
        if (!success) return c.json({ errorDescription: 'Incorrect schema.' }, 400);
    }),
    async (c) => {
    const usernames = c.req.valid('json');
    const result = await db.query.users.findMany({
        where: inArray(users.username, usernames),
        with: {
            supports: true
        },
        columns: {
            username: true,
            name: true,
            joinedAt: true
        }
    });
    return c.json(result);
});

export default usersRoute;
