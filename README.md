# Miden Frontend Template

Minimal Vite + React + TypeScript template for building Miden frontends. It ships a Miden testnet counter demo that reads a shared on-chain counter and **increments it end-to-end from the browser** — the in-browser WebClient publishes an increment note and consumes it against the public `NoAuth` counter, no wallet required. Built on SDK v0.15; the full read + write flow is verified live on testnet (see [Counter Demo](#counter-demo)).

## Getting Started

```bash
yarn install
yarn dev
```

Open [http://localhost:5173](http://localhost:5173). The app connects to Miden testnet out of the box, renders the current counter value, and lets you increment it on-chain by clicking the counter button — no wallet required (the button drives the full publish + consume flow via the in-browser client). Optionally install the [MidenFi wallet extension](https://chromewebstore.google.com/detail/midenfi) and connect to explore the wallet adapter, though the counter demo does not use it. See [Counter Demo](#counter-demo).

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
├── counter_account.masp            # Compiled counter contract (pre-v0.15 build — rebuild for v0.15)
└── increment_note.masp             # Compiled increment note script (pre-v0.15 build — rebuild for v0.15)
```

## Counter Demo

The template demonstrates incrementing a shared on-chain counter on Miden testnet, entirely from the browser via the local WebClient (no wallet required):

1. A **counter account** — a plain **public, `NoAuth`** account built from `counter-account.masp` — is deployed on testnet. This template ships with a live v0.15 deployment at [`0x4dcaee76ffebfc511e06582702289d`](https://testnet.midenscan.com/account/0x4dcaee76ffebfc511e06582702289d).
2. On button click the in-browser WebClient creates a throwaway local sender, **publishes** a plain increment note (built from `increment-note.masp`, tag `0`, no attachment) as the sender's own output note, then **consumes** it as the counter (NoAuth ⇒ no signature). Both transactions are proven by the remote testnet prover and submitted by the local client — no wallet involved.
3. The frontend polls `client.getAccount(counterAddress)` and re-reads the `StorageMap`; once the value advances past the pre-consume baseline it updates the UI (bounded by a 60 s timeout).

> **✅ v0.15 status — the full increment path works end-to-end in the browser.** Verified live on testnet (clean console, on-chain count advances). Two implementation requirements are baked in and explained in `CLAUDE.md` → "v0.15 Increment Flow": the client runs with `useWorker: false` (so the imported counter is present in the single in-memory SMT forest when the consume transaction is applied), and transactions are submitted with the **remote** prover (`submitNewTransactionWithProver`) so the single thread only pays local execution, not minutes-long local proving.

The `.masp` packages in `public/packages/` (`counter-account.masp`, `increment-note.masp`) are v0.15 builds — MAST version `[0,0,3]`, compiled with `cargo-miden 0.9`. See "Pointing at your own counter" below to rebuild/redeploy against your own counter.

### Pointing at your own counter

The counter address is resolved at runtime via the `VITE_MIDEN_COUNTER_ADDRESS` environment variable (`src/config.ts`):

| `VITE_MIDEN_COUNTER_ADDRESS` value | Effect |
|---|---|
| unset / commented out (default) | Use the live v0.15 testnet counter shipped with the template (`0x4dcaee76ffebfc511e06582702289d`). |
| empty string (`VITE_MIDEN_COUNTER_ADDRESS=`) | Unconfigured — `<Counter>` renders the "address not configured" card and makes no network calls. |
| any account id — hex (`0x…`) or bech32 (`mtst1…`) | Uses your own deployment (resolved via `AccountId.fromHex` / `fromBech32`). |

The slot-name constant is fixed in `src/config.ts` and must match the counter contract's storage map name.

To redeploy (e.g. after modifying contract sources):

> **v0.15 note:** the shipped `.masp` artifacts are already v0.15 (MAST version `[0,0,3]`, built with `cargo-miden 0.9`). If you rebuild the contracts, use a `cargo-miden 0.9` toolchain so the `.masp` still embeds `[0,0,3]` (older `cargo-miden 0.8.x` emits `[0,0,2]`, which v0.15 rejects at `Package.deserialize`). The counter is a plain **public, `NoAuth`** account (`AccountType::Public` + `NoAuth`) — v0.15 removed the network-account concept (`AccountStorageMode::Network`), so there is no network operator and no note attachment involved; the browser client both publishes and consumes the increment note. Use the v0.15 `project-template` tooling for the exact build + deploy commands.

1. In the [project-template](https://github.com/0xMiden/project-template) repo (on the branch matching your SDK version), run the deployment binary, e.g.:
   ```bash
   cargo run -p integration --release --bin increment_count
   ```
   It builds `contracts/counter-account` + `contracts/increment-note`, creates the counter, and prints the bech32 address.
2. Copy the freshly built artifacts into this template:
   ```bash
   cp contracts/counter-account/target/miden/release/counter_account.masp \
      <frontend-template>/public/packages/
   cp contracts/increment-note/target/miden/release/increment_note.masp \
      <frontend-template>/public/packages/
   ```
3. Set `VITE_MIDEN_COUNTER_ADDRESS=<your bech32 address>` in `.env` (or your shell environment) — no source edit required.
4. Verify the files exist with `.claude/hooks/check-artifacts.sh` (it checks the `.masp` files are present and non-trivial in size; note it does **not** validate the MASP/MAST format version, so it will not catch a pre-v0.15 ↔ v0.15 version mismatch).

## Key Dependencies

| Package | Version pin | Purpose |
|---------|-------------|---------|
| `@miden-sdk/react` | `0.15.3` | React hooks for Miden (useAccount, useSyncState, useMiden, useMidenClient, useTransaction, …) |
| `@miden-sdk/miden-sdk` | `0.15.3` | Core SDK types (Note, NoteScript, AccountId, Word, Felt, …) |
| `@miden-sdk/vite-plugin` | `0.15.3` | Vite plugin that handles WASM loading, top-level await, and COOP/COEP |
| `@miden-sdk/miden-wallet-adapter-react` | `0.15.1` | MidenFi wallet adapter React context + hooks |
| `@miden-sdk/miden-wallet-adapter-base` | `0.15.1` | `Transaction.createCustomTransaction` helper used by the increment flow |

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
npx vitest --run          # 37 unit tests (components, hook, patterns)
npx vite build            # production build (emits dist/)
npx eslint .              # lint
```

The PostToolUse hook runs typecheck + affected tests after every edit. The Stop hook runs the full suite when a task completes.

Browser-level verification (render correctness, no console errors, wallet popup, E2E increment) can be done with either:
- **Playwright MCP** for headless render / console checks
- **Claude in Chrome** (via the `/chrome` command) to exercise the real MidenFi extension

## Implementation Notes

The on-chain increment works end-to-end on v0.15. Two non-obvious requirements make it work; both are enforced in code and explained inline in `src/hooks/useIncrementCounter.ts` and `src/providers.tsx`.

### `useWorker: false` — single SMT forest so the imported counter can be applied

The counter is an **existing** on-chain account this client *imports* (rather than creates), so consuming a note against it applies a *delta* transaction. Under the default worker shim the client keeps two in-memory SMT "forests" — one in the main thread, one in the worker — over the same IndexedDB. `importAccountById` registers only the main-thread forest, but `submitNewTransaction`/`apply_transaction` runs in the worker, whose forest never contains the late-imported counter — so the consume fails with `apply transaction result: storage error: account data wasn't found for account id …`. Running with `useWorker: false` (set on `MidenProvider` in `src/providers.tsx`) collapses this to one thread → one forest, so the imported counter is present when the consume is applied. (Verified against `web-sdk crates/idxdb-store/src/transaction/mod.rs`.)

### Remote proving — keep the single thread off proof generation

Because there is no worker, `useIncrementCounter.ts::increment` submits via `client.submitNewTransactionWithProver(id, request, prover)` using `useMiden().prover` (the remote testnet prover derived from `config.prover`). Bare `submitNewTransaction` proves *locally* and single-threaded (minutes), which would freeze the tab; remote proving leaves the main thread only local execution to do.

### Fixed-interval network poll ([miden-client#2111](https://github.com/0xMiden/miden-client/issues/2111))

After submitting, `increment` bounded-polls the counter's storage map every `NETWORK_POLL_INTERVAL_MS` (2.5 s) until the value advances past the pre-consume baseline or `NETWORK_POLL_TIMEOUT_MS` (60 s) elapses. `useWaitForCommit` doesn't fit cleanly across the publish→commit→consume handoff; [`#2111`](https://github.com/0xMiden/miden-client/issues/2111) tracks a React-SDK subscription primitive for account-state updates (scoped narrowly from the broader event-system discussion in [`#467`](https://github.com/0xMiden/miden-client/issues/467)).

**After #2111 lands a subscription primitive:**
1. Replace the `while` poll loop in `useIncrementCounter.ts::increment` with the new subscription / waitFor API.
2. Remove `NETWORK_POLL_INTERVAL_MS` + `NETWORK_POLL_TIMEOUT_MS` from `src/config.ts` if no other consumer depends on them.
3. Remove the `#2111` TODO block.

## AI Developer Experience

This template ships with `.claude/` skills for AI coding tools. Skills cover React SDK patterns, frontend pitfalls, Vite + WASM setup, signer integration, testing patterns, and Miden architecture. See `CLAUDE.md` for the full developer guide.
