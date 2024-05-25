import { relations } from "drizzle-orm";
import {date, integer, pgTable, smallint, text, timestamp, uuid, varchar} from "drizzle-orm/pg-core";

export const teams = pgTable('Team', {
    id: uuid('id').primaryKey(),
    name: varchar('name', { length: 256 }).notNull(),
    nameShort: varchar('nameShort', { length: 3 }).notNull(),
});

export const matchDays = pgTable('MatchDay', {
    id: uuid('id').primaryKey(),
    from: date('from').notNull(),
    to: date('to').notNull()
});

export const matches = pgTable('Match', {
    id: uuid('id').primaryKey(),
    matchDayId: uuid('matchDayId').references(() => matchDays.id).notNull(),
    homeTeamId: uuid('homeTeamId').references(() => teams.id).notNull(),
    awayTeamId: uuid('awayTeamId').references(() => teams.id).notNull(),
    homeTeamScore: smallint('homeTeamScore'),
    awayTeamScore: smallint('awayTeamScore'),
    winnerTeamId: uuid('winnerTeamId').references(() => teams.id),
    startAt: timestamp('startAt', { mode: 'string' }).notNull().defaultNow(),
});

export const tournaments = pgTable('Tournament', {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    from: date('from').notNull(),
    to: date('to').notNull()
});

export const tournamentsRelations = relations(tournaments, ({ many }) => ({
    communities: many(communities),
}));

export const communities = pgTable('Community', {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    tournamentId: uuid('tournamentId').references(() => tournaments.id).notNull()
});

export const communitiesRelations = relations(communities, ({ one, many }) => ({
    tournament: one(tournaments, {
        fields: [communities.tournamentId],
        references: [tournaments.id],
    }),
    members: many(communityMembers),
}));

export const users = pgTable('User', {
    username: uuid('username').primaryKey(),
    name: text('name').notNull(),
    supportsTeamId: uuid('supportsTeamId').references(() => teams.id),
    points: integer('points').notNull().default(0)
});

export const usersRelations = relations(users, ({ one, many }) => ({
    community: many(communityMembers),
    supports: one(teams, {
        fields: [users.supportsTeamId],
        references: [teams.id],
    }),
}));

export const communityMembers = pgTable('CommunityMembers', {
    username: text('username').notNull().references(() => users.username),
    communityId: uuid('communityId').notNull().references(() => communities.id),
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





export const matchDaysRelations = relations(matchDays, ({ many }) => ({
    matches: many(matches),
}));

export const matchesRelations = relations(matches, ({ one }) => ({
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
    winnerTeam: one(teams, {
        fields: [matches.winnerTeamId],
        references: [teams.id]
    })
}));
