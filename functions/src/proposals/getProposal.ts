import * as functions from 'firebase-functions';
import { db } from '../firebase';
import { finalizeProposalIfNeeded } from '../services/finalize';
import { verifyAuthToken } from '../services/auth';
import { Proposal } from '../types';

export const getProposal = functions.https.onRequest(async (req, res) => {
    // CORS Header
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

    // Extract ID from query or path
    let id = req.query.id as string;
    if (!id) {
        const pathSegments = req.path.split('/');
        id = pathSegments[pathSegments.length - 1];
    }

    if (!id || id === 'proposals' || id === '/') {
        res.status(400).json({ error: 'Missing proposal ID' });
        return;
    }

    try {
        const doc = await db.collection('proposals').doc(id).get();
        if (!doc.exists) {
            res.status(404).json({ error: 'Proposal not found' });
            return;
        }

        const data = doc.data() as Proposal;
        const finalized = await finalizeProposalIfNeeded(id, data);

        // Fetch user's vote if authenticated
        let myVote = null;
        const authHeader = req.headers.authorization;
        if (authHeader) {
            try {
                const voterAddress = await verifyAuthToken(authHeader);
                const voteDoc = await db.collection('votes').doc(`${id}_${voterAddress.toLowerCase()}`).get();
                if (voteDoc.exists) {
                    const vData = voteDoc.data()!;
                    myVote = {
                        choice: vData.choice,
                        weight: vData.weight
                    };
                }
            } catch (authError) {
                console.warn('Silent auth failed in getProposal:', authError);
            }
        }

        res.status(200).json({
            id: doc.id,
            ...finalized,
            createdAt: finalized.createdAt.toMillis(),
            startTime: finalized.startTime.toMillis(),
            endTime: finalized.endTime.toMillis(),
            finalizedAt: finalized.finalizedAt?.toMillis() || null,
            myVote
        });
    } catch (error: any) {
        console.error('Error getting proposal:', error);
        res.status(500).json({ error: 'Failed to fetch proposal' });
    }
});
