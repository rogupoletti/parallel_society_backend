import * as admin from 'firebase-admin';
import { db } from '../firebase';
import { Proposal } from '../types';
import { recomputeTally } from './tally';
import { compareRaw } from './numbers';

export async function finalizeProposalIfNeeded(proposalId: string, proposalData: Proposal): Promise<Proposal> {
    const now = admin.firestore.Timestamp.now();

    // 1. Check if already finalized
    if (['PASSED', 'FAILED', 'CLOSED'].includes(proposalData.status)) {
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

    const isPassed = compareRaw(tally.totalFor, tally.totalAgainst) > 0;
    const finalStatus: 'PASSED' | 'FAILED' = isPassed ? 'PASSED' : 'FAILED';

    const updateData = {
        ...tally,
        status: finalStatus,
        finalizedAt: now
    };

    await db.collection('proposals').doc(proposalId).update(updateData);

    return {
        ...proposalData,
        ...updateData,
        finalizedAt: now.toMillis()
    } as Proposal;
}
