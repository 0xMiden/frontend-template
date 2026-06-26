# Miden Frontend App

React 19 + TypeScript + Vite frontend for the Miden blockchain.

## Project Structure

- `src/` — React application source
- `src/components/` — UI components (Counter, AppContent)
- `src/hooks/` — Custom hooks (useIncrementCounter)
- `src/lib/` — Shared utilities
- `src/__tests__/` — Test infrastructure (mocks, fixtures, patterns)
- `src/components/__tests__/` — Component tests
- `vite.config.ts` — Vite config with midenVitePlugin() from @miden-sdk/vite-plugin
- `vitest.config.ts` — Vitest test runner config
- `package.json` — Dependencies: @miden-sdk/react, @miden-sdk/miden-sdk

## Build, Dev & Test

```
yarn dev             # Start dev server (Vite)
yarn build           # Type check + production build (tsc -b && vite build)
yarn lint            # ESLint
yarn test            # Run all tests once (vitest --run)
yarn test:watch      # Run tests in watch mode (vitest)
yarn test:coverage   # Run tests with coverage report
```

Type checking alone:
```
npx tsc -b --noEmit
```

## SDK Choice: React SDK Hooks First

ALWAYS prefer `@miden-sdk/react` hooks over low-level `WasmWebClient` methods.
Only use the WASM client directly via `useMidenClient()` for operations not covered by hooks.

### Setup — this template's actual providers (`src/providers.tsx`)
```tsx
import { MidenProvider } from "@miden-sdk/react";
import { MidenFiSignerProvider } from "@miden-sdk/miden-wallet-adapter-react";

<MidenProvider
  config={{ rpcUrl: MIDEN_RPC_URL, prover: MIDEN_PROVER }}
  loadingComponent={<div className="loading">Loading Miden WASM...</div>}
>
  <MidenFiSignerProvider
    appName={APP_NAME}
    network={WalletAdapterNetwork.Testnet}
    autoConnect
  >
    <App />
  </MidenFiSignerProvider>
</MidenProvider>
```

