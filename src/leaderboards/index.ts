import { db, redis } from "@db";
import { communities, communityMembers } from "@schema";
import { and, eq, ilike } from "drizzle-orm";
import { Hono } from "hono";
import { jwt } from "hono/jwt";

const leaderboardsRoute = new Hono();
leaderboardsRoute.use(
    '*',
    jwt({
        secret: process.env.JWT_SECRET!
    })
);

/**
 * Get leaderboards for all joined communities.
 */
leaderboardsRoute.get("/", async (c) => {
    const { sub } = c.get('jwtPayload');

    const joinedCommunities = await db.select({
        id: communityMembers.communityId,
        name: communities.name
    })
    .from(communityMembers)
    .where(eq(communityMembers.username, sub))
    .leftJoin(communities, eq(communities.id, communityMembers.communityId))

    const taskQueue = Array<Promise<Leaderboard>>()

    for (const communityId of joinedCommunities.map(({id}) => id)) {
        taskQueue.push(generateLeaderboard(communityId, sub));
    }

    return c.json(await Promise.all(taskQueue));
});

/**
 * Get leaderboard of a specific community.
 * @Condition: user is member of the community.
 */
leaderboardsRoute.get('/:communityId', async (c) => {
    const { sub } = c.get('jwtPayload');
    const communityId = c.req.param('communityId')

    if (!communityId || !communityId.length) {
        return c.json({ errorDescription: "CommunityId cannot be empty." }, 400);
    }

    try {
        return c.json(await generateLeaderboard(communityId, sub));
    } catch(error) {
        return c.json({ errorDescription: (error as Error).message }, 500);
    }
});

/**
 * Get chunk of specific leaderboard by offset and limit.
 * @Note: offset and limit are both zero-based and including.
 */
leaderboardsRoute.get('/:communityId/pages', async (c) => {
    const { sub } = c.get('jwtPayload');
    const { offset, limit } = c.req.query();
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
    const chunk = await redis.zRangeWithScores(communityId, +offset, +limit, { REV: true });
    return c.json(withPositions(chunk, +offset));
});

/**
 * Search leaderboard entries for a specific community by username (case-insensitive).
 */
leaderboardsRoute.get('/:communityId/user-search', async (c) => {
    const { communityId } = c.req.param();
    const { searchString } = c.req.query();

    const usernames = (await db.query.communityMembers.findMany({
        where: and(
            eq(communityMembers.communityId, communityId),
            ilike(communityMembers.username, `%${searchString}%`)
        ),
        columns: {
            username: true
        }
    })).map(({ username }) => username);

    if (!usernames.length) {
        return c.json([]);
    }

    const taskQueue = Array<Promise<number | null>>();

    usernames.forEach((username) => taskQueue.push(redis.zRevRank(communityId, username)));

    const [scores, ...ranks] = await Promise.all([
        redis.zmScore(communityId, usernames),
        ...taskQueue
    ]);

    // return error if usernames.length != scores.length || ranks.length

    return c.json(usernames.map((username, index) => ({
        username,
        score: scores[index],
        position: (ranks[index]!) + 1
    })));
});

/**
 * Generates a leaderboard relative to the current user's position.
 * @Note: Always returns either 7 or, if the community has fewer members, all members.
 */
async function generateLeaderboard(communityId: string, currentUserName: string): Promise<Leaderboard> {
    const currentUserPosition = (await redis.zRevRank(communityId, currentUserName))! + 1;
    const membersCount = await redis.zCard(communityId);
    const lastPosition = membersCount - 1;

    if (currentUserPosition < 6) {
        let chunks = Array<Array<LeaderboardEntry>>();
        const topSix = await redis.zRangeWithScores(communityId, 0, Math.min(5, lastPosition), { REV: true });
        chunks.push(withPositions(topSix, 0));
        if (membersCount > 6) {
            const lastPlace = (await redis.zRangeWithScores(communityId, lastPosition, lastPosition, { REV: true }))[0];
            chunks.push([{ username: lastPlace.value, score: lastPlace.score, position: membersCount }]);
        }
        return { communityId, chunks };
    }

    if (currentUserPosition > membersCount - 3) {
        const [topThree, lastFour] = (await redis
            .multi()
            .zRangeWithScores(communityId, 0, 2, { REV: true })
            .zRangeWithScores(communityId, membersCount - 4, membersCount, { REV: true })
            .exec()) as unknown as SortedSetEntry[][];
        return {
            communityId,
            chunks: [
                withPositions(topThree, 0),
                withPositions(lastFour, membersCount - 4)
            ]
        };
    }

    const [topThree, userContext, last] = await redis
        .multi()
        .zRangeWithScores(communityId, 0, 2, { REV: true })
        .zRangeWithScores(communityId, currentUserPosition - 2, currentUserPosition, { REV: true })
        .zRangeWithScores(communityId, lastPosition, lastPosition, { REV: true })
        .exec() as unknown as SortedSetEntry[][];
    return {
        communityId,
        chunks: [
            withPositions(topThree, 0),
            withPositions(userContext, currentUserPosition - 2),
            withPositions(last, lastPosition)
        ]
    };
}

/**
 * Maps `SortedSetEntries` to `LeaderboardEntries` by e.g.: adding a position based on given offset.
 * @Note: offset is zero-based and including.
 */
function withPositions(setEntries: Array<SortedSetEntry>, offset: number): Array<LeaderboardEntry> {
    const result = Array<LeaderboardEntry>();
    let position = offset + 1;
    for (let i = 0; i < setEntries.length; i++) {
        const { value, score } = setEntries[i];
        result.push({
            username: value,
            score,
            position
        });
        ++position;
    }
    return result;
}

export default leaderboardsRoute;
