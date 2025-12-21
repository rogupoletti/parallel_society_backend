import * as functions from 'firebase-functions';
import { db } from '../firebase';
import { verifyAuthToken } from '../services/auth';
import { getLUTBalance, provider } from '../services/lutBalance';
import { CreateProposalRequest, Proposal } from '../types';
import * as admin from 'firebase-admin';

export const createProposal = functions.https.onRequest(async (req, res) => {
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
        console.log('Received createProposal request');
        // 1. Verify Auth
        let authorAddress;
        try {
            authorAddress = await verifyAuthToken(req.headers.authorization);
            console.log(`Authenticated user: ${authorAddress}`);
        } catch (authError: any) {
            console.warn('Auth verification failed:', authError.message);
            res.status(401).json({ error: authError.message });
            return;
        }

        // 2. Check LUT Balance (>= 2000)
        console.log(`Checking LUT balance for: ${authorAddress}`);
        let balance;
        try {
            balance = await getLUTBalance(authorAddress);
            console.log(`Current balance: ${balance}`);
        } catch (balanceError: any) {
            console.error('Error checking LUT balance:', balanceError);
            res.status(500).json({ error: balanceError.message || 'Failed to verify LUT balance' });
            return;
        }

        if (balance < 2000) {
            console.warn(`Insufficient balance: ${balance}`);
            res.status(403).json({
                error: 'Insufficient LUT balance',
                message: 'You need at least 2,000 LUT to create a proposal.',
                currentBalance: balance
            });
            return;
        }

        const body = req.body as CreateProposalRequest;
        console.log('Validating proposal body:', body);

        // 3. Validate Body
        if (!body.title || !body.category || !body.description) {
            console.warn('Missing required fields');
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        // 4. Capture Snapshot Block
        const snapshotBlock = await provider.getBlockNumber();
        console.log(`Snapshot block captured: ${snapshotBlock}`);

        // 5. Set Times
        const now = admin.firestore.Timestamp.now();
        const startTime = body.startTime ?
            admin.firestore.Timestamp.fromMillis(body.startTime) :
            now;
        const endTime = body.endTime ?
            admin.firestore.Timestamp.fromMillis(body.endTime) :
            admin.firestore.Timestamp.fromMillis(now.toMillis() + (3 * 24 * 60 * 60 * 1000)); // Now + 3 days

        // 6. Create Proposal
        const proposal: Proposal = {
            title: body.title,
            category: body.category,
            description: body.description,
            authorAddress: authorAddress.toLowerCase(),
            createdAt: now,
            startTime,
            endTime,
            status: 'ACTIVE',
            totalForRaw: '0',
            totalAgainstRaw: '0',
            tokenPowerVotedRaw: '0',
            totalVoters: 0,
            snapshotBlock,
            snapshotChainId: 30, // RSK Mainnet
            strategy: 'lut-erc20-balance@block'
        };

        console.log('Adding proposal to Firestore...');
        const docRef = await db.collection('proposals').add(proposal);
        console.log(`Proposal created with ID: ${docRef.id}`);

        res.status(201).json({
            id: docRef.id,
            ...proposal,
            createdAt: now.toMillis(),
            startTime: startTime.toMillis(),
            endTime: endTime.toMillis()
        });

    } catch (error: any) {
        console.error('Unexpected error in createProposal:', error);
        res.status(500).json({ error: error.message || 'An unexpected error occurred' });
    }
});
