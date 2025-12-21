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
