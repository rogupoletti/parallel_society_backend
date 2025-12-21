# Parallel Society Backend (Phase 1: Auth)

This repository contains the Firebase Cloud Functions for the Parallel Society Governance App.

## Prerequisites

- Node.js 18+
- Firebase CLI (`npm install -g firebase-tools`)
- A Firebase Project created in the Firebase Console.

## Setup

1.  Navigate to `functions` folder:
    ```bash
    cd functions
    npm install
    ```

2.  Login to Firebase:
    ```bash
    firebase login
    ```

3.  Set your project:
    ```bash
    firebase use <your-project-id>
    ```

## Development

To run the functions locally using the Firebase Emulator:

```bash
cd functions
npm run serve
```

This will spin up the functions at `http://127.0.0.1:5001/<project-id>/us-central1/...`

## Deployment

To deploy to production:

```bash
firebase deploy --only functions
```

## Authentication Flow

1.  **Request Nonce**:
    - `POST /authRequestNonce`
    - Body: `{ "address": "0x..." }`
2.  **Verify Signature**:
    - `POST /authVerify`
    - Body: `{ "address": "0x...", "signature": "0x..." }`
    - Returns: `{ "token": "custom-firebase-token" }`
