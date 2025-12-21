import * as functions from 'firebase-functions';
import { db } from '../firebase';
import { verifyAuthToken } from '../services/auth';
import { getLUTBalanceRaw } from '../services/lutBalance';
import { recomputeTally } from '../services/tally';
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

        if (!id || !choice || !['FOR', 'AGAINST'].includes(choice)) {
            res.status(400).json({ error: 'Missing or invalid proposal ID or choice' });
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

        // 3. Check Status
        if (now.toMillis() < proposal.startTime.toMillis()) {
            res.status(400).json({ error: 'Voting has not started yet' });
            return;
        }
        if (now.toMillis() >= proposal.endTime.toMillis() || proposal.status === 'CLOSED' || proposal.status === 'PASSED' || proposal.status === 'FAILED') {
            res.status(400).json({ error: 'Voting has ended' });
            return;
        }

        // 4. Fetch Voter Weight
        const weight = await getLUTBalanceRaw(voterAddress);

        // 5. Upsert Vote
        const voteId = `${id}_${voterAddress}`;
        const voteData = {
            proposalId: id,
            voterAddress,
            choice,
            weight,
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
            myVote: { choice, weight },
            proposal: { ...proposal, ...tally, id }
        });

    } catch (error: any) {
        console.error('Error voting on proposal:', error);
        res.status(500).json({ error: error.message || 'Failed to record vote' });
    }
});
