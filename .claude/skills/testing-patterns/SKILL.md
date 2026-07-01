---
name: testing-patterns
description: Testing conventions, mock factory, fixtures, and TDD workflow for Miden frontend development. Covers Vitest + testing-library setup, @miden-sdk/react module mocking, realistic fixture data, test patterns for query and mutation hooks, and the automated verification pipeline. Use when writing, running, or debugging tests for Miden React components.
---

# Miden Frontend Testing Patterns

## Test Stack

- **Vitest** - Test runner (extends Vite config for consistent behavior)
- **@testing-library/react** - Component rendering and queries
- **@testing-library/user-event** - User interaction simulation
- **@testing-library/jest-dom** - DOM assertion matchers (toBeInTheDocument, toBeDisabled, etc.)
- **jsdom** - Browser environment for tests

## Mock Factory: `@miden-sdk/react`

The Miden SDK hooks the template uses (plus the common query/mutation hooks and utilities) are mocked via `src/__tests__/mocks/miden-sdk-react.ts`, with realistic default return values. It is not an exhaustive mirror of every `@miden-sdk/react` export: niche hooks (e.g. `useCompile`, the `usePswap*` family, `useSyncControl`, the import/export hooks, `useMultiSigner`) are not mocked. Add an export there if a test needs one.

### Usage in test files

```tsx
// 1. Mock the entire module (hoisted to top by vitest)
vi.mock("@miden-sdk/react", () => import("@/__tests__/mocks/miden-sdk-react"));

// 2. Import hooks you want to override
import { useAccounts, useSend } from "@miden-sdk/react";

// 3. Override per-test
it("shows empty state", () => {
  vi.mocked(useAccounts).mockReturnValue({
    accounts: [],
    wallets: [],
    faucets: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
  render(<MyComponent />);
});
```

### Default mock return values

**Query hooks** return populated data by default:
- `useAccounts()` - 3 account headers in `accounts` (the v0.15 source of truth); `wallets` mirrors `accounts` and `faucets` is empty (both `@deprecated` in v0.15)
- `useAccount()` - account with 10.0 TEST token balance
- `useNotes()` - 1 input note, 1 consumable note
- `useSyncState()` - syncHeight: 12345, not syncing
- `useAssetMetadata()` - TEST token metadata (symbol, decimals: 8)
- `useMiden()` - isReady: true

**Mutation hooks** return idle state by default:
- `useSend()` - `{ send: vi.fn(), stage: "idle", isLoading: false }`. Its `result` type is `SendResult { txId, note }` - distinct from `TransactionResult { transactionId }` used by `useMint`/`useConsume`/`useSwap`/`useMultiSend`/`useTransaction`.
- `useMint()`, `useConsume()`, `useSwap()`, `useTransaction()`, `useMultiSend()` - idle shape with `result: TransactionResult | null`.
- `useCreateWallet()` - `{ createWallet: vi.fn(), isCreating: false }`.

### Simulating transaction stages

```tsx
// Show "proving" stage
vi.mocked(useSend).mockReturnValue({
  send: vi.fn(),
  result: null,
  isLoading: true,
  stage: "proving",
  error: null,
  reset: vi.fn(),
});

// Show completed transaction - useSend returns SendResult { txId, note }
vi.mocked(useSend).mockReturnValue({
  send: vi.fn(),
  result: { txId: "0xabc123", note: null },
  isLoading: false,
  stage: "complete",
  error: null,
  reset: vi.fn(),
});

// Other mutation hooks return TransactionResult { transactionId }
vi.mocked(useMint).mockReturnValue({
  mint: vi.fn(),
  result: { transactionId: "0xdef456" },
  isLoading: false,
  stage: "complete",
  error: null,
  reset: vi.fn(),
});
```

## Fixtures

Realistic test data in `src/__tests__/fixtures/`:

```tsx
import {
  WALLET_ID_1,           // "0x0a00000000000001"
  WALLET_ID_2,           // "0x0a00000000000002"
  FAUCET_ID,             // "0x0a00000000000003"
  COUNTER_ID,            // "0x0a00000000000004"
  MOCK_WALLET_HEADER,    // { id, nonce, storageCommitment }
  MOCK_FAUCET_HEADER,    // { id, nonce, storageCommitment }
  MOCK_ASSET_BALANCE,    // { assetId, amount: 1000000000n, symbol: "TEST", decimals: 8 }
  MOCK_ACCOUNT,          // { id, nonce, bech32id() }
  MOCK_TRANSACTION_RESULT, // { transactionId: "0x..." } - useMint / useConsume / useSwap / useMultiSend / useTransaction
  MOCK_SEND_RESULT,        // { txId: "0x...", note: null }  - useSend
  MOCK_NOTE_SUMMARY,       // { id, assets, sender }
} from "@/__tests__/fixtures";
```

