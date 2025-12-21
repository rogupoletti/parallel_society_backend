import { auth } from '../firebase';

export async function verifyAuthToken(header: string | undefined): Promise<string> {
    if (!header || !header.startsWith('Bearer ')) {
        throw new Error('Unauthorized: Missing or invalid Authorization header');
    }

    const idToken = header.split('Bearer ')[1];

    try {
        const decodedToken = await auth.verifyIdToken(idToken);
        // The UID is the wallet address from Phase 1
        return decodedToken.uid;
    } catch (error) {
        console.error('Error verifying Firebase ID token:', error);
        throw new Error('Unauthorized: Invalid or expired token');
    }
}
