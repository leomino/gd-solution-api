import { db } from "@db";
import { users } from "@schema";
import { ilike } from "drizzle-orm";
import { Hono } from "hono";

const usersRoute = new Hono();

usersRoute.get('/', async (c) => {
    const usernameFilter = c.req.query('usernameFilter');
    let result
    if (!usernameFilter || !usernameFilter.length) {
        result = await db.query.users.findMany({
            with: {
                supports: true
            },
            columns: {
                name: true,
                points: true,
                username: true
            }
        });
    } else {
        result = await db.query.users.findMany({
            where: ilike(users.username, `${usernameFilter}%`),
            with: {
                supports: true
            },
            columns: {
                name: true,
                points: true,
                username: true
            }
        });
    }
    return c.json(result);
});

export default usersRoute;
