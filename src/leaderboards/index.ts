import { db } from "@db";
import { communityMembers, teams, users } from "@schema";
import { and, asc, desc, eq, ilike, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { jwt } from "hono/jwt";

const leaderboardsRoute = new Hono();

leaderboardsRoute.use(
    '*',
    jwt({
        secret: process.env.JWT_SECRET!
    })
);

leaderboardsRoute.get('/filter', async (c) => {
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
        supports: teams
    })
    .from(users)
    .innerJoin(communityMembers, eq(users.username, communityMembers.username))
    .where(eq(communityMembers.communityId, communityId))
    .leftJoin(teams, eq(teams.id, users.supportsTeamId))
    .orderBy(desc(users.points), asc(users.joinedAt))

    return c.json(result.map((entry, index) => ({
        user: {
            ...entry.user,
            supports: entry.supports,
            supportsTeamId: undefined,
            firebaseId: undefined
        },
        position: index + 1
    })).filter(({user}) => `${user.username}${user.name}`.toLowerCase().includes(searchString.toLowerCase())));
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
        return c.json({ message: "Unauthorized access to leaderboard preview." }, 401);
    }

    const result = await db.select({
        user: users,
        supports: teams
    })
    .from(users)
    .innerJoin(communityMembers, eq(users.username, communityMembers.username))
    .where(eq(communityMembers.communityId, communityId))
    .leftJoin(teams, eq(teams.id, users.supportsTeamId))
    .orderBy(desc(users.points), asc(users.joinedAt))

    const sliceStart = Number(offset);
    const sliceEnd = sliceStart + Number(limit);

    return c.json(result.map((entry, index) => ({
        user: {
            ...entry.user,
            supports: entry.supports,
            supportsTeamId: undefined,
            firebaseId: undefined
        },
        position: index + 1
    })).slice(sliceStart, sliceEnd));
});

leaderboardsRoute.get('/previews', async (c) => {
    const { sub } = c.get('jwtPayload');
  
    // const subsCommunities = await db.select({
    //     id: communities.id,
    //     name: communities.name,
    //     tournamentId: communities.tournamentId
    // })
    // .from(communityMembers)
    // .where(eq(communityMembers.username, sub))
    // .innerJoin(communities, eq(communities.id, communityMembers.communityId));

    const attendingCommunities = await db.query.communityMembers.findMany({
        where: eq(communityMembers.username, sub),
        with: {
            community: {
                with: {
                    tournament: true,
                    members: {
                        with: {
                            user: {
                                with: {
                                    supports: true
                                },
                                columns: {
                                    username: true,
                                    name: true,
                                    points: true,
                                    joinedAt: true
                                }
                            }
                        },
                        columns: { }
                    }
                }
            }
        },
        columns: {}
    });

    if (!attendingCommunities.length) {
        return c.json([]);
    }

    const result = attendingCommunities.map(({ community }) => ({
        community: { ...community, members: undefined, tournamentId: undefined },
        entries: getLeaderboardPreviewMembers(community.members.map(({user}) => user).sort((a, b) => b.points != a.points ? b.points - a.points : new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()), sub)
      }));
      return c.json(result);
  });

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
  const getLeaderboardPreviewMembers = (members: User[], currentUsername: string) => {
    let result: { user: User, position: number }[] = [];
    const currentUserIndex = members.findIndex(({username}) => username == currentUsername);
  
    if (currentUserIndex == -1) {
      throw new Error('Unauthorized access to leaderboard preview.');
    }
  
    const topThree = Math.min(3, currentUserIndex + 1);
  
    result = [...members.slice(0, topThree).map((user, index) => ({ user, position: index + 1 }))];
  
    if (members.length < 4) {
      return result;
    }
  
    if (currentUserIndex > 2) {
      result.push({ user: members[currentUserIndex], position: currentUserIndex + 1 });
    }
    
    const beforeCurrentUser = currentUserIndex - 1;
    if (currentUserIndex > 3) {
      result.push({ user: members[beforeCurrentUser], position: beforeCurrentUser + 1 });
    }
  
    const afterCurrentUser = currentUserIndex + 1;
    if (members.length > afterCurrentUser) {
      result.push({ user: members[afterCurrentUser], position: afterCurrentUser + 1 });
    }
  
    const lastPlace = members.length - 1
    if (lastPlace > afterCurrentUser) {
      result.push({ user: members[lastPlace], position: lastPlace + 1 });
    }
    return result.sort((a, b) => a.position - b.position);
  }

  export default leaderboardsRoute;