> **v0.15 provider order — `MidenProvider` runs OUTSIDE the signer provider.** When a signer provider (`MidenFiSignerProvider`) is an *ancestor* of `MidenProvider`, v0.15 `MidenProvider` treats it as its external keystore and does **not** create the client until the wallet connects (it sees `signerContext.isConnected === false` and returns early). With no wallet connected — before the user connects, or in any environment without the MidenFi extension — the app then hangs forever on "Initializing Miden client…". This template never signs *through* `MidenProvider` (the only write, the increment, is submitted by the wallet adapter's `requestTransaction`), so `MidenProvider` runs in local-keystore mode (no signer above it → it initializes immediately and the public counter read works without a connected wallet), with `MidenFiSignerProvider` *inside* it purely for the connect button + `requestTransaction`. If instead you DO want `MidenProvider` to sign via the wallet, put the signer provider above it — but then gate your UI on `useMiden().isReady` / signer connection (show a "connect" screen), don't expect the client before the wallet connects. (This init-gating behavior is undocumented in the migration guide; verified against `web-sdk` `packages/react-sdk/src/context/MidenProvider.tsx`.)

### Query Hooks
Each returns its own result shape plus `isLoading`, `error`, `refetch`:
```tsx
const { accounts } = useAccounts();           // wallets is @deprecated (mirrors accounts); faucets is @deprecated and always empty in v0.15 — detect faucets per-account from components
const { account, assets, getBalance } = useAccount(accountId);
const { notes, consumableNotes } = useNotes();
const { syncHeight, sync } = useSyncState();
const { assetMetadata } = useAssetMetadata(faucetId);
```

### Mutation Hooks
Each returns its own action function plus `isLoading`, `stage`, `error`, `reset`.
Transaction stages: `idle → executing → proving → submitting → complete`
```tsx
const { createWallet } = useCreateWallet();
const { send, stage } = useSend();
const { consume } = useConsume();
const { mint } = useMint();
const { swap } = useSwap();
const { execute } = useTransaction();  // arbitrary tx requests
```

### Token Amounts Are BigInt
```tsx
import { formatAssetAmount, parseAssetAmount } from "@miden-sdk/react";
const display = formatAssetAmount(balance, 8);  // bigint → string
const amount = parseAssetAmount("1.5", 8);       // string → bigint
```

For exhaustive hook API reference, read `node_modules/@miden-sdk/react/CLAUDE.md` and `node_modules/@miden-sdk/react/README.md`.

## TDD Workflow

When building features, follow this test-driven cycle:

1. **Write a failing test** for the feature/component
2. **Run tests** — confirm the test fails (red)
3. **Implement** the minimum code to make the test pass
4. **Run tests** — confirm all tests pass (green)
5. **Refactor** if needed, re-run tests
6. Type checking runs automatically after each edit (PostToolUse hook)
7. Affected tests run automatically after each edit (PostToolUse hook)

### Test file conventions
- Component tests: `src/components/__tests__/ComponentName.test.tsx`
- Hook tests: `src/hooks/__tests__/hookName.test.ts`
- Pattern references: `src/__tests__/patterns/` — copy and adapt these

### Writing tests for Miden components
```tsx
// 1. Mock the SDK at module level (always required)
vi.mock("@miden-sdk/react", () => import("@/__tests__/mocks/miden-sdk-react"));

// 2. Import hooks to override per-test
import { useAccounts } from "@miden-sdk/react";

// 3. Override in individual tests
vi.mocked(useAccounts).mockReturnValue({ wallets: [], ... });
```

See `testing-patterns` skill for full mock factory reference and fixture data.

## Verification Sequence

Automated verification runs in layers (each catches different failure classes):

1. **TypeScript type check** (auto, per-edit) — catches type errors immediately
2. **Affected tests** (auto, per-edit) — catches logic regressions from changes
3. **Full test suite + type check + build** (auto, on each edit via PostToolUse) — catches integration issues
4. **Browser verification** (Playwright MCP / Claude in Chrome) — catches "compiles but doesn't work" failures

### Browser verification (when needed)

Two tools are available for browser verification. Use whichever is appropriate:

#### Playwright MCP (visual verification, no wallet)
Configured in `.mcp.json`. Use for checking that the UI renders correctly, no console errors, layout looks right. Cannot interact with the MidenFi wallet extension.

1. Start dev server: `yarn dev`
2. Use Playwright MCP tools to navigate to `http://localhost:5173`
3. Take a screenshot, check for render errors
4. Check the browser console for errors

#### Claude in Chrome (full verification, with wallet)
Use for wallet-dependent features. Connects to the user's real browser where MidenFi is installed.

1. Start Claude Code with `claude --chrome` (or run `/chrome` in session)
2. Start dev server: `yarn dev`
3. Navigate to `http://localhost:5173`
4. Interact with wallet connect, transaction flows, etc.

## Contract Artifact Handoff

Frontend loads pre-compiled `.masp` packages from `public/packages/` at runtime.

### Artifact location
```
public/packages/
├── counter_account.masp    # Counter account component
└── increment_note.masp     # Increment note script
```

### Building artifacts
In the contract project (e.g., `project-template/`):
```bash
cargo miden build --release
# Copy .masp files from contracts/*/target/miden/release/ to public/packages/
```

### Validate artifacts
```bash
.claude/hooks/check-artifacts.sh
```
Note: this hook only checks that `.masp` files are present and non-trivial in size — it does **not** validate the MASP/MAST format version, so it will not catch a pre-v0.15 ↔ v0.15 mismatch.

### v0.15 compatibility
The `.masp` files shipped in `public/packages/` are pre-v0.15 builds: they embed MAST forest version `[0,0,2]`, which v0.15's `Package.deserialize` rejects (it requires `[0,0,3]`). They must be rebuilt with a `cargo-miden` toolchain whose `miden-core`/`miden-mast-package` are 0.23.x. Older MAST artifacts do not round-trip to v0.15.

### Failure recovery
- **Missing artifacts**: Build contracts with `cargo miden build` or ask the PM to supply the `.masp` files
- **Stale artifacts**: Rebuild and re-copy after contract changes
- **Deserialization failure at runtime**: Version mismatch — rebuild contracts with a `cargo-miden` toolchain matching the `@miden-sdk/miden-sdk` version in `package.json` (for v0.15, one that emits MAST version `[0,0,3]`)

## Known Temporary Workarounds

Two upstream gaps. The README has full rationale + removal steps; summary below.

**v0.15 network-attachment blocker (blocks the on-chain increment)**: v0.15 removed `NoteAttachment.newNetworkAccountTarget` and `NoteMetadata.withAttachment`. The `NetworkAccountTarget` attachment is still constructible (`NoteAttachment.fromWord(new NoteAttachmentScheme(2), …)` / `createNoteAttachment`), but the web SDK exposes no entry point to **attach** a `NoteAttachment` to a custom-script note (`NoteMetadata` carries none, the `Note` constructor takes none; only `Note.createP2IDNote/createP2IDENote` accept one). So the increment is gated behind `INCREMENT_ONCHAIN_BLOCKED` in `src/config.ts`: `useIncrementCounter.ts::increment` surfaces the blocker and **does not submit** a transaction (no fee, no orphan note), and `ConfiguredCounter` disables the button with an explanation. The construction path is kept behind the flag, ready to re-enable once the web SDK ([0xMiden/web-sdk](https://github.com/0xMiden/web-sdk)) adds a custom-note attachment API. The demo also needs rebuilt `.masp` artifacts (MAST `[0,0,3]`) and a redeployed v0.15 network account (a public account with an `AuthNetworkAccount` allowlist component — `AccountStorageMode::Network` was removed).

**Fixed-interval network poll** ([0xMiden/miden-client#2111](https://github.com/0xMiden/miden-client/issues/2111)): `useIncrementCounter.ts::increment` polls the counter's storage map every `NETWORK_POLL_INTERVAL_MS` (2.5 s) until the value changes or `NETWORK_POLL_TIMEOUT_MS` (30 s) elapses. `useWaitForCommit` doesn't apply because the increment is wallet-submitted and consumed externally by the network operator — the local client never sees the tx. #2111 tracks a React-SDK subscription primitive for this case (narrowed from the broader event-system discussion in #467).

## Critical Pitfalls

**WASM init must complete first**: Always use MidenProvider's `loadingComponent` or check `useMiden().isReady`. Components rendering before WASM init will crash.

**Recursive WASM access crashes**: Never call client methods concurrently. Use `runExclusive()` from `useMiden()` for sequential execution. Built-in hooks handle this automatically.

**COOP/COEP headers required**: WASM SharedArrayBuffer needs `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` in vite.config.ts AND production server.

**Token amounts are bigint, not number**: `send({ amount: 1000 })` will fail. Use `amount: 1000n` or `parseAssetAmount("10", 8)`.

## PM Workflow

For non-developer users building with this template:

1. Clone the repository and run `yarn install`
2. Start Claude Code in the project directory
3. Describe the app you want to build in natural language
4. Claude will implement features using TDD — tests are written first, then code
5. Automated hooks verify correctness at every step
6. Automated hooks run full tests + build after each code edit
7. Review the app in the browser: `yarn dev` → open `http://localhost:5173`
8. If using wallet features, install the MidenFi browser extension to test

### Known limitations
- **Visual correctness**: Automated tests verify structure and behavior, not visual appearance. Review the app in the browser for styling issues.
- **Wallet extension**: Real wallet interactions require the MidenFi browser extension. Tests mock the wallet adapter.
- **Network-dependent features**: Some features (syncing, transaction submission) require testnet connectivity.

## Miden Skills

For Miden-specific guidance, Claude will auto-load these skills when relevant:
- `react-sdk-patterns` — Complete React SDK hook API reference
- `testing-patterns` — Test mock factory, fixtures, and TDD conventions
- `frontend-pitfalls` — All frontend/WASM/browser pitfalls with safe/unsafe examples
- `miden-concepts` — Miden architecture from a developer perspective
- `vite-wasm-setup` — Vite + WASM configuration, deployment headers, troubleshooting
- `signer-integration` — External signer setup (Para, Turnkey, MidenFi)

## General Frontend Skills (Recommended)

For general React, TypeScript, and design capabilities, install these official skills alongside our Miden-specific ones:

```bash
# Vercel's React/design skills
git clone https://github.com/vercel-labs/agent-skills.git
# Install: react-best-practices, web-design-guidelines, composition-patterns

# Anthropic's frontend design skill (Claude Code plugin)
# See: https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design
```

## Advanced Development

For complex applications beyond basic hook usage (custom signers, direct WasmWebClient access, advanced note flows):

1. Clone the `0xMiden/web-sdk` repo alongside this project — it holds the React SDK source (`packages/react-sdk/`), web-client (`crates/web-client/`), and the idxdb store (`crates/idxdb-store/`). (miden-client was renamed to `0xMiden/rust-sdk`, the Rust client only.) See the `frontend-source-guide` skill.
2. Use Plan Mode first — Claude explores React SDK source + examples before coding
3. Claude uses sub-agents to explore repos efficiently without filling main context

The basic skills cover ~80% of patterns. Source repos provide the remaining 20% for advanced builders.
