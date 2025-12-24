import * as functions from 'firebase-functions';
import { db } from '../firebase';
import { verifyAuthToken } from '../services/auth';
import { getBalanceAtBlock } from '../services/lutBalance';
import { recomputeTally } from '../services/tally';
import { verifyVoteSignature, computeVoteHash, VoteMessage } from '../services/eip712';
import * as admin from 'firebase-admin';

export const voteOnProposal = functions.https.onRequest(async (req, res) => {
    // CORS Header
    res.set('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.status(204).send('');
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    try {
        // 1. Verify Auth
        let voterAddress;
        try {
            voterAddress = await verifyAuthToken(req.headers.authorization);
            voterAddress = voterAddress.toLowerCase();
        } catch (authError: any) {
            res.status(401).json({ error: authError.message });
            return;
        }

        const { id } = req.body; // proposalId
        const { choice } = req.body; // FOR | AGAINST
        const { signature } = req.body; // EIP-712 signature
        const { timestamp } = req.body; // Unix timestamp in seconds

        console.log(`[Vote] ========== NEW VOTE REQUEST ==========`);
        console.log(`[Vote] Authenticated voter: ${voterAddress}`);
        console.log(`[Vote] Proposal ID: ${id}`);
        console.log(`[Vote] Choice: ${choice}`);
        console.log(`[Vote] Timestamp: ${timestamp}`);
        console.log(`[Vote] Signature: ${signature?.substring(0, 20)}...`);

        if (!id || !choice || !['FOR', 'AGAINST'].includes(choice)) {
            res.status(400).json({ error: 'Missing or invalid proposal ID or choice' });
            return;
        }

        if (!signature || !timestamp) {
            res.status(400).json({ error: 'Missing signature or timestamp' });
            return;
        }

        // 2. Load Proposal
        const proposalDoc = await db.collection('proposals').doc(id).get();
        if (!proposalDoc.exists) {
            res.status(404).json({ error: 'Proposal not found' });
            return;
        }

        const proposal = proposalDoc.data()!;
        const now = admin.firestore.Timestamp.now();

        // 3. Verify EIP-712 Signature
        // Build the expected vote message
        const snapshotBlock = proposal.snapshotBlock || 0;
        const voteMessage: VoteMessage = {
            proposalId: id,
            voter: voterAddress,
            choice,
            snapshotBlock,
            timestamp
        };

        console.log(`[Vote] Vote message to verify:`, JSON.stringify(voteMessage, null, 2));

        // Verify signature and recover signer
        let recoveredAddress: string;
        try {
            recoveredAddress = await verifyVoteSignature(voteMessage, signature);
            console.log(`[Vote] Recovered address: ${recoveredAddress}`);
            console.log(`[Vote] Authenticated address: ${voterAddress}`);
        } catch (error: any) {
            console.error(`[Vote] Signature verification failed:`, error.message);
            res.status(400).json({ error: 'Invalid signature' });
            return;
        }

        // Ensure recovered address matches authenticated user (normalize to lowercase)
        if (recoveredAddress.toLowerCase() !== voterAddress.toLowerCase()) {
            console.error(`[Vote] Address mismatch: ${recoveredAddress.toLowerCase()} !== ${voterAddress.toLowerCase()}`);
            res.status(403).json({ error: 'Signature does not match authenticated user' });
            return;
        }

        console.log(`[Vote] ✅ Signature verified successfully!`);

        // Compute message hash for storage
        const messageHash = await computeVoteHash(voteMessage);

        // 4. Check Status
        if (now.toMillis() < proposal.startTime.toMillis()) {
            res.status(400).json({ error: 'Voting has not started yet' });
            return;
        }
        if (now.toMillis() >= proposal.endTime.toMillis() || proposal.status === 'CLOSED' || proposal.status === 'PASSED' || proposal.status === 'FAILED') {
            res.status(400).json({ error: 'Voting has ended' });
            return;
        }

        // 5. Fetch Voter Weight
        // Backward compatibility: use 'latest' if snapshotBlock is missing
        const snapshotBlockTag = proposal.snapshotBlock || 'latest';
        const weightRaw = await getBalanceAtBlock(voterAddress, snapshotBlockTag);

        console.log(`Voting power for ${voterAddress} at block ${snapshotBlock}: ${weightRaw}`);

        if (BigInt(weightRaw) === BigInt(0)) {
            res.status(403).json({ error: 'No voting power at snapshot block' });
            return;
        }

        // 6. Upsert Vote
        const voteId = `${id}_${voterAddress}`;
        const voteData = {
            proposalId: id,
            voterAddress,
            choice,
            weightRaw,
            signature,
            messageHash,
            snapshotBlock,
            timestamp,
            updatedAt: now,
            createdAt: admin.firestore.FieldValue.serverTimestamp().isEqual(admin.firestore.FieldValue.serverTimestamp()) ? now : admin.firestore.FieldValue.serverTimestamp()
        };

        // Use a transaction or simple doc set for upsert
        const voteRef = db.collection('votes').doc(voteId);
        const existingVote = await voteRef.get();
        if (!existingVote.exists) {
            (voteData as any).createdAt = now;
        } else {
            (voteData as any).createdAt = existingVote.data()!.createdAt;
        }

        await voteRef.set(voteData);

        // 6. Recompute Tally and Update Proposal
        const tally = await recomputeTally(id);
        await db.collection('proposals').doc(id).update(tally);

        res.status(200).json({
            message: 'Vote recorded successfully',
            myVote: { choice, weightRaw },
            proposal: { ...proposal, ...tally, id }
        });

    } catch (error: any) {
        console.error('Error voting on proposal:', error);
        res.status(500).json({ error: error.message || 'Failed to record vote' });
    }
});
