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
        console.log(`Verifying signature for address: ${normalizedAddress}`);

        // 1. Get Nonce
        const nonce = await getNonce(normalizedAddress);
        if (!nonce) {
            console.warn(`Nonce not found for address: ${normalizedAddress}`);
            res.status(400).send('Nonce not found or expired');
            return;
        }

        // 2. Verify Signature
        const isValid = verifySignature(normalizedAddress, nonce, signature);
        if (!isValid) {
            console.warn(`Invalid signature for address: ${normalizedAddress}`);
            res.status(401).send('Invalid signature');
            return;
        }

        // 3. User Entity Logic
        console.log(`Updating user record for: ${normalizedAddress}`);
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
        console.log(`Creating custom token for: ${normalizedAddress}`);
        let customToken;
        try {
            customToken = await auth.createCustomToken(normalizedAddress);
        } catch (tokenError) {
            console.error('Error creating custom token:', tokenError);
            throw new Error(`Token creation failed: ${tokenError instanceof Error ? tokenError.message : 'Unknown error'}`);
        }

        // 5. Invalidate Nonce
        await invalidateNonce(normalizedAddress);

        res.status(200).json({ token: customToken });

    } catch (error) {
        console.error('Full verification error:', error);
        res.status(500).send(`Internal Server Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
});
