import { strict as assert } from 'node:assert';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import matchDaysRoute from './matchDays';
import teamsRoute from './teams';
import matchesRoute from './matches';
import tournamentsRoute from './tournaments';
import communitiesRoute from './communities';
import predictionsRoute from './predictions';
import authRoutes from './auth';
import usersRoute from './users';

assert(process.env.DATABASE_URL, 'DATABASE_URL is not defined');

const app = new Hono();
app.use('*', logger());

app
    .basePath('/api')
    .route('auth', authRoutes)
    .route('match-days', matchDaysRoute)
    .route('teams', teamsRoute)
    .route('matches', matchesRoute)
    .route('tournaments', tournamentsRoute)
    .route('communities', communitiesRoute)
    .route('predictions', predictionsRoute)
    .route('users', usersRoute)

export default app;
