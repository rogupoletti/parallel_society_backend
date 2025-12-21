import { db } from '../firebase';
import { addRaw } from './numbers';

export async function recomputeTally(proposalId: string): Promise<{
    totalFor: string;
    totalAgainst: string;
    totalVoters: number;
    tokenPowerVoted: string;
}> {
    const votesSnapshot = await db.collection('votes')
        .where('proposalId', '==', proposalId)
        .get();

    let totalFor = '0';
    let totalAgainst = '0';
    let totalVoters = votesSnapshot.size;

    votesSnapshot.forEach(doc => {
        const vote = doc.data();
        if (vote.choice === 'FOR') {
            totalFor = addRaw(totalFor, vote.weight);
        } else if (vote.choice === 'AGAINST') {
            totalAgainst = addRaw(totalAgainst, vote.weight);
        }
    });

    const tokenPowerVoted = addRaw(totalFor, totalAgainst);

    return {
        totalFor,
        totalAgainst,
        totalVoters,
        tokenPowerVoted
    };
}
