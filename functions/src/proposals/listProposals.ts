import * as functions from 'firebase-functions';
import { db } from '../firebase';
import { finalizeProposalIfNeeded } from '../services/finalize';
import { Proposal } from '../types';

export const listProposals = functions.https.onRequest(async (req, res) => {
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

    try {
        const snapshot = await db.collection('proposals')
            .orderBy('createdAt', 'desc')
            .get();

        const proposals = await Promise.all(snapshot.docs.map(async doc => {
            const data = doc.data() as Proposal;
            const finalized = await finalizeProposalIfNeeded(doc.id, data);

            return {
                id: doc.id,
                title: finalized.title,
                category: finalized.category,
                description: finalized.description,
                authorAddress: finalized.authorAddress,
                createdAt: finalized.createdAt.toMillis(),
                startTime: finalized.startTime.toMillis(),
                endTime: finalized.endTime.toMillis(),
                status: finalized.status,
                totalForRaw: finalized.totalForRaw || '0',
                totalAgainstRaw: finalized.totalAgainstRaw || '0',
                totalVoters: finalized.totalVoters || 0,
                tokenPowerVotedRaw: finalized.tokenPowerVotedRaw || '0'
            };
        }));

        res.status(200).json(proposals);
    } catch (error: any) {
        console.error('Error listing proposals:', error);
        res.status(500).json({ error: 'Failed to fetch proposals' });
    }
});
