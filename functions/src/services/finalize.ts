import * as admin from 'firebase-admin';
import { db } from '../firebase';
import { Proposal } from '../types';
import { recomputeTally } from './tally';
import { compareRaw } from './numbers';
import { ipfsRpc } from './ipfsRpc';

export async function finalizeProposalIfNeeded(proposalId: string, proposalData: Proposal): Promise<Proposal> {
    const now = admin.firestore.Timestamp.now();

    // 1. Check if already finalized
    if (['PASSED', 'FAILED', 'CLOSED'].includes(proposalData.status)) {
        // Even if finalized, check if results CID is missing and should be pinned
        if (!proposalData.resultsCid && (proposalData.status === 'PASSED' || proposalData.status === 'FAILED')) {
            console.log(`Results CID missing for finalized proposal ${proposalId}, attempting to pin...`);
            await pinResultsBundle(proposalId, proposalData);
        }
        return proposalData;
    }

    // 2. Check if it's time to finalize
    if (now.toMillis() < proposalData.endTime.toMillis()) {
        // Still active or upcoming, but let's check if it should be ACTIVE
        if (proposalData.status === 'UPCOMING' && now.toMillis() >= proposalData.startTime.toMillis()) {
            await db.collection('proposals').doc(proposalId).update({ status: 'ACTIVE' });
            return { ...proposalData, status: 'ACTIVE' };
        }
        return proposalData;
    }

    // 3. Finalize
    console.log(`Finalizing proposal ${proposalId}...`);
    const tally = await recomputeTally(proposalId);

    const isPassed = compareRaw(tally.totalForRaw, tally.totalAgainstRaw) > 0;
    const finalStatus: 'PASSED' | 'FAILED' = isPassed ? 'PASSED' : 'FAILED';

    const updateData: any = {
        ...tally,
        status: finalStatus,
        finalizedAt: now,
        resultsCidStatus: 'pending'
    };

    await db.collection('proposals').doc(proposalId).update(updateData);

    const updatedProposal = {
        ...proposalData,
        ...updateData,
        finalizedAt: now.toMillis()
    } as Proposal;

    // 4. Pin Results Bundle
    await pinResultsBundle(proposalId, updatedProposal);

    return updatedProposal;
}

/**
 * Builds and pins the results bundle to IPFS
 */
async function pinResultsBundle(proposalId: string, proposal: Proposal) {
    try {
        console.log(`Building results bundle for ${proposalId}...`);

        // Fetch all votes
        const votesSnapshot = await db.collection('votes')
            .where('proposalId', '==', proposalId)
            .get();

        const votes = votesSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                voter: data.voterAddress,
                choice: data.choice,
                weightRaw: data.weightRaw,
                signature: data.signature,
                messageHash: data.messageHash
            };
        });

        const resultsBundle = {
            schema: "parallel.results.v1",
            proposalId: proposalId,
            snapshotBlock: proposal.snapshotBlock,
            finalizedAt: proposal.finalizedAt ?
                (typeof proposal.finalizedAt === 'number' ? Math.floor(proposal.finalizedAt / 1000) : Math.floor(proposal.finalizedAt.toMillis() / 1000))
                : Math.floor(Date.now() / 1000),
            status: proposal.status,
            totals: {
                forRaw: proposal.totalForRaw,
                againstRaw: proposal.totalAgainstRaw,
                tokenPowerVotedRaw: proposal.tokenPowerVotedRaw,
                totalVoters: proposal.totalVoters
            },
            votes: votes
        };

        console.log(`[finalize] Pinning results bundle to IPFS for proposal: ${proposalId}...`);
        const cid = await ipfsRpc.pinJson(resultsBundle);
        console.log(`[finalize] Results CID generated: ${cid}`);

        await db.collection('proposals').doc(proposalId).update({
            resultsCid: cid,
            resultsCidPinnedAt: admin.firestore.Timestamp.now(),
            resultsCidStatus: 'pinned'
        });
        console.log(`[finalize] Firestore updated with results CID for ${proposalId}`);
    } catch (error: any) {
        console.error(`[finalize] Failed to pin results bundle for ${proposalId}:`, error.message);
        if (error.stack) console.error(error.stack);

        await db.collection('proposals').doc(proposalId).update({
            resultsCidStatus: 'failed',
            ipfsResultsError: error.message // Store error for debugging
        });
    }
}
