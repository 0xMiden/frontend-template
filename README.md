# Miden Frontend Template

Minimal Vite + React + TypeScript template for building Miden frontends. Includes a live Miden testnet network counter demo that publishes an increment note via the MidenFi wallet adapter and lets the network operator auto-execute it against the counter.

## Getting Started

```bash
yarn install
yarn dev
```

Open [http://localhost:5173](http://localhost:5173). The app connects to Miden testnet out of the box and renders the current counter value. Install the [MidenFi wallet extension](https://chromewebstore.google.com/detail/midenfi), connect, and click the counter to submit an increment.

## Project Structure

```
src/
├── App.tsx                         # Root component
├── providers.tsx                   # MidenProvider + wallet adapter setup
├── config.ts                       # Constants (counter address, explorer URL, SDK config)
├── components/
│   ├── AppContent.tsx              # Page layout, logos, wallet button
│   ├── Counter.tsx                 # Counter UI (configured / unconfigured)
│   └── ConfiguredCounter.tsx       # Counter UI when address is set
├── hooks/
│   └── useIncrementCounter.ts      # Note construction, wallet submission, bounded poll
└── lib/
    └── miden.ts                    # Shared Miden utilities

public/packages/
├── counter_account.masp            # Compiled counter contract (MASP format v4)
└── increment_note.masp             # Compiled increment note script
```

## Network Counter Demo

The template demonstrates the Miden network-note pattern on testnet:

1. A **counter account** is deployed as a network account (`AccountStorageMode::Network`) on testnet. This template ships with a live deployment at [`mtst1aqmx7qv6h3y92sqsmunh8uht4ujmfy4j`](https://testnet.midenscan.com/account/mtst1aqmx7qv6h3y92sqsmunh8uht4ujmfy4j).
2. On button click, the frontend constructs a **public note** targeting the counter and submits it through the MidenFi wallet (the wallet signs and posts the transaction, not the in-browser client).
3. The **network operator** picks up the note (tag + `NoteAttachment::newNetworkAccountTarget`) and executes it against the counter account, incrementing the on-chain count.
4. The frontend polls `client.getAccount(counterAddress)` and re-reads the `StorageMap`; once the value changes it updates the UI. If the network is slow, polling falls back to a 30 s timeout.

Pre-compiled `.masp` packages built with `cargo-miden 0.8.1` (matching `@miden-sdk/miden-sdk@0.14.x`) live in `public/packages/`.

### Pointing at your own counter

The counter address is resolved at runtime via the `VITE_MIDEN_COUNTER_ADDRESS` environment variable (`src/config.ts`):

| `VITE_MIDEN_COUNTER_ADDRESS` value | Effect |
|---|---|
| unset / commented out (default) | Use the live testnet counter shipped with the template (`mtst1aqmx7qv6h3y92sqsmunh8uht4ujmfy4j`). |
| empty string (`VITE_MIDEN_COUNTER_ADDRESS=`) | Unconfigured — `<Counter>` renders the "address not configured" card and makes no network calls. |
| any bech32 string (`mtst1...`) | Uses your own deployment. |

The slot-name constant is fixed in `src/config.ts` and must match the counter contract's storage map name.

To redeploy (e.g. after modifying contract sources):

1. In the [project-template](https://github.com/0xMiden/project-template) repo on the `migrate-clien-v014` branch, run the deployment binary:
   ```bash
   cargo install cargo-miden --version 0.8.1
   cargo run -p integration --release --bin increment_count
   ```
   The binary builds `contracts/counter-account` + `contracts/increment-note`, creates the counter with `AccountStorageMode::Network`, and prints the bech32 address.
2. Copy the freshly built artifacts into this template:
   ```bash
   cp contracts/counter-account/target/miden/release/counter_account.masp \
      <frontend-template>/public/packages/
   cp contracts/increment-note/target/miden/release/increment_note.masp \
      <frontend-template>/public/packages/
   ```
3. Set `VITE_MIDEN_COUNTER_ADDRESS=<your bech32 address>` in `.env` (or your shell environment) — no source edit required.
4. Verify with `.claude/hooks/check-artifacts.sh` (checks MASP format version).

## Key Dependencies

| Package | Version pin | Purpose |
|---------|-------------|---------|
| `@miden-sdk/react` | `0.14.x` | React hooks for Miden (useAccount, useSyncState, useMiden, useMidenClient, useTransaction, …) |
| `@miden-sdk/miden-sdk` | `0.14.x` | Core SDK types (Note, NoteScript, AccountId, Word, Felt, …) |
| `@miden-sdk/vite-plugin` | `0.14.x` | Vite plugin that handles WASM loading, top-level await, and COOP/COEP |
| `@miden-sdk/miden-wallet-adapter-react` | `0.14.x` | MidenFi wallet adapter React context + hooks |
| `@miden-sdk/miden-wallet-adapter-base` | `0.14.x` | `Transaction.createCustomTransaction` helper used by the increment flow |

## Configuration

SDK settings can be overridden via environment variables (see `.env.example`):

```bash
VITE_MIDEN_RPC_URL=testnet   # "devnet" | "testnet" | "localhost" | custom URL
VITE_MIDEN_PROVER=testnet    # "devnet" | "testnet" | "local" | custom URL
```

## Verification

Automated gates that must all stay green:

```bash
npx tsc -b --noEmit       # type check
npx vitest --run          # 36 unit tests (components, hook, patterns)
npx vite build            # production build (emits dist/)
npx eslint .              # lint
```

The PostToolUse hook runs typecheck + affected tests after every edit. The Stop hook runs the full suite when a task completes.

Browser-level verification (render correctness, no console errors, wallet popup, E2E increment) can be done with either:
- **Playwright MCP** for headless render / console checks
- **Claude in Chrome** (via the `/chrome` command) to exercise the real MidenFi extension

## Known Temporary Workarounds

One active workaround remains after the 0.14.4 upgrade, covering an upstream feature gap. The inline comment in `src/hooks/useIncrementCounter.ts` describes the removal steps.

### Fixed-interval network poll — waiting for Network-mode account updates ([miden-client#2111](https://github.com/0xMiden/miden-client/issues/2111))

After `wallet.requestTransaction` returns, `src/hooks/useIncrementCounter.ts` bounded-polls the counter's storage map until the value changes or a 30 s timeout elapses. The React SDK's `useWaitForCommit` only watches *locally-submitted* transactions — our increment is wallet-submitted and consumed externally by the network operator, so it never reaches the local client's transaction log. [`#2111`](https://github.com/0xMiden/miden-client/issues/2111) tracks a React-SDK subscription primitive for account-state updates driven by external consumers (scoped narrowly from the broader event-system discussion in [`#467`](https://github.com/0xMiden/miden-client/issues/467)).

**After #2111 lands a subscription primitive:**
1. Replace the `while` poll loop in `useIncrementCounter.ts::increment` with the new subscription / waitFor API.
2. Remove `NETWORK_POLL_INTERVAL_MS` + `NETWORK_POLL_TIMEOUT_MS` from `src/config.ts` if no other consumer depends on them.
3. Remove the `#2111` TODO block.

## AI Developer Experience

This template ships with `.claude/` skills for AI coding tools. Skills cover React SDK patterns, frontend pitfalls, Vite + WASM setup, signer integration, testing patterns, and Miden architecture. See `CLAUDE.md` for the full developer guide.
