import * as functions from 'firebase-functions';
import { db } from '../firebase';
import { verifyAuthToken } from '../services/auth';

export const deleteProposalUpdate = functions.https.onRequest(async (req, res) => {
    // CORS Header
    res.set('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'DELETE');
        res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.status(204).send('');
        return;
    }

    if (req.method !== 'DELETE') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    try {
        // 1. Verify Auth
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            res.status(401).json({ error: 'Missing Authorization header' });
            return;
        }

        const authorAddress = await verifyAuthToken(authHeader);
        const lowerAuthorAddress = authorAddress.toLowerCase();

        const updateId = req.query.id as string;
        if (!updateId) {
            res.status(400).json({ error: 'Missing update ID' });
            return;
        }

        // 2. Fetch Update & Verify Ownership
        const updateRef = db.collection('proposal_updates').doc(updateId);
        const updateDoc = await updateRef.get();

        if (!updateDoc.exists) {
            res.status(404).json({ error: 'Update not found' });
            return;
        }

        const updateData = updateDoc.data();

        if (updateData?.authorAddress && updateData.authorAddress.toLowerCase() !== lowerAuthorAddress) {
            res.status(403).json({ error: 'Unauthorized to delete this update' });
            return;
        }

        // 3. Delete
        await updateRef.delete();

        res.status(200).json({ message: 'Update deleted successfully' });

    } catch (error: any) {
        console.error('Error deleting proposal update:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});
