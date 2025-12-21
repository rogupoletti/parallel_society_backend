import * as functions from 'firebase-functions';
import { db } from '../firebase';

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

        const proposals = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                title: data.title,
                category: data.category,
                description: data.description,
                authorAddress: data.authorAddress,
                createdAt: data.createdAt.toMillis(),
                startTime: data.startTime.toMillis(),
                endTime: data.endTime.toMillis(),
                status: data.status,
                totalFor: data.totalFor,
                totalAgainst: data.totalAgainst
            };
        });

        res.status(200).json(proposals);
    } catch (error: any) {
        console.error('Error listing proposals:', error);
        res.status(500).json({ error: 'Failed to fetch proposals' });
    }
});
