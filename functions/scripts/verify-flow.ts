import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env from the current directory (functions/)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// USAGE:
// 1. Start emulators: npm run serve
// 2. Run this script: npx ts-node scripts/verify-flow.ts

const PROJECT_ID = process.env.PS_PROJECT_ID || 'demo-project';
const REGION = 'us-central1';
const HOST = process.env.FUNCTIONS_EMULATOR_HOST || 'http://127.0.0.1:5001';

const REQUEST_NONCE_URL = `${HOST}/${PROJECT_ID}/${REGION}/authRequestNonce`;
const VERIFY_URL = `${HOST}/${PROJECT_ID}/${REGION}/authVerify`;

async function main() {
    console.log(`Targeting project: ${PROJECT_ID}`);

    // 1. Create a random wallet
    const wallet = ethers.Wallet.createRandom();
    console.log(`\n1. Generated Wallet: ${wallet.address}`);

    // 2. Request Nonce
    console.log(`\n2. Requesting Nonce from ${REQUEST_NONCE_URL}...`);
    try {
        const nonceRes = await fetch(REQUEST_NONCE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: wallet.address })
        });

        if (!nonceRes.ok) {
            const text = await nonceRes.text();
            throw new Error(`Failed to get nonce: ${nonceRes.status} ${text}`);
        }

        const nonceData = await nonceRes.json();
        const nonce = nonceData.nonce;
        console.log(`   Received Nonce: ${nonce}`);

        // 3. Sign Message
        console.log(`\n3. Signing Message...`);
        const message = `Sign in to Parallel Society Governance\nNonce: ${nonce}`;
        console.log(`   Message: "${message.replace(/\n/g, '\\n')}"`);

        const signature = await wallet.signMessage(message);
        console.log(`   Signature: ${signature.substring(0, 20)}...`);

        // 4. Verify Signature
        console.log(`\n4. Verifying Signature at ${VERIFY_URL}...`);
        const verifyRes = await fetch(VERIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: wallet.address, signature })
        });

        if (!verifyRes.ok) {
            const text = await verifyRes.text();
            throw new Error(`Failed to verify: ${verifyRes.status} ${text}`);
        }

        const verifyData = await verifyRes.json();
        console.log(`   SUCCESS! Custom Token: ${verifyData.token.substring(0, 20)}...`);

    } catch (err) {
        console.error('ERROR:', err);
    }
}

main();
