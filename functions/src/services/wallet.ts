import { ethers } from 'ethers';

export const verifySignature = (address: string, nonce: string, signature: string): boolean => {
    try {
        const message = `Sign in to Parallel Society Governance\nNonce: ${nonce}`;
        // ethers.verifyMessage handles both regular strings (which it prefixes) and already prefixed hashes if managed manually,
        // but typically user signs the string message. verifyMessage verifies that.
        const recoveredAddress = ethers.verifyMessage(message, signature);
        return recoveredAddress.toLowerCase() === address.toLowerCase();
    } catch (error) {
        console.error('Error verifying signature:', error);
        return false;
    }
};
