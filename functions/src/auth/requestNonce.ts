import * as functions from 'firebase-functions';
import { generateNonce } from '../services/nonce';

export const requestNonce = functions.https.onRequest(async (req, res) => {
    // Enable CORS manually if needed, or rely on Firebase's handling if configured.
    // For basic starter, we'll assume direct call or proxy.
    // Ideally, use a CORS middleware, but for minimal deliverable:
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

    const { address } = req.body;
    if (!address || typeof address !== 'string') {
        res.status(400).send('Missing or invalid address');
        return;
    }

    const normalizedAddress = address.toLowerCase();

    try {
        const nonce = await generateNonce(normalizedAddress);
        res.status(200).json({ nonce });
    } catch (error) {
        console.error('Error generating nonce:', error);
        res.status(500).send('Internal Server Error');
    }
});
