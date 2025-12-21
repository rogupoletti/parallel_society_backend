
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PROJECT_ID = process.env.PS_PROJECT_ID || 'demo-project';
const REGION = 'us-central1';
const HOST = process.env.FUNCTIONS_EMULATOR_HOST || 'http://127.0.0.1:5001';

const BASE_URL = `${HOST}/${PROJECT_ID}/${REGION}`;
const REQUEST_NONCE_URL = `${BASE_URL}/authRequestNonce`;
const VERIFY_URL = `${BASE_URL}/authVerify`;
const LIST_PROPOSALS_URL = `${BASE_URL}/listProposals`;
const VOTE_URL = `${BASE_URL}/voteOnProposal`;
const GET_PROPOSAL_URL = `${BASE_URL}/getProposal`;

async function fetchJson(url: string, options: any = {}) {
    const res = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return res.json();
}

async function authenticate() {
    console.log('Authenticating...');
    const wallet = ethers.Wallet.createRandom();
    console.log(`Generated Wallet: ${wallet.address}`);

    // 1. Get Nonce
    const nonceData = await fetchJson(REQUEST_NONCE_URL, {
        method: 'POST',
        body: JSON.stringify({ address: wallet.address })
    });
    const nonce = nonceData.nonce;

    // 2. Sign
    const message = `Sign in to Parallel Society Governance\nNonce: ${nonce}`;
    const signature = await wallet.signMessage(message);

    // 3. Verify & Get Token
    const verifyData = await fetchJson(VERIFY_URL, {
        method: 'POST',
        body: JSON.stringify({ address: wallet.address, signature })
    });
    return { token: verifyData.token, address: wallet.address };
}

async function runVerification() {
    try {
        const { token, address } = await authenticate();
        console.log('Authentication successful.');

        // 1. Find an Active Proposal
        console.log('Listing proposals...');
        const proposals = await fetchJson(LIST_PROPOSALS_URL);
        const activeProposal = proposals.find((p: any) => p.status === 'ACTIVE');

        if (!activeProposal) {
            console.warn('WARNING: No ACTIVE proposals found. Cannot verify voting.');
            console.log('Available proposals:', proposals.map((p: any) => ({ id: p.id, status: p.status })));
            return;
        }

        console.log(`Found Active Proposal: ${activeProposal.title} (${activeProposal.id})`);

        // 2. Vote
        console.log(`Voting FOR on proposal ${activeProposal.id}...`);
        const voteRes = await fetchJson(VOTE_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                id: activeProposal.id,
                choice: 'FOR'
            })
        });

        console.log('Vote Response:', voteRes.message);

        // 3. Verify
        console.log('Verifying vote...');
        const verifyRes = await fetchJson(`${GET_PROPOSAL_URL}?id=${activeProposal.id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const myVote = verifyRes.myVote;
        console.log('My Vote recorded:', myVote);

        if (myVote && myVote.choice === 'FOR') {
            console.log('SUCCESS: Vote verified!');
        } else {
            console.error('FAILURE: Vote not recorded correctly.');
        }

    } catch (error: any) {
        console.error('Verification Error:', error.message);
    }
}

runVerification();
