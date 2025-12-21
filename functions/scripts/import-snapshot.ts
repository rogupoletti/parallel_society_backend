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
    start
    end
    state
    author
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
      console.log(`Checking if exists in Firestore: ${sp.id}`);
      try {
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
