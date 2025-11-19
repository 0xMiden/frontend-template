# React + TypeScript + Vite + Miden

This template provides a minimal example on how to work with Miden using Vite.

This repository is based on the actual [create-vite NPM template](https://www.npmjs.com/package/create-vite).

## Demo Client Interaction

The project includes a simple example of Miden client interactions in `src/miden/lib/demo.ts`. This demo file showcases a workflow for interacting with the Miden network, including:

- **Client Initialization**: Connecting to the Miden Testnet
- **Account Creation**: Creating new wallet accounts (Alice)
- **Faucet Setup**: Creating a fungible token faucet with custom tokens
- **Token Minting**: Minting tokens to an account via P2ID notes
- **Note Consumption**: Consuming notes to receive fungible assets
- **Token Transfers**: Sending tokens between accounts

The demo is a practical reference for building client-side applications that interact with the Miden rollup network, demonstrating the key primitives and transaction flows available through the Miden SDK.

### Running the Demo

To explore the demo implementation, check out `src/miden/lib/demo.ts`. This file can serve as a starting point for building your own Miden-enabled applications.
