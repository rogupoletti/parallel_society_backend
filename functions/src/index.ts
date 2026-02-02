import { requestNonce } from './auth/requestNonce';
import { verify } from './auth/verifySignature';
import { checkUsername } from './auth/checkUsername';
import { createProposal } from './proposals/createProposal';
import { listProposals } from './proposals/listProposals';
import { getProposal } from './proposals/getProposal';

import { importSnapshot } from './proposals/importSnapshot';
import { deleteProposal } from './proposals/deleteProposal';
import { voteOnProposal } from './proposals/voteOnProposal';
import { addProposalUpdate } from './proposals/addProposalUpdate';
import { getProposalUpdates } from './proposals/getProposalUpdates';
import { editProposalUpdate } from './proposals/editProposalUpdate';
import { deleteProposalUpdate } from './proposals/deleteProposalUpdate';

// Export functions to be deployed
export const authRequestNonce = requestNonce;
export const authVerify = verify;
export const authCheckUsername = checkUsername;
export {
    createProposal,
    listProposals,
    getProposal,
    importSnapshot,
    deleteProposal,
    voteOnProposal,
    addProposalUpdate,
    getProposalUpdates,
    editProposalUpdate,
    deleteProposalUpdate
};
