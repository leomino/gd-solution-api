import { db } from "@db";
import {communities, communityMembers, teams, tournaments, users} from "@schema";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { Hono } from "hono";
import { jwt } from "hono/jwt";

type Community = {
    name: string;
    id: string;
    tournament: {
        name: string;
        id: string;
        from: string;
        to: string;
    };
};

type User = {
    name: string;
    username: string;
    points: number;
    supports: {
        id: string;
        name: string;
        nameShort: string;
    } | null;
};

type Leaderboard = {
    community: Community;
    entries: LeaderboardEntry[]
}

type LeaderboardEntry = {
    user: User,
    position: number
};

const leaderboardsRoute = new Hono();
leaderboardsRoute.use(
    '*',
    jwt({
        secret: process.env.JWT_SECRET!
    })
);

leaderboardsRoute.get('/', async (c) => {
    const { sub } = c.get('jwtPayload');

    const joinedCommunities = await db.select({
        id: communities.id
    })
    .from(communityMembers)
    .where(eq(communityMembers.username, sub))
    .innerJoin(communities, eq(communityMembers.communityId, communities.id))

    let result: Leaderboard[] = []

    for (const communityId of joinedCommunities.map(({id}) => id)) {
        try {
            result.push(await getLeaderboardDataForCommunity(communityId, sub));
        } catch(error) {
            return c.json({ errorDescription: (error as Error).message}, 500);
        }
    }

    return c.json(result);
});

leaderboardsRoute.get('/:communityId', async (c) => {
    const { sub } = c.get('jwtPayload');
    const communityId = c.req.param('communityId')

    if (!communityId || !communityId.length) {
        return c.json({ errorDescription: "CommunityId cannot be empty." }, 400);
    }

    try {
        return c.json(await getLeaderboardDataForCommunity(communityId, sub));
    } catch(error) {
        return c.json({ errorDescription: (error as Error).message }, 500);
    }
});

leaderboardsRoute.get('/:communityId/pages', async (c) => {
    const { sub } = c.get('jwtPayload');
    const { offset, limit } = c.req.query();
    const { communityId } = c.req.param();

    const communityExists = await db.query.communityMembers.findFirst({
        where: eq(communityMembers.username, sub),
        columns: {
            communityId: true
        }
    });

    if (!communityExists) {
        return c.json({ errorDescription: "Community not found." }, 404);
    }

    const result = await db.select({
        user: users,
        supports: teams,
        position: communityMembers.position
    })
    .from(users)
    .innerJoin(communityMembers, and(
        eq(users.username, communityMembers.username),
        eq(communityMembers.communityId, communityId)
    ))
    .leftJoin(teams, eq(teams.id, users.supportsTeamId))
    .orderBy(desc(users.points), asc(users.joinedAt))
    .offset(Number(offset))
    .limit(Number(limit))

    return c.json(result.map(({user, supports, position}) => ({
        user: {
            ...user,
            supports,
            supportsTeamId: undefined,
            firebaseId: undefined
        },
        position
    })));
});

leaderboardsRoute.get('/:communityId/user-search', async (c) => {
    const { sub } = c.get('jwtPayload');
    const { communityId } = c.req.param();
    const { searchString } = c.req.query();
    const communityExists = await db.query.communityMembers.findFirst({
        where: eq(communityMembers.username, sub),
        columns: {
            communityId: true
        }
    });

    if (!communityExists) {
        return c.json({ errorDescription: "Community not found." }, 404);
    }

    const result = await db.select({
        user: users,
        supports: teams,
        position: communityMembers.position
    })
    .from(users)
    .innerJoin(communityMembers, eq(users.username, communityMembers.username))
    .where(and(
        eq(communityMembers.communityId, communityId),
        or(
            ilike(users.username, `%${searchString}%`),
            ilike(users.name, `%${searchString}%`)
        )
    ))
    .leftJoin(teams, eq(teams.id, users.supportsTeamId))
    .orderBy(desc(users.points), asc(users.joinedAt))

    return c.json(result.map(({user, supports, position}) => ({
        user: {
            ...user,
            supports,
            supportsTeamId: undefined,
            firebaseId: undefined
        },
        position
    })));
});

