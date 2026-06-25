# Miden Frontend Template

Minimal Vite + React + TypeScript template for building Miden frontends. It ships a Miden testnet network-counter demo that reads the on-chain counter and constructs an increment note via the MidenFi wallet adapter for the network operator to execute. **On SDK v0.15 the increment (write) path is currently blocked upstream** — the app loads and reads the counter, but the on-chain increment can't complete yet (see [Network Counter Demo](#network-counter-demo)).

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
├── counter_account.masp            # Compiled counter contract (pre-v0.15 build — rebuild for v0.15)
└── increment_note.masp             # Compiled increment note script (pre-v0.15 build — rebuild for v0.15)
```

## Network Counter Demo

The template demonstrates the Miden network-note pattern on testnet:

1. A **counter account** is deployed as a network account on testnet. This template ships with a live deployment at [`mtst1aqmx7qv6h3y92sqsmunh8uht4ujmfy4j`](https://testnet.midenscan.com/account/mtst1aqmx7qv6h3y92sqsmunh8uht4ujmfy4j).
2. On button click, the frontend constructs a **public note** targeting the counter and submits it through the MidenFi wallet (the wallet signs and posts the transaction, not the in-browser client).
3. The **network operator** picks up the note and executes it against the counter account, incrementing the on-chain count.
4. The frontend polls `client.getAccount(counterAddress)` and re-reads the `StorageMap`; once the value changes it updates the UI. If the network is slow, polling falls back to a 30 s timeout.

> **⚠️ v0.15 status — the increment (write) path is blocked upstream.** The upgrade to SDK v0.15 changed the network-account model and the compiled-artifact format, so the on-chain increment does not currently complete end-to-end. The app still initializes the client, syncs, and **reads** the counter (the read path and the rest of the flow are migrated). Three independent blockers, each detailed under [Known Temporary Workarounds](#known-temporary-workarounds):
> 1. **No web-SDK API attaches a network-execution target to a custom note.** v0.15 removed `NoteAttachment.newNetworkAccountTarget` and `NoteMetadata.withAttachment`; the standardized `NetworkAccountTarget` attachment scheme has no web-SDK builder for custom-script notes yet.
> 2. **The shipped `.masp` artifacts are incompatible.** They embed MAST forest version `[0,0,2]` (pre-v0.15); v0.15 rejects anything but `[0,0,3]` at `Package.deserialize`, so they must be rebuilt.
> 3. **The account/deployment model changed.** `AccountStorageMode::Network` was removed; a v0.15 network account is a public account carrying an `AuthNetworkAccount` allowlist component (which the web SDK cannot yet create), so the live pre-v0.15 deployment likely won't function under v0.15.

The `.masp` packages currently in `public/packages/` were built with the pre-v0.15 toolchain (`cargo-miden 0.8.1`) and embed MAST version `[0,0,2]`. **They are not compatible with v0.15** (which requires `[0,0,3]`) and must be rebuilt with a `cargo-miden` toolchain pinned to `miden-core`/`miden-mast-package` 0.23.x — see "Pointing at your own counter" below.

### Pointing at your own counter

The counter address is resolved at runtime via the `VITE_MIDEN_COUNTER_ADDRESS` environment variable (`src/config.ts`):

| `VITE_MIDEN_COUNTER_ADDRESS` value | Effect |
|---|---|
| unset / commented out (default) | Use the live testnet counter shipped with the template (`mtst1aqmx7qv6h3y92sqsmunh8uht4ujmfy4j`). |
| empty string (`VITE_MIDEN_COUNTER_ADDRESS=`) | Unconfigured — `<Counter>` renders the "address not configured" card and makes no network calls. |
| any bech32 string (`mtst1...`) | Uses your own deployment. |

The slot-name constant is fixed in `src/config.ts` and must match the counter contract's storage map name.

To redeploy (e.g. after modifying contract sources):

> **v0.15 note:** the artifacts and deploy path below are the pre-v0.15 flow. For v0.15 the contracts must be rebuilt with a `cargo-miden` toolchain whose `miden-core` / `miden-mast-package` are 0.23.x, so the `.masp` embeds MAST version `[0,0,3]` (the published `cargo-miden 0.8.1` emits `[0,0,2]`, which v0.15 rejects). The counter must also be (re)deployed as a v0.15 network account — a public account carrying the `AuthNetworkAccount` note-script allowlist component, since `AccountStorageMode::Network` no longer exists. Use the v0.15 `project-template` / contract tooling for the exact deploy command.

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
| `@miden-sdk/react` | `0.15.2` | React hooks for Miden (useAccount, useSyncState, useMiden, useMidenClient, useTransaction, …) |
| `@miden-sdk/miden-sdk` | `0.15.2` | Core SDK types (Note, NoteScript, AccountId, Word, Felt, …) |
| `@miden-sdk/vite-plugin` | `0.15.2` | Vite plugin that handles WASM loading, top-level await, and COOP/COEP |
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
npx vitest --run          # 36 unit tests (components, hook, patterns)
npx vite build            # production build (emits dist/)
npx eslint .              # lint
```

