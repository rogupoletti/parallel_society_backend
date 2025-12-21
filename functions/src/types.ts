export interface AuthNonceRequest {
    address: string;
}

export interface AuthVerifyRequest {
    address: string;
    signature: string;
}

export interface AuthResponse {
    nonce?: string;
    token?: string;
    error?: string;
}

export interface Proposal {
    id?: string;
    title: string;
    category: string;
    description: string;
    authorAddress: string;
    createdAt: any;
    startTime: any;
    endTime: any;
    status: 'UPCOMING' | 'ACTIVE' | 'CLOSED' | 'PASSED' | 'FAILED';


    // Snapshot strategy
    snapshotBlock?: number;
    snapshotChainId?: number;
    strategy?: string;

    // Tally in raw strings (smallest unit)
    totalForRaw: string;
    totalAgainstRaw: string;
    tokenPowerVotedRaw: string;

    totalVoters: number;
    finalizedAt?: any;
    userVotingPowerRaw?: string; // Voting power of the authenticated user at snapshot
}

export interface Vote {
    id?: string;
    proposalId: string;
    voterAddress: string;
    choice: 'FOR' | 'AGAINST';
    weightRaw: string;
    createdAt: any;
}

export interface CreateProposalRequest {
    title: string;
    category: string;
    description: string;
    startTime?: number;
    endTime?: number;
}
