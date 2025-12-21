import * as functions from 'firebase-functions';
import axios from 'axios';
import * as admin from 'firebase-admin';
import { db } from '../firebase';

const SNAPSHOT_SPACE = 'libertarianuniverse.eth';
const SNAPSHOT_GRAPHQL_ENDPOINT = 'https://hub.snapshot.org/graphql';

const QUERY = `
query Proposals {
  proposals (
    first: 20,
    skip: 0,
    where: {
      space_in: ["${SNAPSHOT_SPACE}"],
    },
    orderBy: "created",
    orderDirection: desc
  ) {
    id
    title
    body
    start
    end
    state
    author
  }
}
`;

export const importSnapshot = functions.https.onRequest(async (req, res) => {
    // CORS Header
    res.set('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST, GET');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return;
    }

    console.log(`🚀 Starting Snapshot import for space: ${SNAPSHOT_SPACE}...`);

    try {
        const response = await axios.post(SNAPSHOT_GRAPHQL_ENDPOINT, { query: QUERY });
        const snapshotProposals = response.data.data.proposals;

        if (!snapshotProposals) {
            console.error('No proposals found or error in GraphQL response:', response.data);
            res.status(500).json({ error: 'Failed to fetch from Snapshot' });
            return;
        }

        const results = [];

        for (const sp of snapshotProposals) {
            console.log(`Processing: "${sp.title}" (${sp.id})`);

            const startTime = admin.firestore.Timestamp.fromMillis(sp.start * 1000);
            const endTime = admin.firestore.Timestamp.fromMillis(sp.end * 1000);
            const createdAt = admin.firestore.Timestamp.fromMillis(sp.start * 1000);

            // Map to our schema
            const proposal = {
                title: sp.title,
                category: 'Infrastructure', // Default category
                description: sp.body,
                authorAddress: sp.author.toLowerCase(),
                createdAt: createdAt,
                startTime: startTime,
                endTime: endTime,
                status: sp.state === 'active' ? 'ACTIVE' : 'CLOSED',
                totalFor: 0,
                totalAgainst: 0,
                snapshotId: sp.id // Keep track of Snapshot ID
            };

            // Check if already exists by snapshotId
            const existing = await db.collection('proposals').where('snapshotId', '==', sp.id).get();
            if (!existing.empty) {
                results.push({ title: sp.title, status: 'skipped (already exists)' });
                continue;
            }

            const docRef = await db.collection('proposals').add(proposal);
            results.push({ title: sp.title, status: 'imported', id: docRef.id });
        }

        res.status(200).json({
            message: 'Import completed successfully',
            count: snapshotProposals.length,
            details: results
        });

    } catch (error: any) {
        console.error('❌ Error during import:', error.message);
        res.status(500).json({ error: error.message });
    }
});
