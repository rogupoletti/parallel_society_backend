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
    totalFor: string;       // raw string
    totalAgainst: string;   // raw string
    totalVoters: number;
    tokenPowerVoted: string; // totalFor + totalAgainst
    finalizedAt?: any;
}

export interface CreateProposalRequest {
    title: string;
    category: string;
    description: string;
    startTime?: number;
    endTime?: number;
}
