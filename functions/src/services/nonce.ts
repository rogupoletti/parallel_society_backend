import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { db } from '../firebase';

const COLLECTION_NAME = 'auth_nonces';

// 5 minutes default expiration
const EXPIRATION_MS = parseInt(process.env.NONCE_EXPIRATION_MS || '300000');

export const generateNonce = async (address: string): Promise<string> => {
    const nonce = crypto.randomBytes(16).toString('hex');
    const now = Date.now();
    const expiresAt = now + EXPIRATION_MS;

    // Use set with { merge: true } or overwrite? User said nonces are single use, so maybe just set correct doc.
    // Overwriting is fine for a fresh nonce request.
    await db.collection(COLLECTION_NAME).doc(address).set({
        address,
        nonce,
        createdAt: admin.firestore.Timestamp.fromMillis(now),
        expiresAt: admin.firestore.Timestamp.fromMillis(expiresAt)
    });

    return nonce;
};

export const getNonce = async (address: string): Promise<string | null> => {
    const doc = await db.collection(COLLECTION_NAME).doc(address).get();
    if (!doc.exists) return null;

    const data = doc.data();
    if (!data) return null;

    // Check expiration
    if (data.expiresAt.toMillis() < Date.now()) {
        return null;
    }

    return data.nonce;
};

export const invalidateNonce = async (address: string): Promise<void> => {
    await db.collection(COLLECTION_NAME).doc(address).delete();
};
