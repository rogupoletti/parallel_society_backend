import * as functions from 'firebase-functions';
import { db } from '../firebase';

export const checkUsername = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'GET');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return;
    }

    if (req.method !== 'GET') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    const username = req.query.username as string;

    if (!username) {
        res.status(400).json({ available: false, error: 'Username is required' });
        return;
    }

    // Validation rules (matches verifySignature.ts)
    const usernameRegex = /^[a-z0-9_]{5,20}$/;
    if (!usernameRegex.test(username)) {
        res.status(200).json({
            available: false,
            error: 'Invalid format. Use 5-20 characters, lowercase, numbers, or underscores.'
        });
        return;
    }

    try {
        const usernameSnapshot = await db.collection('users')
            .where('username', '==', username)
            .limit(1)
            .get();

        if (!usernameSnapshot.empty) {
            res.status(200).json({ available: false, error: 'Username already taken' });
            return;
        }

        res.status(200).json({ available: true });
    } catch (error) {
        console.error('Error checking username:', error);
        res.status(500).send('Internal Server Error');
    }
});
