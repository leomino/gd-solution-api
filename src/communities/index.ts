import { Hono } from 'hono'
import { db } from '@db';
import {and, count, eq, ilike, inArray} from 'drizzle-orm';
import { communities, communityMembers } from '@schema';
import { jwt } from 'hono/jwt';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const createCommunityPayload = z.object({
  name: z.string(),
  tournament: z.object({
    id: z.string()
  })
});

const getCommunitiesBulk = z.array(z.string())

const communitiesRoute = new Hono();
communitiesRoute.use(
  '*',
  jwt({
    secret: process.env.JWT_SECRET!,
  }),
);

/**
 * Get all joined communities.
 */
communitiesRoute.get('/', async (c) => {
  const { sub } = c.get('jwtPayload');

  const communities = await db.query.communityMembers.findMany({
    where: eq(communityMembers.username, sub),
    with: {
      community: {
        with: {
          tournament: true
        },
        columns: {
          tournamentId: false
        }
      }
    },
    columns: { }
  });
  const result = communities.map(({ community }) => community);
  return c.json(result);
});

/**
 * Get specific community.
 * @Condition: user is member of the community.
 */
communitiesRoute.get('/:communityId', async (c) => {
  const { sub } = c.get('jwtPayload');
  const { communityId } = c.req.param();

  const communityExists = await db.query.communityMembers.findFirst({
    where: and(
        eq(communityMembers.username, sub),
        eq(communityMembers.communityId, communityId)
    ),
    columns: {
      communityId: true
    }
  });

  if (!communityExists) {
    return c.json({ errorDescription: "Community not found." }, 404);
  }

  const community = await db.query.communities.findFirst({
    where: eq(communities.id, communityExists.communityId),
    with: {
      tournament: true
    },
    columns: {
      id: true,
      name: true
    }
  });

  return c.json(community);
});

/**
 * Create a new community.
 * @Condition: user has not joined 5 or more communities already.
 * @Note: community-names are NOT unique.
 */
communitiesRoute.put(
    '/',
    zValidator('json', createCommunityPayload, ({success}, c) => {
      if (!success) return c.json({ errorDescription: 'Incorrect schema.' }, 400);
    }),
    async (c) => {
      const { sub } = c.get('jwtPayload');
      const communityToBeCreated = c.req.valid('json');
      const { name, tournament } = communityToBeCreated;

      const joinedCommunities = await db.select({
        count: count()
      })
      .from(communityMembers)
      .where(eq(communityMembers.username, sub))

      if (joinedCommunities[0].count >= 5) {
        return c.json({ errorDescription: 'You cannot be part of more then 5 communities.' }, 409);
      }

      const created = await db.insert(communities)
          .values({ name: name, tournamentId: tournament.id }).returning()

      if (created.length != 1) {
        return c.json({ errorDescription: 'Failed to create new community.' }, 500);
      }

      await db.insert(communityMembers).values({communityId: created.at(0)!.id, username: sub, position: 0});

      const createdCommunity = await db.query.communities.findFirst({
        where: eq(communities.id, created.at(0)!.id),
        with: {
          tournament: true,
        },
        columns: {
          tournamentId: false
        }
      });

      if (!createdCommunity) {
        return c.json({ errorDescription: 'Failed to create new community.' }, 500);
      }

      return c.json(createdCommunity)
    }
);

communitiesRoute.post(
    '/',
    zValidator('json', getCommunitiesBulk, ({success}, c) => {
      if (!success) return c.json({ errorDescription: 'Incorrect schema.' }, 400);
    }),
    async (c) => {
      const communityIds = c.req.valid("json");
      const result = await db.query.communities.findMany({
        where: inArray(communities.id, communityIds),
        with: {
          tournament: true
        },
        columns: {
          id: true,
          name: true
        }
      });
      return c.json(result);
    }
);

/**
 * Search for communities by name.
 */
communitiesRoute.get('/search', async (c) => {
  const { name } = c.req.query();
  if (!name) {
    return c.json({ errorDescription: 'Invalid-request: query-param searchString must not be empty.'}, 400)
  }
  const result = await db.query.communities.findMany({
    where: ilike(communities.name, `%${name}%`),
    with: {
      tournament: true
    },
    columns: {
      id: true,
      name: true
    }
  });

  return c.json(result);
});

/**
 * Join a community.
 * @Condition: user has not joined 5 or more communities already.
 */
communitiesRoute.post('/join', async (c) => {
    const { sub } = c.get('jwtPayload');
    const { id } = c.req.query();

    const community = await db.query.communityMembers.findFirst({
      where: and(
        eq(communityMembers.communityId, id),
        eq(communityMembers.username, sub)
      )
    });

    if (community) {
      return c.json({ errorDescription: 'You are already part of that community.' }, 409);
    }

    const joinedCommunities = await db.select({
      count: count()
    })
    .from(communityMembers)
    .where(eq(communityMembers.username, sub))

    if (joinedCommunities[0].count >= 5) {
      return c.json({ errorDescription: 'You cannot be part of more then 5 communities.' }, 409); 
    }

    await db.insert(communityMembers).values({
      communityId: id,
      username: sub,
      position: 0
    }).onConflictDoNothing().returning();
    
    const joined = await db.query.communityMembers.findFirst({
      where: and(
        eq(communityMembers.communityId, id),
        eq(communityMembers.username, sub)
      ),
      with: {
        community: {
          with: {
            tournament: true
          },
          columns: {
            tournamentId: false
          }
        },
      }
    });

    if (!joined) {
      return c.json({ errorDescription: 'Failed to join the community.' }, 500); 
    }

    return c.json(joined.community)
});

export default communitiesRoute;
