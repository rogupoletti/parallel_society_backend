import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getNonce, invalidateNonce } from '../services/nonce';
import { verifySignature } from '../services/wallet';
import { auth, db } from '../firebase';

export const verify = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    const { address, signature } = req.body;

    if (!address || !signature) {
        res.status(400).send('Missing address or signature');
        return;
    }

    const normalizedAddress = address.toLowerCase();

    try {
        // 1. Get Nonce
        const nonce = await getNonce(normalizedAddress);
        if (!nonce) {
            res.status(400).send('Nonce not found or expired');
            return;
        }

        // 2. Verify Signature
        const isValid = verifySignature(normalizedAddress, nonce, signature);
        if (!isValid) {
            res.status(401).send('Invalid signature');
            return;
        }

        // 3. User Entity Logic
        const userRef = db.collection('users').doc(normalizedAddress);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            await userRef.set({
                address: normalizedAddress,
                createdAt: admin.firestore.Timestamp.now(),
                lastLoginAt: admin.firestore.Timestamp.now()
            });
        } else {
            await userRef.update({
                lastLoginAt: admin.firestore.Timestamp.now()
            });
        }

        // 4. Create Custom Token
        // uid is the wallet address
        const customToken = await auth.createCustomToken(normalizedAddress);

        // 5. Invalidate Nonce
        await invalidateNonce(normalizedAddress);

        res.status(200).json({ token: customToken });

    } catch (error) {
        console.error('Error verifying signature:', error);
        res.status(500).send('Internal Server Error');
    }
});
