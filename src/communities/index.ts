import { Hono } from 'hono'
import { db } from '@db';
import { eq } from 'drizzle-orm';
import { communities, communityMembers, tournaments } from '@schema';
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
          tournament: true,
          members: {
            with: {
              user: {
                with: {
                  supports: true
                },
                columns: {
                  supportsTeamId: false,
                  firebaseId: false
                }
              }
            },
            columns: { }
          }
        },
        columns: {
          tournamentId: false
        }
      }
    },
    columns: { }
  });
  const result = communities.map(({ community }) => ({
    ...community,
    members: community.members.map(({user}) => user)
  }));
  return c.json(result);
});

const createCommunityPayload = z.object({
  name: z.string(),
  tournament: z.object({
    id: z.string()
  })
});

communitiesRoute.post(
  '/',
  zValidator('json', createCommunityPayload, (validation, c) => {
    if (!validation.success) return c.json({ error: 'Incorrect schema.' , validation }, 400); 
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
        members: {
          with: {
            user: {
              with: {
                supports: true
              },
              columns: {
                supportsTeamId: false,
                firebaseId: false
              }
            }
          },
          columns: { }
        }
      },
      columns: {
        tournamentId: false
      }
    });

    if (!createdCommunity) {
      return c.json({ error: 'Failed to create new community.' }, 500); 
    }

    return c.json({ ...createdCommunity, members: createdCommunity.members.map(({user}) => user) })
  }
)

export default communitiesRoute;
