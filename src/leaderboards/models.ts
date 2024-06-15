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
    supports: {
        id: string;
        name: string;
        nameShort: string;
    } | null;
};

type SortedSetEntry = {
    value: string,
    score: number
};

type LeaderboardEntry = {
    username: string,
    score: number,
    position: number
};

type Leaderboard = {
    communityId: string,
    chunks: Array<Array<LeaderboardEntry>>
};
