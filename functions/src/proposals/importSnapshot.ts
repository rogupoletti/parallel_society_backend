import * as functions from 'firebase-functions';
import axios from 'axios';
import * as admin from 'firebase-admin';
import { db } from '../firebase';

const SNAPSHOT_SPACE = 'libertarianuniverse.eth';
const SNAPSHOT_GRAPHQL_ENDPOINT = 'https://hub.snapshot.org/graphql';

/**
 * Simple translation helper using a public endpoint.
 * Note: For production use, Google Cloud Translation API is recommended.
 */
async function translateText(text: string, target: string = 'en'): Promise<string> {
    if (!text || text.trim() === '') return text;
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
        const response = await axios.get(url);
        if (response.data && response.data[0]) {
            return response.data[0].map((s: any) => s[0]).join('');
        }
        return text;
    } catch (error) {
        console.warn('Translation failed, returning original text:', error);
        return text;
    }
}

const QUERY = `
query ProposalsBySpace {
  proposals(
    first: 100
    skip: 0
    where: {
      space_in: ["${SNAPSHOT_SPACE}"]
    }
    orderBy: "created",
    orderDirection: desc
  ) {
    id
    title
    body
    choices
    start
    end
    state
    scores
    scores_total
    votes
    author
    created
    snapshot
  }
}
`;

export const importSnapshot = functions.https.onRequest(async (req, res) => {
    // CORS Header
    res.set('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST, GET');
        res.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
        res.status(204).send('');
        return;
    }

    // "Exception" logic: Check for a secret key to prevent unauthorized access
    // You can call this with ?secret=MIGRATE2024 or a header x-api-key
    const secret = req.query.secret || req.headers['x-api-key'];
    const EXPECTED_SECRET = 'MIGRATE2024'; // Simple one-time secret

    if (secret !== EXPECTED_SECRET) {
        console.warn('Block unauthorized access to importSnapshot');
        res.status(403).json({ error: 'Unauthorized exception required' });
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

            // Translate Title and Description
            const translatedTitle = await translateText(sp.title, 'en');
            const translatedDescription = await translateText(sp.body, 'en');

            // Construct English + Portuguese description
            const finalDescription = `${translatedDescription}\n\n---\n\n*Original (PT):*\n${sp.body}`;

            const startTime = admin.firestore.Timestamp.fromMillis(sp.start * 1000);
            const endTime = admin.firestore.Timestamp.fromMillis(sp.end * 1000);
            const createdAt = admin.firestore.Timestamp.fromMillis(sp.created * 1000);

            // Determine indexes for For/Against
            let forIndex = 0;
            let againstIndex = 1;

            if (sp.choices && Array.isArray(sp.choices)) {
                const lowerChoices = sp.choices.map((c: any) => String(c).toLowerCase());
                const fIdx = lowerChoices.indexOf('for');
                const aIdx = lowerChoices.indexOf('against');
                if (fIdx !== -1) forIndex = fIdx;
                if (aIdx !== -1) againstIndex = aIdx;
            }

            const scoreFor = sp.scores && sp.scores[forIndex] ? sp.scores[forIndex] : 0;
            const scoreAgainst = sp.scores && sp.scores[againstIndex] ? sp.scores[againstIndex] : 0;

            // Map to our schema
            const proposal = {
                title: translatedTitle,
                category: 'Other',
                description: finalDescription,
                authorAddress: sp.author.toLowerCase(),
                createdAt: createdAt,
                startTime: startTime,
                endTime: endTime,
                status: sp.state === 'active' ? 'ACTIVE' : (sp.state === 'closed' ? 'CLOSED' : 'UPCOMING'),

                // Snapshot specific
                snapshotBlock: Number(sp.snapshot),
                strategy: 'ticket',

                // Tally
                totalForRaw: String(scoreFor),
                totalAgainstRaw: String(scoreAgainst),
                tokenPowerVotedRaw: String(sp.scores_total || 0),
                totalVoters: sp.votes || 0,

                snapshotId: sp.id
            };

            // Check if already exists by snapshotId
            const existing = await db.collection('proposals').where('snapshotId', '==', sp.id).get();

            if (!existing.empty) {
                console.log(`🔄 Updating existing proposal: ${existing.docs[0].id}`);
                await existing.docs[0].ref.set(proposal, { merge: true });
                results.push({ title: sp.title, status: 'updated', id: existing.docs[0].id });
            } else {
                const docRef = await db.collection('proposals').add(proposal);
                console.log(`✅ Saved with ID: ${docRef.id}`);
                results.push({ title: sp.title, status: 'imported', id: docRef.id });
            }
        }

        res.status(200).json({
            message: 'Import/Update completed successfully',
            count: snapshotProposals.length,
            details: results
        });

    } catch (error: any) {
        console.error('❌ Error during import:', error.message);
        res.status(500).json({ error: error.message });
    }
});
