import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@schema'

const connectionString = process.env.DATABASE_URL

const pool = new Pool({
    connectionString
});

export const db = drizzle(pool, { schema });

import { createClient } from 'redis';

export const redis = createClient({
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: 'redis-15341.c250.eu-central-1-1.ec2.redns.redis-cloud.com',
        port: 15341
    }
});

redis.connect();
redis.on('error', (err) => console.log('Redis Client Error', err));
