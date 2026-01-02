import axios from 'axios';
import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const SNAPSHOT_SPACE = 'libertarianuniverse.eth';
const SNAPSHOT_GRAPHQL_ENDPOINT = 'https://hub.snapshot.org/graphql';

// Initialize Firebase Admin
if (!admin.apps.length) {
  const projectId = process.env.PS_PROJECT_ID;
  console.log(`🔧 Initializing Firebase Admin for project: ${projectId || 'default'}`);
  admin.initializeApp({
    projectId: projectId
  });
}

const db = admin.firestore();

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

async function importProposals() {
  const projectId = process.env.PS_PROJECT_ID;
  console.log(`🚀 Starting Snapshot import for space: ${SNAPSHOT_SPACE}...`);
  console.log(`Environment: ProjectID=${projectId}`);

  try {
    console.log('Fetching from Snapshot...');
    const response = await axios.post(SNAPSHOT_GRAPHQL_ENDPOINT, { query: QUERY });
    const snapshotProposals = response.data.data.proposals;

    if (!snapshotProposals) {
      console.error('No proposals found or error in GraphQL response:', response.data);
      return;
    }

    console.log(`📦 Found ${snapshotProposals.length} proposals on Snapshot.`);

    for (const sp of snapshotProposals) {
      console.log(`\nProcessing: "${sp.title}" (${sp.id})`);

      const startTime = admin.firestore.Timestamp.fromMillis(sp.start * 1000);
      const endTime = admin.firestore.Timestamp.fromMillis(sp.end * 1000);
      // Created is also unix timestamp in seconds
      const createdAt = admin.firestore.Timestamp.fromMillis(sp.created * 1000);

      // Determine indexes for For/Against
      // Default: 0 = For, 1 = Against if not found
      let forIndex = 0;
      let againstIndex = 1;

      if (sp.choices && Array.isArray(sp.choices)) {
        const lowerChoices = sp.choices.map((c: any) => String(c).toLowerCase());
        const fIdx = lowerChoices.indexOf('for');
        const aIdx = lowerChoices.indexOf('against');
        // Only override if found. Some spaces might use different wording.
        // If "For" is found but "Against" isn't, we assume standard ordering?
        // Let's stick to explicit finding or default.
        if (fIdx !== -1) forIndex = fIdx;
        if (aIdx !== -1) againstIndex = aIdx;
      }

      const scoreFor = sp.scores && sp.scores[forIndex] ? sp.scores[forIndex] : 0;
      const scoreAgainst = sp.scores && sp.scores[againstIndex] ? sp.scores[againstIndex] : 0;

      // Map to our schema
      const proposal = {
        title: sp.title,
        category: 'Infrastructure', // Default category
        description: sp.body,
        authorAddress: sp.author.toLowerCase(),
        createdAt: createdAt,
        startTime: startTime,
        endTime: endTime,
        status: sp.state === 'active' ? 'ACTIVE' : (sp.state === 'closed' ? 'CLOSED' : 'UPCOMING'),

        // Snapshot specific
        snapshotBlock: Number(sp.snapshot),
        strategy: 'ticket', // Default or derived

        // Tally
        totalForRaw: String(scoreFor),
        totalAgainstRaw: String(scoreAgainst),
        tokenPowerVotedRaw: String(sp.scores_total || 0),
        totalVoters: sp.votes || 0,

        snapshotId: sp.id // Keep track of Snapshot ID
      };

      // Check if already exists by snapshotId
      console.log(`Checking if exists in Firestore: ${sp.id}`);
      try {
        // Assume 'proposals' collection
        const existing = await db.collection('proposals').where('snapshotId', '==', sp.id).get();
        if (!existing.empty) {
          console.log(`⏩ Skipping: Already imported.`);
          continue;
        }

        const docRef = await db.collection('proposals').add(proposal);
        console.log(`✅ Saved with ID: ${docRef.id}`);
      } catch (fsError: any) {
        console.error(`❌ Firestore error for "${sp.title}":`, fsError.message);
        throw fsError; // Stop on first Firestore error to avoid log spam
      }
    }

    console.log('\n✨ Import completed successfully!');

  } catch (error: any) {
    console.error('❌ Error during import:', error.message);
    if (error.response) {
      console.error('Snapshot API error:', error.response.data);
    }
  }
}

importProposals();
