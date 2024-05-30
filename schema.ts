import { relations } from "drizzle-orm";
import { boolean, date, integer, pgTable, primaryKey, smallint, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const teams = pgTable('Team', {
    id: uuid('id').primaryKey(),
    name: varchar('name', { length: 256 }).notNull(),
    nameShort: varchar('nameShort', { length: 3 }).notNull(),
});

export const matchDays = pgTable('MatchDay', {
    id: uuid('id').primaryKey().defaultRandom(),
    from: date('from').notNull(),
    to: date('to').notNull()
});

export const matches = pgTable('Match', {
    id: uuid('id').primaryKey().defaultRandom(),
    matchDayId: uuid('matchDayId').references(() => matchDays.id).notNull(),
    homeTeamId: uuid('homeTeamId').references(() => teams.id).notNull(),
    awayTeamId: uuid('awayTeamId').references(() => teams.id).notNull(),
    startAt: timestamp('startAt', { mode: 'string' }).notNull().defaultNow(),
});

export const tournaments = pgTable('Tournament', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    from: date('from').notNull(),
    to: date('to').notNull()
});

export const tournamentsRelations = relations(tournaments, ({ many }) => ({
    communities: many(communities),
}));

export const communities = pgTable('Community', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    tournamentId: uuid('tournamentId').references(() => tournaments.id).notNull()
});

export const communitiesRelations = relations(communities, ({ one, many }) => ({
    tournament: one(tournaments, {
        fields: [communities.tournamentId],
        references: [tournaments.id],
    }),
    members: many(communityMembers),
    pinned: many(communityPinnedMembers)
}));

export const users = pgTable('User', {
    firebaseId: varchar('firebaseId', { length: 256 }),
    username: text('username').notNull().primaryKey(),
    name: text('name').notNull(),
    supportsTeamId: uuid('supportsTeamId').references(() => teams.id),
    points: integer('points').notNull().default(0),
    joinedAt: timestamp('joinedAt', { mode: 'string' }).notNull().defaultNow()
});

export const communityPinnedMembers = pgTable('CommunityPinnedMembers', {
    username: text('username').notNull().references(() => users.username),
    communityId: uuid('communityId').notNull().references(() => communities.id),
    pinned: text('pinned').references(() => users.username)
}, (table) => {
    return {
        id: primaryKey({ columns: [table.username, table.communityId, table.pinned] }),
    };
});

export const communityPinnedMembersRelation = relations(communityPinnedMembers, ({ one }) => ({
    user: one(users, {
        fields: [communityPinnedMembers.username],
        references: [users.username]
    }),
    community: one(communities, {
        fields: [communityPinnedMembers.communityId],
        references: [communities.id]
    }),
    pinnedUser: one(users, {
        fields: [communityPinnedMembers.pinned],
        references: [users.username]
    })
}));

export const usersRelations = relations(users, ({ one, many }) => ({
    communities: many(communityMembers),
    supports: one(teams, {
        fields: [users.supportsTeamId],
        references: [teams.id],
    }),
}));

export const communityMembers = pgTable('CommunityMembers', {
    username: text('username').notNull().references(() => users.username),
    communityId: uuid('communityId').notNull().references(() => communities.id),
}, (table) => {
    return {
        id: primaryKey({ columns: [table.username, table.communityId] }),
    };
});

export const communityMembersRelations = relations(communityMembers, ({ one }) => ({
    user: one(users, {
        fields: [communityMembers.username],
        references: [users.username],
    }),
    community: one(communities, {
        fields: [communityMembers.communityId],
        references: [communities.id],
    }),
}));

export const predictions = pgTable('Prediction', {
    matchId: uuid('matchId').notNull().references(() => matches.id),
    username: text('username').notNull().references(() => users.username),
    homeTeamScore: smallint('homeTeamScore').notNull(),
    awayTeamScore: smallint('awayTeamScore').notNull()
}, (table) => {
    return {
        id: primaryKey({ columns: [table.matchId, table.username] }),
    };
});

export const predictionsRelations = relations(predictions, ({one}) => ({
    match: one(matches, {
        fields: [predictions.matchId],
        references: [matches.id]
    }),
    user: one(users, {
        fields: [predictions.username],
        references: [users.username]
    })
}));

export const matchDaysRelations = relations(matchDays, ({ many }) => ({
    matches: many(matches),
}));

export const matchResults = pgTable('MatchResults', {
    matchId: uuid('matchId').notNull().primaryKey().references(() => matches.id),
    homeTeamScore: smallint('homeTeamScore').notNull().default(0),
    awayTeamScore: smallint('awayTeamScore').notNull().default(0),
    finalized: boolean('finalized').notNull().default(false)
});

export const matchesRelations = relations(matches, ({ one, many }) => ({
    matchDay: one(matchDays, {
        fields: [matches.matchDayId],
        references: [matchDays.id]
    }),
    homeTeam: one(teams, {
        fields: [matches.homeTeamId],
        references: [teams.id]
    }),
    awayTeam: one(teams, {
        fields: [matches.awayTeamId],
        references: [teams.id]
    }),
    result: one(matchResults, {
        fields: [matches.id],
        references: [matchResults.matchId]
    }),
    predictions: many(predictions)
}));
