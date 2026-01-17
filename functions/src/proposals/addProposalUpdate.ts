import * as functions from 'firebase-functions';
import { db } from '../firebase';
import { verifyAuthToken } from '../services/auth';
import { getLUTBalance } from '../services/lutBalance';
import { AddProposalUpdateRequest, ProposalUpdate } from '../types';
import * as admin from 'firebase-admin';

const ALLOWED_STATUSES = ['Planning', 'In Progress', 'Delayed', 'Completed', 'Started'];

export const addProposalUpdate = functions.https.onRequest(async (req, res) => {
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
        console.log('Received addProposalUpdate request');
        
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
                message: 'You need at least 2,000 LUT to add proposal updates.',
                currentBalance: balance
            });
            return;
        }

        const body = req.body as AddProposalUpdateRequest;
        console.log('Validating request body:', body);

        // 3. Validate Body
        if (!body.proposalId || !body.status || !body.content) {
            console.warn('Missing required fields');
            res.status(400).json({ error: 'Missing required fields: proposalId, status, content' });
            return;
        }

        // 4. Validate Status Value
        if (!ALLOWED_STATUSES.includes(body.status)) {
            console.warn(`Invalid status value: ${body.status}`);
            res.status(400).json({ 
                error: 'Invalid status value',
                message: `Status must be one of: ${ALLOWED_STATUSES.join(', ')}`
            });
            return;
        }

        // 5. Check if Proposal Exists
        const proposalDoc = await db.collection('proposals').doc(body.proposalId).get();
        if (!proposalDoc.exists) {
            console.warn(`Proposal not found: ${body.proposalId}`);
            res.status(404).json({ error: 'Proposal not found' });
            return;
        }

        // 6. Verify Proposal Status is PASSED
        const proposalData = proposalDoc.data();
        if (proposalData?.status !== 'PASSED') {
            console.warn(`Proposal status is ${proposalData?.status}, not PASSED`);
            res.status(400).json({ 
                error: 'Invalid proposal status',
                message: 'Only approved proposals (status PASSED) can receive updates',
                currentStatus: proposalData?.status
            });
            return;
        }

        // 7. Create Proposal Update Object
        const now = admin.firestore.Timestamp.now();
        const proposalUpdate: ProposalUpdate = {
            proposalId: body.proposalId,
            authorAddress: authorAddress.toLowerCase(),
            status: body.status,
            content: body.content,
            createdAt: now,
            attachments: body.attachments || []
        };

        console.log('Adding proposal update to Firestore...');
        const docRef = await db.collection('proposalUpdates').add(proposalUpdate);
        const updateId = docRef.id;
        console.log(`Proposal update created with ID: ${updateId}`);

        res.status(201).json({
            id: updateId,
            ...proposalUpdate,
            createdAt: now.toMillis()
        });

    } catch (error: any) {
        console.error('Unexpected error in addProposalUpdate:', error);
        res.status(500).json({ error: error.message || 'An unexpected error occurred' });
    }
});
