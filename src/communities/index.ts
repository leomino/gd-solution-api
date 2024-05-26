import { Hono } from 'hono'
import { db } from '@db';
import { eq } from 'drizzle-orm';
import { communityMembers } from '@schema';
import { jwt } from 'hono/jwt';

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

export default communitiesRoute;
