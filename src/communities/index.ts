import { Hono } from 'hono'
import { db } from '@db';
import { and, eq, ilike, inArray } from 'drizzle-orm';
import { communities, communityMembers, communityPinnedMembers, users } from '@schema';
import { jwt } from 'hono/jwt';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const communitiesRoute = new Hono();
communitiesRoute.use(
  '*',
  jwt({
    secret: process.env.JWT_SECRET!,
  }),
);
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

communitiesRoute.get('/search', async (c) => {
  const { searchString } = c.req.query();
  if (!searchString) {
    return c.json({ message: 'Invalid-request: query-param searchString must not be empty.'}, 400)
  }
  const result = await db.query.communities.findMany({
    where: ilike(communities.name, `%${searchString}%`),
    with: {
      tournament: true
    },
    columns: {
      id: true,
      name: true
    }
  });

  return c.json(result);
})

const createCommunityPayload = z.object({
  name: z.string(),
  tournament: z.object({
    id: z.string()
  })
});

communitiesRoute.post(
  '/',
  zValidator('json', createCommunityPayload, ({success}, c) => {
    if (!success) return c.json({ error: 'Incorrect schema.' }, 400);
  }),
  async (c) => {
    const { sub } = c.get('jwtPayload');
    const communityToBeCreated = c.req.valid('json');
    const { name, tournament } = communityToBeCreated;
    
    const created = await db.insert(communities)
      .values({ name: name, tournamentId: tournament.id }).returning()

    if (created.length != 1) {
      return c.json({ error: 'Failed to create new community.' }, 500); 
    }

    await db.insert(communityMembers).values({communityId: created.at(0)!.id, username: sub});

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
      return c.json({ error: 'Failed to create new community.' }, 500); 
    }

    return c.json(createdCommunity)
  }
);

const inviteToCommunitySchema = z.array(z.string());

communitiesRoute.post(
  '/join/:communityId',
  async (c) => {
    const { sub } = c.get('jwtPayload');
    const communityId = c.req.param('communityId');

    const community = await db.query.communityMembers.findFirst({
      where: and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.username, sub)
      )
    });

    if (community) {
      return c.json({ message: 'You are already part of that community.' }, 412);
    }

    await db.insert(communityMembers).values({communityId, username: sub}).onConflictDoNothing().returning();
    
    return c.json({}, 201)
  }
);

communitiesRoute.post('/:communityId/pinned', async (c) => {
  const { sub } = c.get('jwtPayload');
  const communityId = c.req.param('communityId');
  const usernameToPin = c.req.query('username')

  if (!usernameToPin) {
    return c.json({ error: 'A username to pin must be provided.' }, 400);
  }

  const community = await db.query.communityMembers.findFirst({
    where: and(
      eq(communityMembers.communityId, communityId),
      eq(communityMembers.username, sub)
    )
  });

  if (!community) {
    return c.json({ error: 'The community was not found.' }, 404);
  }

  let pinnedUsers = await db.insert(communityPinnedMembers).values({ communityId, username: sub, pinned: usernameToPin }).onConflictDoNothing().returning()

  return c.json(pinnedUsers.map(({ pinned }) => pinned))
})

export default communitiesRoute;
