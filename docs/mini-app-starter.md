# Wallet-managed mini-app starter

Use this example when Bread should build, sign and submit your application's requests. It lives at `mini-app.html`, with reusable code in `src/mini-app/`. The existing counter at `index.html` demonstrates a separate, app-owned client workflow.

## Start from a clean checkout

Use Node 24 and Yarn Classic (1.22.22 through Corepack):

```sh
git clone https://github.com/0xMiden/frontend-template.git
cd frontend-template
corepack yarn install --frozen-lockfile
corepack yarn dev
```

Open `http://localhost:5173/mini-app.html`. This entry needs no `.env` file, counter deployment, contract build, faucet HTTP service or local node. It renders connection guidance in an ordinary browser without an injected provider. For a wallet session, open the same page in Bread's app browser or with the Bread extension and wait for provider detection. Select Bread, then explicitly connect. The provider requests **Testnet** and **no private-data categories**, with automatic connection disabled.

For local development in a native device, use a reachable HTTPS origin with the same build and headers; `localhost` refers to the device itself. Actual iOS/Android embedded-browser acceptance must be verified separately on those clients. An ordinary mobile browser does not gain a provider just by opening this page.

## Files and provider boundary

| File                            | Responsibility                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `src/mini-app/WalletRoot.tsx`   | A single `WalletProvider` and explicit network/permission policy.                       |
| `src/mini-app/wallets.ts`       | One adapter instance constructed in the browser, with stable identity.                  |
| `src/mini-app/MiniApp.tsx`      | Detection, explicit selection/connection, a public send form and reconciliation UI.     |
| `src/mini-app/useWalletSend.ts` | Persist-before-dispatch send and accepted-ID reconciliation, serialized with Web Locks. |
| `src/mini-app/journal.ts`       | Versioned local record and strict Testnet address/base-unit validation.                 |
| `e2e/mini-app.spec.ts`          | Built-browser checks using the released adapter and a controlled injected provider.     |

This entry does not mount `MidenProvider` or `MidenFiSignerProvider`, create a local SDK client/database/key, or call `signBytes`. Requests go through the wallet's `requestSend` and `waitForTransaction`. The adapter **does load the eager Web SDK's WASM types** to deserialize returned output notes. Keep this entry browser-only; an SSR host needs a client-only boundary.

For app-owned transactions where Bread supplies only signatures, use the separate signer-provider pattern in the [Mini-app guides](https://docs.miden.xyz/builder/mini-apps/). Connecting the existing counter does not change who submits its transactions.

The example retains this repository's stable pins: adapter packages `0.17.0`, core SDK `0.17.1`, React SDK `0.17.0`, and Vite plugin `0.17.0`. A deployed wallet may use another release. Check compatibility on the actual wallet, especially before adding serialized custom transactions. This example uses the supported typed public-send payload; it does not call the declared but unimplemented `createAccount` capability.

## Send and recover

Supply a valid `mtst1…` recipient, a valid Testnet token-issuer faucet address, and a positive integer amount in **token base units**. Addresses are decoded using the installed SDK. Hex addresses are excluded because they do not encode a network. Adapter amounts are `number`, so values above `Number.MAX_SAFE_INTEGER`, display decimals, zero and scientific notation are rejected before dispatch. Bread must still validate token type/support, fee availability, balance and its own account policy. No token or recipient is preconfigured.

Every send writes its intent to `miden-mini-app:send:v1` in `localStorage` before calling the wallet. This record contains the network, sender, recipient, token faucet, amount and phase; an accepted request ID and wallet result hash are added when available. It contains no key or private note body, but addresses and amounts are readable by other scripts on the same origin. Use a trusted, dedicated origin and preserve the record during reconciliation.

- A returned request ID means wallet acceptance. It is distinct from the result's `txHash`.
- A timeout leaves the accepted ID intact. **Check accepted request** polls that same ID after reconnection or reload, without sending again.
- A lost response, refusal or missing ID conservatively leaves an unresolved intent. Inspect wallet activity and establish its outcome before any manual recovery. This starter intentionally offers no button to discard unresolved work or blindly resend it.
- A changed account clears the form and blocks reconciliation until the original Testnet sender reconnects. The request itself stays saved.
- Only a wallet-reported result enables **Start another request**. Verify chain inclusion and resulting note state separately when your application needs settlement. A recipient must discover and consume the output note before its vault receives the asset.

One outstanding record is supported per origin. A Web Lock serializes dispatch, polling and completion across cooperating tabs; storage events refresh their displayed state. Web Locks require a secure context (HTTPS, or trusted localhost). If locks or storage are unavailable, or the stored record is corrupted/incompatible, the starter fails closed and does not dispatch. Never clear wallet databases or keys to recover this app's journal. Untrusted scripts or manual storage deletion can defeat these safeguards; this is a starter, not an idempotent payment backend.

## Check the example

```sh
corepack yarn test
corepack yarn typecheck
corepack yarn lint
corepack yarn build
corepack yarn playwright install chromium
corepack yarn test:browser
```

Browser tests start a short-lived production-preview subprocess on `127.0.0.1:4179` and stop it with the runner. They cover provider absence/delayed injection, connection refusal, the real adapter's payload and v0.17 note decoding, accepted-ID recovery across reload, changed accounts, unknown outcomes, competing tabs and a narrow viewport. They assert that the wallet-managed entry makes no network request outside its origin and creates no IndexedDB client store when opened without a provider.

These tests simulate the injected wallet, not Bread's extension/native approvals or a live chain. Before distributing a real app, separately verify the actual supported platforms, unlock/refusal/account-switch behavior, fees/admission, provider compatibility and chain settlement. Use disposable Testnet accounts. Build produces both `dist/index.html` and `dist/mini-app.html`; point the app's URL at the latter. Serve WASM with its proper MIME type and retain the template's isolation headers where needed.

## Explore listing

The reviewed wallet's current [Explore reader](https://github.com/0xMiden/wallet/blob/main/src/lib/explore-config/source.ts) reads per-network catalogs from [wallet-explore](https://github.com/0xMiden/wallet-explore), including `testnet.json` and repository icons. Prepare a catalog PR there with the actual HTTPS app URL, locale text, category, version bump and any icon, following that repository's validator. Listing does not grant connection, signing permission, admission or an endorsement.

[wallet-config](https://github.com/0xMiden/wallet-config) is the agreed destination for consolidation of dynamic wallet data. Explore migration and the corresponding wallet release are pending in the reviewed source. Confirm the deployed reader and schema before changing the submission destination; do not assume migration is released. This example creates neither a catalog entry nor a deployment. For the full integration and publishing workflow, use the Mini-app guides ([current](https://docs.miden.xyz/next/builder/mini-apps/) / [v0.17](https://docs.miden.xyz/builder/mini-apps/)) introduced by [docs PR381](https://github.com/0xMiden/docs/pull/381).