Key characteristics:
- Account IDs use hex format (`0x...`) - network-agnostic test fixtures
- Amounts are `bigint` (e.g., `1000000000n` = 10.0 with 8 decimals)
- Asset metadata uses TEST token with 8 decimals

## Test Patterns (copy-adaptable)

Reference tests in `src/__tests__/patterns/`:

| Pattern | File | Tests |
|---------|------|-------|
| Provider/context setup | `provider-setup.test.tsx` | ready, loading, error states |
| Query hook component | `query-hook.test.tsx` | data, loading, error, empty states |
| Mutation hook component | `mutation-hook.test.tsx` | idle, stages, success, error, argument verification |

### Minimum test coverage per component

Every component test should cover:
1. **Success state** - renders correctly with data
2. **Loading state** - shows loading indicator
3. **Error state** - shows error message, recovery action
4. **User interactions** - buttons, forms trigger correct handler calls

## Wallet connection state in tests

This template's wallet button (`src/components/AppContent.tsx`) drives off **`useMidenFiWallet()`** from `@miden-sdk/miden-wallet-adapter-react`, not the generic `useSigner()`. The button gates on `wallet.readyState` (from `@miden-sdk/miden-wallet-adapter-base`) so the UI can render an "Install MidenFi Wallet" state before the extension is detected, rather than falling through to the adapter's Chrome-Web-Store fallback. When testing wallet-connect UI, mock both modules and override per test.

The mock factory must return the **full `WalletContextState`** shape - `useIncrementCounter` reads `address` and `requestTransaction` directly off the hook return, and the wallet button reads `wallet.readyState`. A partial mock will compile (with broad casts) and silently miss contract drift. Setup:

```tsx
vi.mock("@miden-sdk/react", () => import("@/__tests__/mocks/miden-sdk-react"));
vi.mock("@miden-sdk/miden-wallet-adapter-react", () => ({
  useMidenFiWallet: vi.fn(() => ({
    autoConnect: false,
    wallets: [],
    wallet: null,
    address: null,
    publicKey: null,
    connected: false,
    connecting: false,
    disconnecting: false,
    select: vi.fn(),
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    requestTransaction: vi.fn(async () => "0xtx"),
    requestAssets: undefined,
    requestPrivateNotes: undefined,
    signBytes: undefined,
    importPrivateNote: undefined,
    requestConsumableNotes: undefined,
    waitForTransaction: undefined,
    requestSend: undefined,
    requestConsume: undefined,
    createAccount: undefined,
  })),
}));
vi.mock("@miden-sdk/miden-wallet-adapter-base", () => ({
  WalletReadyState: {
    Installed: "Installed",
    NotDetected: "NotDetected",
    Loadable: "Loadable",
    Unsupported: "Unsupported",
  },
}));

import { useMidenFiWallet } from "@miden-sdk/miden-wallet-adapter-react";
```

Use a typed factory for per-test overrides - `WalletContextState` is the `useMidenFiWallet()` return type:

```tsx
type WalletState = ReturnType<typeof useMidenFiWallet>;
type WalletInner = NonNullable<WalletState["wallet"]>;

function walletState(
  overrides: Partial<{
    readyState: "Installed" | "NotDetected" | "Loadable" | "Unsupported";
    connected: boolean;
    address: string | null;
    requestTransaction: WalletState["requestTransaction"];
  }> = {},
): WalletState {
  const {
    readyState = "Installed",
    connected = false,
    address = connected ? "mtst1arwk88k8smzcq5p30upr6eerw5npmnyz" : null,
    requestTransaction = vi.fn(async () => "0xtx"),
  } = overrides;
  // The inner Wallet's `adapter` is an `Adapter` (eventemitter + polling
  // strategy) - we stub it structurally because the components under test
  // only read `readyState` off the inner wallet object.
  const innerWallet = {
    adapter: {} as WalletInner["adapter"],
    readyState,
  } as WalletInner;
  return {
    autoConnect: false,
    wallets: [innerWallet],
    wallet: innerWallet,
    address,
    publicKey: null,
    connected,
    connecting: false,
    disconnecting: false,
    select: vi.fn(),
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    requestTransaction,
    requestAssets: undefined,
    requestPrivateNotes: undefined,
    signBytes: undefined,
    importPrivateNote: undefined,
    requestConsumableNotes: undefined,
    waitForTransaction: undefined,
    requestSend: undefined,
    requestConsume: undefined,
    createAccount: undefined,
  };
}

// extension not detected - shows disabled "Install MidenFi Wallet"
vi.mocked(useMidenFiWallet).mockReturnValue(
  walletState({ readyState: "NotDetected" }),
);

// installed + connected with an account - shows "Disconnect Wallet"
vi.mocked(useMidenFiWallet).mockReturnValue(
  walletState({ readyState: "Installed", connected: true }),
);
```

