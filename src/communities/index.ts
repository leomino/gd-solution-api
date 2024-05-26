import { Hono } from 'hono'
import { db } from '@db';

const communitiesRoute = new Hono();

communitiesRoute.get('/', async (c) => {
  const communities = await db.query.communities.findMany({
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
  const result = communities.map(community => ({
    ...community,
    members: community.members.map(({user}) => user)
  }));
  return c.json(result);
});

export default communitiesRoute;