leaderboardsRoute.get('/:tournamentId/global', async (c) => {
    const { sub } = c.get('jwtPayload');
    const { tournamentId } = c.req.param();

    if (!tournamentId || !tournamentId.length) {
        return c.json({ errorDescription: "TournamentId cannot be empty." }, 400);
    }

    const tournament = await db.query.tournaments.findFirst({
        where: eq(tournaments.id, tournamentId),
    });

    if (!tournament) {
        return c.json({ errorDescription: "Tournament not found." }, 404);
    }

    const leaderboardData = await db.select({
        user: users,
        supports: teams
    })
    .from(users)
    .leftJoin(teams, eq(teams.id, users.supportsTeamId))
    .orderBy(desc(users.points), asc(users.joinedAt))

    let currentUserIndex;
    const entries = leaderboardData.map(({ user, supports }, index) => {
        const { firebaseId, supportsTeamId, ...rest } = user;
        if (user.username === sub) {
            currentUserIndex = index;
        }
        return {
            user: {
                ...rest,
                supports
            } as User,
            position: index + 1
        }
    });

    if (currentUserIndex == null) {
        return c.json({ errorDescription: "Current user not found." }, 404);
    }

    return c.json({
        community: {
            id: crypto.randomUUID(),
            name: "Global",
            tournament
        },
        entries: getLeaderboardPreviewMembers(entries, entries[currentUserIndex])
    });
})

const getLeaderboardDataForCommunity = async (communityId: string, sub: string) => {
    const communityData = await db.query.communityMembers.findFirst({
        where: and(eq(communityMembers.username, sub), eq(communityMembers.communityId, communityId)),
        with: {
            user: {
                with: {
                    supports: true,
                },
                columns: {
                    username: true,
                    name: true,
                    joinedAt: true,
                    points: true
                }
            },
            community: {
                with: {
                    tournament: true
                },
                columns: {
                    id: true,
                    name: true
                }
            }
        },
        columns: { position: true }
    });

    if (!communityData) {
        throw new Error('The community was not found.')
    }

    const leaderboardData = await db.select({
        user: users,
        supports: teams,
        position: communityMembers.position
    })
    .from(users)
    .innerJoin(communityMembers, and(
        eq(users.username, communityMembers.username),
        eq(communityMembers.communityId, communityId)
    ))
    .leftJoin(teams, eq(teams.id, users.supportsTeamId))
    .orderBy(desc(users.points), asc(users.joinedAt))

    return {
        community: communityData.community,
        entries: getLeaderboardPreviewMembers(leaderboardData.map(({ user, position, supports }) => {
            const { firebaseId, supportsTeamId, ...rest } = user;
            return {
                user: {
                    ...rest,
                    supports
                } as User,
                position
            }
        }), { user: communityData.user, position: communityData.position })
    }
}

const getLeaderboardPreviewMembers = (members: LeaderboardEntry[], currentUser: LeaderboardEntry): LeaderboardEntry[] => {
    const currentUserPosition = currentUser.position;
    const membersCount = members.length;

    let result: LeaderboardEntry[] = []
    if (currentUserPosition < 6) {
        result.push(...members.slice(0, Math.min(6, membersCount)));
        if (membersCount > 6) {
            result.push(members[membersCount - 1]);
        }
        return result;
    }

    if (currentUserPosition >= membersCount - 2) {
        return [...members.slice(0, 3), ...members.slice(-(Math.min(4, membersCount - 3)))];
    }

    return [...members.slice(0, 3), members[currentUserPosition - 2], currentUser, members[currentUserPosition], members[membersCount - 1]];
}

export default leaderboardsRoute;
