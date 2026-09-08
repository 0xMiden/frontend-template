# Miden Frontend Template

Minimal Vite + React + TypeScript template for building Miden frontends. It ships a Miden testnet counter demo that reads a shared on-chain counter and **increments it end-to-end from the browser** — the in-browser WebClient publishes an increment note and consumes it against the public `NoAuth` counter, no wallet required. Built on SDK v0.16.0-rc.7; configure a compatible counter deployment (see [Counter Demo](#counter-demo)).

## Getting Started

```bash
yarn install
yarn dev
```

Open [http://localhost:5173](http://localhost:5173). Set `VITE_MIDEN_COUNTER_ADDRESS` in `.env.local` to a compatible v0.16 counter and restart Vite. The app defaults to Miden testnet, renders the counter value, and lets you increment it on-chain by clicking the counter button — no wallet required (the button drives the full publish + consume flow via the in-browser client). Optionally install the [MidenFi wallet extension](https://chromewebstore.google.com/detail/midenfi) and connect to explore the wallet adapter, though the counter demo does not use it. See [Counter Demo](#counter-demo).

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
│   └── useIncrementCounter.ts      # Note construction, SDK submission, bounded poll
└── lib/
    ├── funding.ts                  # Fee funding: faucet HTTP/PoW, consume and confirmation
    └── miden.ts                    # Shared Miden utilities

public/packages/
├── counter-account.masp            # Compiled v0.16 counter contract
└── increment-note.masp             # Compiled v0.16 increment note script
```

## Counter Demo

The template demonstrates incrementing a shared on-chain counter on Miden testnet, entirely from the browser via the local WebClient (no wallet required):

1. A **counter account** — a **public, `NoAuth` + `BasicWallet`** account built from `counter-account.masp` — must be deployed on the selected v0.16 network. The old v0.15 testnet deployment is incompatible; no default v0.16 address is bundled yet.
2. On button click the in-browser WebClient restores or creates a local sender, **publishes** a plain increment note (built from `increment-note.masp`, tag `0`, no attachment) as the sender's own output note, then **consumes** it as the counter (NoAuth ⇒ no signature). Both transactions use the configured remote prover and the local client — no wallet involved.
3. Before publishing, `fundAccounts` ensures sender and counter have a fee reserve (256 base-fee units). It reuses available P2ID fee notes or requests them from the public faucet, consumes them and checks the confirmed balance. `BasicWallet` lets the counter receive these notes; NoAuth accounts still pay fees. This shared demo account must only hold test tokens.
4. The frontend waits for each transaction with `useWaitForCommit`, then re-reads the counter's `StorageMap`. A timeout does not cancel a submission; recovery of a whole increment across retries or reloads is outside this template's scope.

> **v0.16 status:** the SDK flow has been exercised in a browser against a simulated chain, including funding timeouts. Live verification against a compatible fee-enabled deployment is still required. The client retains `useWorker: false` and remote proving; see Implementation Notes below.

The `.masp` packages in `public/packages/` (`counter-account.masp`, `increment-note.masp`) have been updated for v0.16. See "Pointing at your own counter" below to rebuild/redeploy against your own counter.

### Pointing at your own counter

The counter address is resolved at runtime via the `VITE_MIDEN_COUNTER_ADDRESS` environment variable (`src/config.ts`):

| `VITE_MIDEN_COUNTER_ADDRESS` value | Effect |
|---|---|
| unset / commented out (default) | Unconfigured — set a compatible v0.16 deployment. |
| empty string (`VITE_MIDEN_COUNTER_ADDRESS=`) | Unconfigured — `<Counter>` renders the "address not configured" card and makes no network calls. |
| any account id — hex (`0x…`) or bech32 (`mtst1…`) | Uses your own deployment (resolved via `AccountId.fromHex` / `fromBech32`). |

The slot-name constant is fixed in `src/config.ts` and must match the counter contract's storage map name.

To redeploy (e.g. after modifying contract sources):

> **v0.16 note:** rebuild both contracts with a matching v0.16 toolchain. Deploy the counter with current `NoAuth` and `BasicWallet` components; keep contract sources and build tooling in the contract project.

1. In the [project-template](https://github.com/0xMiden/project-template) repo (on the branch matching your SDK version), follow its build and deployment instructions to obtain a compatible public counter address.
2. Copy the freshly built artifacts into this template:
   ```bash
   cp contracts/counter-account/target/miden/release/counter_account.masp \
      <frontend-template>/public/packages/counter-account.masp
   cp contracts/increment-note/target/miden/release/increment_note.masp \
      <frontend-template>/public/packages/increment-note.masp
   ```
3. Set `VITE_MIDEN_COUNTER_ADDRESS=<your bech32 address>` in `.env` (or your shell environment) — no source edit required.
4. Verify the files exist with `.claude/hooks/check-artifacts.sh` (it checks the `.masp` files are present and non-trivial in size; note it does **not** validate the MASP/MAST format version, so it will not catch a v0.15 ↔ v0.16 version mismatch).

## Key Dependencies

| Package | Version pin | Purpose |
|---------|-------------|---------|
| `@miden-sdk/react` | `0.16.0-rc.7` | React hooks for Miden (useAccount, useSyncState, useMiden, useMidenClient, useTransaction, …) |
| `@miden-sdk/miden-sdk` | `0.16.0-rc.7` | Core SDK types (Note, NoteScript, AccountId, Word, Felt, …) |
| `@miden-sdk/vite-plugin` | `0.16.0-rc.7` | Vite plugin that handles WASM loading, top-level await, and COOP/COEP |
| `@miden-sdk/miden-wallet-adapter-react` | `0.16.0-rc.7` | MidenFi wallet adapter React context + hooks |
| `@miden-sdk/miden-wallet-adapter-base` | `0.16.0-rc.7` | Wallet adapter types and network configuration |

## Configuration

SDK settings can be overridden via environment variables (see `.env.example`):

```bash
VITE_MIDEN_RPC_URL=testnet   # "devnet" | "testnet" | "localhost" | custom URL
VITE_MIDEN_PROVER=testnet    # "devnet" | "testnet" | "local" | custom URL
VITE_MIDEN_FAUCET_URL=https://faucet-api.testnet.miden.io
```

Custom RPCs require a faucet that mints that network's fee asset. After a chain reset, use a fresh browser origin/profile; old IndexedDB state is incompatible. The app does not automatically erase wallets or keys.

## Verification

Automated gates that must all stay green:

```bash
npx tsc -b --noEmit       # type check
npx vitest --run          # unit tests (components, hook, funding, patterns)
npx vite build            # production build (emits dist/)
npx eslint .              # lint
```

The PostToolUse hook runs typecheck + affected tests after every edit. The Stop hook runs the full suite when a task completes.

Browser-level verification (render correctness, no console errors, wallet popup, E2E increment) can be done with either:
- **Playwright MCP** for headless render / console checks
- **Claude in Chrome** (via the `/chrome` command) to exercise the real MidenFi extension

## Implementation Notes

The v0.16 flow retains two implementation requirements from the previous integration; both are explained below and in `src/providers.tsx`.

### `useWorker: false` — single SMT forest so the imported counter can be applied

The counter is an **existing** on-chain account this client *imports* (rather than creates), so consuming a note against it applies a *delta* transaction. Under the default worker shim the client keeps two in-memory SMT "forests" — one in the main thread, one in the worker — over the same IndexedDB. `importAccountById` registers only the main-thread forest, but `submitNewTransaction`/`apply_transaction` runs in the worker, whose forest never contains the late-imported counter — so the consume fails with `apply transaction result: storage error: account data wasn't found for account id …`. Running with `useWorker: false` (set on `MidenProvider` in `src/providers.tsx`) collapses this to one thread → one forest, so the imported counter is present when the consume is applied. (Verified against `web-sdk crates/idxdb-store/src/transaction/mod.rs`.)

### Remote proving — keep the single thread off proof generation

Because there is no worker, `useIncrementCounter.ts::increment` uses `useTransaction` and `useConsume` with the provider's remote prover configuration. Remote proving keeps proof generation off the main thread. SDK mutation hooks own their locks; direct client calls and `useWaitForCommit` are serialized with `runExclusive` in rc.7.

### Transaction confirmation and funding

After publishing, the frontend waits for commitment and polls for its exact note ID every `NETWORK_POLL_INTERVAL_MS` (2.5 s), bounded by `NETWORK_POLL_TIMEOUT_MS` (60 s). After consumption commits, it syncs and reads the confirmed count. Fee-enabled transactions also produce a fee note, so the increment note is matched by ID rather than output position.

All funding logic lives in `src/lib/funding.ts`, behind `fundAccounts`, ready to be replaced by an SDK funding method. It preserves known funding note IDs and checks the SDK's consumption record on retries. If the faucet HTTP response fails, it syncs again to find an issued P2ID fee note; later attempts also check existing funding before requesting more tokens. `useMint` executes a faucet account and does not replace the public faucet HTTP request.

## AI Developer Experience

This template ships with `.claude/` skills for AI coding tools. Skills cover React SDK patterns, frontend pitfalls, Vite + WASM setup, signer integration, testing patterns, and Miden architecture. See `CLAUDE.md` for the full developer guide.
