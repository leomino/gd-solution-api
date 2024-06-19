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
import leaderboardsRoute from './leaderboards';
import usersRoute from "./users";
import matchResultsRoute from "./results";

assert(process.env.DATABASE_URL, 'DATABASE_URL is not defined');

const app = new Hono();
app.use('*', logger());

app
    .basePath('/api')
    .route('auth', authRoutes)
    .route('match-days', matchDaysRoute)
    .route('teams', teamsRoute)
    .route('users', usersRoute)
    .route('matches', matchesRoute)
    .route('tournaments', tournamentsRoute)
    .route('communities', communitiesRoute)
    .route('leaderboards', leaderboardsRoute)
    .route('predictions', predictionsRoute)
    .route('results', matchResultsRoute)

Bun.serve(app);