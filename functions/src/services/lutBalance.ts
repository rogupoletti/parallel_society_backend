import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RSK_RPC_URL);
const LUT_TOKEN_ADDRESS = process.env.LUT_TOKEN_ADDRESS || '';
const LUT_TOKEN_DECIMALS = parseInt(process.env.LUT_TOKEN_DECIMALS || '18');

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

export async function getLUTBalanceRaw(address: string): Promise<string> {
    if (!LUT_TOKEN_ADDRESS) {
        console.error("LUT_TOKEN_ADDRESS is not configured in .env");
        throw new Error("Backend configuration error: LUT_TOKEN_ADDRESS missing");
    }

    try {
        const contract = new ethers.Contract(LUT_TOKEN_ADDRESS, ERC20_ABI, provider);
        const balanceBN = await contract.balanceOf(address);
        return balanceBN.toString();
    } catch (error: any) {
        console.error("Error fetching LUT balance from RSK:", error.message);
        throw new Error("Failed to verify LUT balance. Please ensure the RSK network is accessible.");
    }
}

export async function getLUTBalance(address: string): Promise<number> {
    const raw = await getLUTBalanceRaw(address);
    return parseFloat(ethers.formatUnits(raw, LUT_TOKEN_DECIMALS));
}