The PostToolUse hook runs typecheck + affected tests after every edit. The Stop hook runs the full suite when a task completes.

Browser-level verification (render correctness, no console errors, wallet popup, E2E increment) can be done with either:
- **Playwright MCP** for headless render / console checks
- **Claude in Chrome** (via the `/chrome` command) to exercise the real MidenFi extension

## Known Temporary Workarounds

Two upstream gaps affect the demo on v0.15: a hard blocker on the on-chain increment (below), and the pre-existing fixed-interval poll. Inline comments in `src/hooks/useIncrementCounter.ts` describe both.

### v0.15: no web-SDK way to attach a network-execution target to a custom note (blocks the on-chain increment)

The counter increment builds a **custom-script** note that must carry a *network-account-target* attachment so the network operator executes it against the counter. v0.15 removed both JS APIs the previous flow used — `NoteAttachment.newNetworkAccountTarget(...)` and `NoteMetadata.withAttachment(...)`. In v0.15, network targeting is the standardized `NetworkAccountTarget` attachment scheme (id 2), but `@miden-sdk/miden-sdk@0.15.2` exposes **no way to attach a scheme to a custom-script note**: `NoteMetadata` no longer carries attachments, only `Note.createP2IDNote/createP2IDENote` accept a `NoteAttachment`, and there is no JS `NetworkAccountTarget` builder. `src/hooks/useIncrementCounter.ts` therefore constructs the note in the correct v0.15 shape **without** the attachment (see the inline `v0.15 UPSTREAM BLOCKER` comment); the note can be submitted but the operator cannot pick it up, so the on-chain count will not change until the web SDK adds a custom-note attachment entry point (track: [`0xMiden/web-sdk`](https://github.com/0xMiden/web-sdk)).

Two related prerequisites must also be resolved for the demo to work end-to-end on v0.15:

- **Rebuild the `.masp` artifacts.** The shipped artifacts embed MAST version `[0,0,2]` and are rejected by v0.15's `Package.deserialize` (which requires `[0,0,3]`). Rebuild with a `cargo-miden` toolchain pinned to `miden-core`/`miden-mast-package` 0.23.x (see "Pointing at your own counter").
- **Redeploy a v0.15 network account.** `AccountStorageMode::Network` was removed; a v0.15 network account is a public account carrying an `AuthNetworkAccount` note-script allowlist component. The live pre-v0.15 deployment will not behave as a network account under v0.15.

**To re-enable the increment** once the web SDK lands the attachment API: restore the network-target attachment on the note in `useIncrementCounter.ts::increment`, rebuild + redeploy the artifacts/account, and update `VITE_MIDEN_COUNTER_ADDRESS`.

### Fixed-interval network poll — waiting for network-operator account updates ([miden-client#2111](https://github.com/0xMiden/miden-client/issues/2111))

After `wallet.requestTransaction` returns, `src/hooks/useIncrementCounter.ts` bounded-polls the counter's storage map until the value changes or a 30 s timeout elapses. The React SDK's `useWaitForCommit` only watches *locally-submitted* transactions — the increment is wallet-submitted and consumed externally by the network operator, so it never reaches the local client's transaction log. [`#2111`](https://github.com/0xMiden/miden-client/issues/2111) tracks a React-SDK subscription primitive for account-state updates driven by external consumers (scoped narrowly from the broader event-system discussion in [`#467`](https://github.com/0xMiden/miden-client/issues/467)).

**After #2111 lands a subscription primitive:**
1. Replace the `while` poll loop in `useIncrementCounter.ts::increment` with the new subscription / waitFor API.
2. Remove `NETWORK_POLL_INTERVAL_MS` + `NETWORK_POLL_TIMEOUT_MS` from `src/config.ts` if no other consumer depends on them.
3. Remove the `#2111` TODO block.

## AI Developer Experience

This template ships with `.claude/` skills for AI coding tools. Skills cover React SDK patterns, frontend pitfalls, Vite + WASM setup, signer integration, testing patterns, and Miden architecture. See `CLAUDE.md` for the full developer guide.
