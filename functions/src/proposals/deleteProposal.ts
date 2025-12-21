import * as functions from 'firebase-functions';
import { db } from '../firebase';
import { verifyAuthToken } from '../services/auth';

export const deleteProposal = functions.https.onRequest(async (req, res) => {
    // CORS Header
    res.set('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'DELETE, POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.status(204).send('');
        return;
    }

    // Support both DELETE and POST for compatibility with simple fetch clients
    if (req.method !== 'DELETE' && req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    try {
        console.log('Received deleteProposal request');

        // 1. Verify Auth
        let authorAddress: string;
        try {
            authorAddress = await verifyAuthToken(req.headers.authorization);
            console.log(`Authenticated user: ${authorAddress}`);
        } catch (authError: any) {
            console.warn('Auth verification failed:', authError.message);
            res.status(401).json({ error: authError.message });
            return;
        }

        // 2. Get Proposal ID
        const { id } = req.body;
        const queryId = req.query.id as string;
        const proposalId = id || queryId;

        if (!proposalId) {
            res.status(400).json({ error: 'Missing proposal ID' });
            return;
        }

        // 3. Check Ownership
        const proposalRef = db.collection('proposals').doc(proposalId);
        const doc = await proposalRef.get();

        if (!doc.exists) {
            res.status(404).json({ error: 'Proposal not found' });
            return;
        }

        const data = doc.data()!;
        if (data.authorAddress.toLowerCase() !== authorAddress.toLowerCase()) {
            console.warn(`User ${authorAddress} tried to delete proposal ${proposalId} owned by ${data.authorAddress}`);
            res.status(403).json({ error: 'Permission denied. You can only delete your own proposals.' });
            return;
        }

        // 4. Delete Proposal
        await proposalRef.delete();
        console.log(`Proposal ${proposalId} deleted by ${authorAddress}`);

        res.status(200).json({ message: 'Proposal deleted successfully', id: proposalId });

    } catch (error: any) {
        console.error('Unexpected error in deleteProposal:', error);
        res.status(500).json({ error: error.message || 'An unexpected error occurred' });
    }
});