The factory satisfies `WalletContextState` without `as unknown as` over the whole object - the only narrow `as` is the inner adapter stub, which is unavoidable until we want to construct a real `Adapter` in tests. See `src/components/__tests__/AppContent.test.tsx` for the canonical version.

For app code that needs the selected signer account for client-side flows (transaction-building hooks, etc.), `useMiden()` exposes `signerAccountId` / `signerConnected` as lower-level provider state - mock those via the `@miden-sdk/react` mock factory.

Vitest config externalizes `@miden-sdk/miden-wallet-adapter-react` to prevent broken transitive resolution.

## Mocking Classes Called with `new` (Vitest v4)

Vitest v4 enforces that mock implementations passed to `vi.fn()` must be `function` declarations (not arrow functions) when the mocked function is invoked with `new`. Arrow functions cannot be called as constructors and will throw `TypeError: ... is not a constructor`.

```ts
// WRONG: arrow function - throws when production code does `new MidenClient(...)`
vi.mock("@miden-sdk/miden-sdk", () => ({
  MidenClient: vi.fn(() => ({ /* ... */ })),
}));

// RIGHT: function expression - usable with `new`
vi.mock("@miden-sdk/miden-sdk", () => ({
  MidenClient: vi.fn(function () {
    return { /* ... */ };
  }),
}));
```

This applies to any class mocked at module level that production code instantiates with `new` (`new MidenClient(...)`, `new WasmWebClient(...)`, etc.). When tests fail with `TypeError: ... is not a constructor` after a Vitest v4 upgrade, swap the arrow-function bodies for `vi.fn(function () { ... })`.

For component-level wallet adapters and hooks that are function references rather than classes (the existing `vi.mock("@miden-sdk/miden-wallet-adapter-react", ...)` example above), arrow-function mocks remain fine.

## Testing Time-Dependent Code (Network Sync Delay)

Production code that polls or waits on chain state should accept the delay interval as an injectable parameter rather than hardcoding it. This lets tests replace the production default (e.g. `5000` ms) with `0` so the loop drains synchronously without `vi.useFakeTimers()` plumbing.

Pattern:

```ts
// Production: optional delay parameter with a sensible default
export function pollUntilCommit(
  txId: string,
  intervalMs = 5000,            // production default
) {
  // ... uses setTimeout(..., intervalMs) or `await sleep(intervalMs)`
}

// Tests: pass 0 to skip waits
const result = await pollUntilCommit(txId, 0);
```

When the value comes from `src/config.ts` (e.g. `NETWORK_SYNC_DELAY_MS`), expose the same override there so tests can stub it via `vi.mock("@/config", ...)` without touching app code:

```ts
// src/config.ts
export const NETWORK_SYNC_DELAY_MS = Number(import.meta.env.VITE_NETWORK_SYNC_DELAY_MS ?? 5000);

// test
vi.mock("@/config", () => ({ NETWORK_SYNC_DELAY_MS: 0 }));
```

Document the production default and the test override at the call site so the contract between app code and tests is obvious.

## Automated Verification Pipeline

Hooks in `.claude/settings.json` enforce quality automatically:

1. **PostToolUse: typecheck** - `npx tsc -b --noEmit` on every `.ts`/`.tsx` edit in `src/`
2. **PostToolUse: affected tests** - `npx vitest --changed --run` on every `.ts`/`.tsx` edit in `src/`
3. **PostToolUse: full suite** - Full `vitest --run && tsc -b --noEmit && vite build` after each edit

If any hook fails (exit code 2), the agent is blocked from proceeding until the issue is fixed.

## TDD Flow

```
1. Write test (describe expected behavior)
   ↓
2. yarn test           → RED (test fails)
   ↓
3. Implement code
   ↓
4. Auto hooks fire     → typecheck + affected tests
   ↓
5. yarn test           → GREEN (all pass)
   ↓
6. Refactor if needed
   ↓
7. Task complete       → full suite already ran after last edit
```

## Common Mistakes

**Forgetting vi.clearAllMocks()**: Always call in `beforeEach` to prevent mock state leaking between tests.

**Not mocking the SDK**: Components importing from `@miden-sdk/react` will fail without `vi.mock()` because the real SDK requires WASM initialization.

**Using number instead of bigint**: Mock amounts must use `bigint` (`1000n`, not `1000`). The SDK enforces this at the type level.

**Testing implementation details**: Test what the user sees (text, buttons, states), not internal hook calls. Use `screen.getByRole`, `screen.getByText`, not internal component state.
