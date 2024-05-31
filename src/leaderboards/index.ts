import { db } from "@db";
import { communities, communities, communityMembers, teams, tournaments, users } from "@schema";
import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { Hono } from "hono";
import { jwt } from "hono/jwt";

const leaderboardsRoute = new Hono();

leaderboardsRoute.use(
    '*',
    jwt({
        secret: process.env.JWT_SECRET!
    })
);

leaderboardsRoute.get('/search', async (c) => {
    const { sub } = c.get('jwtPayload');
    const { communityId, searchString } = c.req.query();
    const communityExists = await db.query.communityMembers.findFirst({
        where: eq(communityMembers.username, sub),
        columns: {
            communityId: true
        }
    });

    if (!communityExists) {
        return c.json({ message: "Unauthorized access to leaderboard preview." }, 401);
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

// get paginations for leaderboard
leaderboardsRoute.get('/', async (c) => {
    const { sub } = c.get('jwtPayload');
    const { communityId, offset, limit } = c.req.query();
    
    const communityExists = await db.query.communityMembers.findFirst({
        where: eq(communityMembers.username, sub),
        columns: {
            communityId: true
        }
    });

    if (!communityExists) {
        return c.json({ message: "Community not found." }, 404);
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

leaderboardsRoute.get('/previews/:communityId', async (c) => {
    const { sub } = c.get('jwtPayload');
    const communityId = c.req.param('communityId')

    if (!communityId) {
        return c.json({ message: "CommunityId must be provided." }, 400);
    }

    return c.json(await getLeaderboardDataForCommunity(communityId, sub));
});

leaderboardsRoute.get('/previews', async (c) => {
    const { sub } = c.get('jwtPayload');

    const joinedCommunities = await db.select({
        id: communities.id
    })
    .from(communityMembers)
    .where(eq(communityMembers.username, sub))
    .innerJoin(communities, eq(communityMembers.communityId, communities.id))
    
    let result: { community: Community, entries: { user: User, position: number }[] }[] = []

    for (const communityId of joinedCommunities.map(({id}) => id)) {
        result.push(await getLeaderboardDataForCommunity(communityId, sub));
    }

    return c.json(result);
  });

  type Community = {
    name: string;
    id: string;
    tournament: {
        name: string;
        id: string;
        from: string;
        to: string;
    };
}

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
  
  /**
   * O(n) due to finding the currentUserIndex -> still faster then db.query(currentUser) because how many members are there gonna be? even with 2 mio members, its fast ah.
   */
  const getLeaderboardPreviewMembers = (members: { user: User, position: number }[], currentUser: { user: User, position: number }) => {
    let result: { user: User, position: number }[] = [];
    const currentUserIndex = currentUser.position - 1;
  
    const topThree = Math.min(3, currentUserIndex + 1);
  
    result = members.slice(0, topThree);
  
    if (members.length < 4) {
        return result;
    }
  
    if (currentUserIndex > 2) {
        if (currentUserIndex > 3) {
            result.push(members[currentUserIndex - 1]);
        }
        result.push(currentUser);
    }
  
    const afterCurrentUser = currentUserIndex + 1;
    if (members.length > afterCurrentUser) {
      result.push(members[afterCurrentUser]);
    }
  
    const lastPlace = members.length - 1
    if (lastPlace > afterCurrentUser) {
      result.push(members[lastPlace]);
    }
    return result;
  }

  export default leaderboardsRoute;