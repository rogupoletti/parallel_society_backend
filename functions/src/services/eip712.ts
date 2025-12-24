import { ethers } from 'ethers';
import { provider } from './lutBalance';

/**
 * EIP-712 Domain for LUT Governance
 * This domain is used for all governance-related signatures
 */
let cachedChainId: number | null = null;

export async function getEIP712Domain() {
    if (!cachedChainId) {
        const network = await provider.getNetwork();
        cachedChainId = Number(network.chainId);
    }

    return {
        name: 'LUT Governance',
        version: '1',
        chainId: cachedChainId,
        verifyingContract: '0x0000000000000000000000000000000000000000'
    };
}

/**
 * EIP-712 Types for Vote
 */
export const EIP712_TYPES = {
    Vote: [
        { name: 'proposalId', type: 'string' },
        { name: 'voter', type: 'address' },
        { name: 'choice', type: 'string' },
        { name: 'snapshotBlock', type: 'uint256' },
        { name: 'timestamp', type: 'uint64' }
    ]
};

/**
 * Vote message structure
 */
export interface VoteMessage {
    proposalId: string;
    voter: string;
    choice: 'FOR' | 'AGAINST';
    snapshotBlock: number;
    timestamp: number;
}

/**
 * Verifies a vote signature and recovers the signer address
 * @param message The vote message that was signed
 * @param signature The signature to verify
 * @returns The recovered signer address (lowercase)
 * @throws Error if signature verification fails
 */
export async function verifyVoteSignature(
    message: VoteMessage,
    signature: string
): Promise<string> {
    try {
        const domain = await getEIP712Domain();

        // Recover the signer address
        const recoveredAddress = ethers.verifyTypedData(
            domain,
            EIP712_TYPES,
            message,
            signature
        );

        return recoveredAddress.toLowerCase();
    } catch (error: any) {
        console.error('Signature verification failed:', error.message);
        throw new Error('Invalid signature');
    }
}

/**
 * Computes the EIP-712 message hash for a vote
 * @param message The vote message
 * @returns The message hash (hex string)
 */
export async function computeMessageHash(message: VoteMessage): Promise<string> {
    try {
        const domain = await getEIP712Domain();

        // Compute the typed data hash
        const hash = ethers.TypedDataEncoder.hash(
            domain,
            EIP712_TYPES,
            message
        );

        return hash;
    } catch (error: any) {
        console.error('Failed to compute message hash:', error.message);
        throw new Error('Failed to compute message hash');
    }
}
