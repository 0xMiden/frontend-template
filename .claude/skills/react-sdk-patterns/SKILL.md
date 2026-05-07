---
name: react-sdk-patterns
description: Complete guide to building Miden frontends with @miden-sdk/react hooks. Covers MidenProvider setup, all query hooks (useAccounts, useAccount, useNotes, useSyncState, useAssetMetadata), all mutation hooks (useCreateWallet, useSend, useMultiSend, useMint, useConsume, useSwap, useTransaction, useCreateFaucet), transaction stages, signer integration, and utility functions. Use when writing, editing, or reviewing Miden React frontend code.
---

# Miden React SDK Patterns

## SDK Choice

ALWAYS use `@miden-sdk/react` hooks. Only fall back to the raw `WasmWebClient` (exported as `WebClient`) via `useMidenClient()` for operations not covered by hooks. The React SDK handles WASM safety (runExclusive), state management (Zustand), auto-sync, and transaction stage tracking automatically.

## MidenProvider Configuration

```tsx
import { MidenProvider } from "@miden-sdk/react";

<MidenProvider
  config={{
    rpcUrl: "testnet",          // "devnet" | "testnet" | "localhost" | custom URL
    prover: "testnet",          // "local" | "devnet" | "testnet" | custom URL
    autoSyncInterval: 15000,    // ms, set to 0 to disable. Default: 15000
    noteTransportUrl: "...",    // optional: for private note delivery
  }}
  loadingComponent={<Loading />}  // shown during WASM init
  errorComponent={<Error />}      // shown on init failure (receives Error prop)
>
  <App />
</MidenProvider>
```

| Network | rpcUrl | Use When |
|---------|--------|----------|
| Testnet | `"testnet"` | Recommended for new projects - primary development network |
| Devnet | `"devnet"` | Early-access testing (may lag feature parity with testnet) |
| Localhost | `"localhost"` | Local node at `http://localhost:57291` |

## Query Hooks

Each returns its own result shape plus `isLoading`, `error`, `refetch`.

### useAccounts()
```tsx
const { accounts, wallets, faucets, isLoading, error, refetch } = useAccounts();
// wallets - AccountHeader[] (regular wallet accounts)
// faucets - AccountHeader[] (token faucet accounts)
// accounts - AccountHeader[] (everything)
```

### useAccount(accountId: string)
```tsx
const { account, assets, getBalance, isLoading, error, refetch } = useAccount(accountId);
// account - Account object (.id, .nonce, .bech32id())
// assets - AssetBalance[] (assetId, amount, symbol?, decimals?)
// getBalance(faucetId) - bigint balance for specific token
```

### useNotes(filter?)
```tsx
const { notes, consumableNotes, noteSummaries, consumableNoteSummaries, isLoading, error, refetch } = useNotes();
// notes - InputNoteRecord[]
// consumableNotes - ConsumableNoteRecord[]
// noteSummaries - NoteSummary[] (id, assets, sender)
// consumableNoteSummaries - NoteSummary[]

// Filter by account:
const { notes } = useNotes({ accountId: "0x..." });
// Filter by status:
const { notes } = useNotes({ status: "committed" });
// Filter by sender:
const { notes } = useNotes({ sender: "0x..." });
// Exclude specific notes:
const { notes } = useNotes({ excludeIds: ["0xnote1", "0xnote2"] });
```

### useNoteStream(options?)
```tsx
const { notes, latest, markHandled, markAllHandled, snapshot, isLoading, error } = useNoteStream();
// notes - StreamedNote[] (matching filter criteria)
// latest - most recent StreamedNote (convenience)
// markHandled(noteId) - exclude a note from future renders
// markAllHandled() - exclude all current notes
// snapshot() - capture { ids, timestamp } for cross-phase filtering

// Options:
const { notes } = useNoteStream({ status: "committed", sender: "0x..." });
const { notes } = useNoteStream({ since: Date.now() - 60000 }); // last 60s
const { notes } = useNoteStream({ excludeIds: new Set(["0xnote1"]) });
const { notes } = useNoteStream({ amountFilter: (amount) => amount > 100n });
```

### useSyncState()
```tsx
const { syncHeight, isSyncing, lastSyncTime, sync, error } = useSyncState();
await sync(); // Manual sync
```

### useAssetMetadata(faucetId: string | string[])
```tsx
const { assetMetadata } = useAssetMetadata(faucetId);
// assetMetadata - Map<string, AssetMetadata>
// Each entry: { assetId, symbol?, decimals? }
const meta = assetMetadata.get(faucetId);
// meta.symbol - "TEST"
// meta.decimals - 8
```

### useTransactionHistory(options?)
```tsx
const { records, record, status, isLoading, error, refetch } = useTransactionHistory({ id: txId });
// status: "pending" | "committed" | "discarded" | null
```

## Mutation Hooks

Each returns its own action function plus `isLoading`, `stage`, `error`, `reset`.

**Transaction stages**: `"idle"` → `"executing"` → `"proving"` → `"submitting"` → `"complete"`

### useCreateWallet()
```tsx
const { createWallet, wallet, isCreating, error, reset } = useCreateWallet();
const account = await createWallet({
  storageMode: "private",  // "private" | "public" | "network". Default: "private"
  mutable: true,           // Default: true
  authScheme: 0,           // 0 = RpoFalcon512, 1 = EcdsaK256Keccak. Default: 0
});
```

### useCreateFaucet()
```tsx
const { createFaucet, faucet, isCreating, error, reset } = useCreateFaucet();
const account = await createFaucet({
  tokenSymbol: "TEST",
  decimals: 8,             // Default: 8
  maxSupply: 1000000n,     // bigint!
  storageMode: "public",   // Default: "private"
});
```

### useImportAccount()
```tsx
const { importAccount, account, isImporting, error, reset } = useImportAccount();

// Import by account ID (network lookup):
const account = await importAccount({ type: "id", accountId: "0x..." });

// Import from file:
const account = await importAccount({ type: "file", file: accountFileOrBytes });

// Import from seed:
const account = await importAccount({ type: "seed", seed: seedBytes, mutable: true });
```

### useSend()
```tsx
const { send, result, isLoading, stage, error, reset } = useSend();
await send({
  from: senderAccountId,
  to: recipientAccountId,
  assetId: faucetId,       // token faucet ID
  amount: 1000n,           // bigint!
  noteType: "private",     // "private" | "public". Default: "private"
  recallHeight: 100,       // optional: sender can reclaim after this block
  timelockHeight: 50,      // optional: recipient can consume after this block
  sendAll: true,           // optional: send entire balance (ignores amount)
  attachment: [1n, 2n],    // optional: arbitrary data attached to the note
});
```

### useMultiSend()
```tsx
const { sendMany, result, isLoading, stage, error, reset } = useMultiSend();
await sendMany({
  from: senderAccountId,
  assetId: faucetId,
  recipients: [
    { to: recipient1, amount: 500n },
    { to: recipient2, amount: 300n, noteType: "public" },          // per-recipient override
    { to: recipient3, amount: 200n, attachment: [1n, 2n, 3n] },    // per-recipient attachment
  ],
  noteType: "private",     // default for all recipients
});
```

### useMint()
```tsx
const { mint, result, isLoading, stage, error, reset } = useMint();
await mint({
  targetAccountId: recipientId,
  faucetId: myFaucetId,
  amount: 10000n,         // bigint!
  noteType: "public",
});
```

### useConsume()
```tsx
const { consume, result, isLoading, stage, error, reset } = useConsume();
await consume({
  accountId: myAccountId,
  notes: [noteId1, noteId2],   // accepts: hex string IDs, NoteId, InputNoteRecord, or Note
});
```

### useSwap()
```tsx
const { swap, result, isLoading, stage, error, reset } = useSwap();
await swap({
  accountId: myAccountId,
  offeredFaucetId: tokenA,
  offeredAmount: 100n,
  requestedFaucetId: tokenB,
  requestedAmount: 50n,
  noteType: "private",
  paybackNoteType: "private",
});
```

### useTransaction() - Escape Hatch
```tsx
const { execute, result, isLoading, stage, error, reset } = useTransaction();

// With pre-built TransactionRequest:
await execute({ accountId, request: txRequest });

// With factory function (gets access to client):
await execute({
  accountId,
  request: (client) => client.newSwapTransactionRequest(/* ... */),
});
```

### useWaitForCommit()
```tsx
const { waitForCommit } = useWaitForCommit();
await waitForCommit(result.txId, {  // useSend returns { txId, note }; other hooks use { transactionId }
  timeoutMs: 10000,   // Default: 10000
  intervalMs: 1000,    // Default: 1000
});
```

### useWaitForNotes()
```tsx
const { waitForConsumableNotes } = useWaitForNotes();
await waitForConsumableNotes({
  accountId: myAccountId,
  minCount: 1,         // Default: 1
  timeoutMs: 10000,
});
```

### useSessionAccount(options)
```tsx
const { initialize, sessionAccountId, isReady, step, error, reset } = useSessionAccount({
  fund: async (sessionId) => {
    // Called after session wallet is created - fund it here
    await send({ from: mainWallet, to: sessionId, assetId: faucetId, amount: 100n });
  },
  assetId: faucetId,              // optional: for note filtering
  walletOptions: {                // optional: session wallet creation options
    storageMode: "private",
    mutable: true,
    authScheme: 0,
  },
  pollIntervalMs: 3000,           // optional: funding detection interval. Default: 3000
});
// Steps: "idle" → "creating" → "funding" → "consuming" → "ready"
// Call initialize() to start the flow. isReady becomes true when fully funded.
```

## Transaction Progress UI

```tsx
function SendButton({ from, to, assetId, amount }) {
  const { send, stage, isLoading, error } = useSend();

  return (
    <div>
      <button onClick={() => send({ from, to, assetId, amount })} disabled={isLoading}>
        {isLoading ? `${stage}...` : "Send"}
      </button>
      {error && <p>Error: {error.message}</p>}
    </div>
  );
}
```

## Signer Integration

### Local Keystore (Default)
No signer provider needed. Keys are managed in the browser via IndexedDB.

### External Signers
Wrap MidenProvider with a signer provider. Three pre-built options:
- `ParaSignerProvider` from `@miden-sdk/para` - EVM wallets
- `TurnkeySignerProvider` from `@miden-sdk/miden-turnkey-react` - passkey auth
- `MidenFiSignerProvider` from `@miden-sdk/miden-wallet-adapter-react` - MidenFi wallet

```tsx
// Example: Para signer wrapping MidenProvider
import { ParaSignerProvider } from "@miden-sdk/para";
<ParaSignerProvider apiKey="..." environment="PRODUCTION">
  <MidenProvider config={...}><App /></MidenProvider>
</ParaSignerProvider>
```

### useSigner() - Unified Interface
```tsx
const { isConnected, connect, disconnect, name } = useSigner();
```

### Custom Signer
Implement `SignerContextValue` interface via `SignerContext.Provider`. Requires: `name`, `storeName` (unique per user for DB isolation), `accountConfig`, `signCb`, `connect`, `disconnect`. See `frontend-source-guide` skill for source references.

## Utility Functions

```tsx
import { formatAssetAmount, parseAssetAmount, getNoteSummary, formatNoteSummary, toBech32AccountId } from "@miden-sdk/react";

formatAssetAmount(1000000n, 8)       // "0.01"
parseAssetAmount("0.01", 8)           // 1000000n
const summary = getNoteSummary(note); // { id, assets, sender }
formatNoteSummary(summary);           // "1.5 TEST"
toBech32AccountId("0x1234...");       // "miden1qy35..."
```

## Direct Client Access

```tsx
const client = useMidenClient(); // throws if not ready
const { runExclusive } = useMiden();

// For operations not covered by hooks:
await runExclusive(async () => {
  const header = await client.getBlockHeaderByNumber(100);
});
```

## Type Imports

```tsx
import type {
  MidenConfig, QueryResult, MutationResult, TransactionStage,
  AccountsResult, AccountResult, AssetBalance, NotesResult, NoteSummary,
  SendOptions, MultiSendOptions, MintOptions, ConsumeOptions, SwapOptions,
  CreateWalletOptions, CreateFaucetOptions, ExecuteTransactionOptions,
  TransactionResult, SyncState, WaitForCommitOptions, WaitForNotesOptions,
  Account, AccountId, InputNoteRecord, ConsumableNoteRecord,
  TransactionRecord, TransactionRequest, NoteType, AccountStorageMode,
  SignerContextValue, SignCallback, SignerAccountConfig,
} from "@miden-sdk/react";
```

## Reading Account Storage

For the high-level vault summary on a tracked account, the existing query hook is enough:

```tsx
const { account, assets, getBalance } = useAccount(accountId);
// account.id, account.nonce, account.bech32id()
// assets: AssetBalance[]; getBalance(faucetId): bigint
```

For lower-level reads (individual storage slots, map items, custom contract slots), drop into the underlying client. The React SDK serializes WASM access via `runExclusive`:

```tsx
const client = useMidenClient();
const { runExclusive } = useMiden();

await runExclusive(async () => {
  const details = await client.accounts.getDetails(accountId);
  // details: header + status + vault summary
});
```

For per-slot reads on custom contracts, use the lazy `accountReader` and keep it inside `runExclusive` so it cannot race with a write:

```tsx
await runExclusive(async () => {
  const reader = client.accountReader(accountId);
  const slot = await reader.getStorageSlot(slotIndex);
  // For maps: const value = await reader.getMapItem(slotIndex, key);
});
```

`client.accounts.getOrImport(ref)` tries `get(ref)` first and falls back to `import(ref)` if the account is not yet tracked locally. For raw WebClient method signatures, see the `web-client-usage` skill.

## Account Import then Sync then Read Storage Flow

Hook-based pattern for the common "import a remote account, sync to current chain head, then read its state" workflow:

```tsx
function ImportAndInspect({ accountIdHex }: { accountIdHex: string }) {
  const { importAccount, isImporting } = useImportAccount();
  const { sync, isSyncing, syncHeight } = useSyncState();
  const { account, assets, getBalance, refetch } = useAccount(accountIdHex);

  async function load() {
    await importAccount({ type: "id", accountId: accountIdHex });
    await sync();
    await refetch();
  }
  // Render account.id, syncHeight, balances...
}
```

`useImportAccount` accepts `{ type: "id" | "file" | "seed", ... }`. After `sync()` resolves, the `useAccount(accountIdHex)` view reflects the latest chain state. For the raw client equivalents (`accounts.getOrImport`, `client.sync()`, `accounts.getDetails`), see the `web-client-usage` skill.

## Custom Notes and .masp Package Loading

`.masp` package files (compiled MASM artifacts) are produced by `cargo miden build` in the `project-template/` workspace and copied into `frontend-template/public/packages/` during the contract handoff (see `CLAUDE.md` "Contract Artifact Handoff" section).

To load a `.masp` package on the frontend and execute a custom transaction with it:

```tsx
const client = useMidenClient();
const { execute } = useTransaction();

async function submitCustomTx(senderId: string, scriptMasm: string, libMasm: string) {
  // .masp packages live under public/packages/ and are fetched at runtime
  const pkgBytes = await fetch("/packages/my_contract.masp").then(r => r.arrayBuffer());

  await execute({
    accountId: senderId,
    request: async (c) => {
      const script = await c.compile.txScript({
        code: scriptMasm,
        libraries: [{ namespace: "my::lib", code: libMasm, linking: "dynamic" }],
      });
      return c.newCustomTransactionRequest({ script, packageBytes: pkgBytes });
    },
  });
}
```

For multi-input custom note flows that must round-trip through a connected wallet (signing happens in the extension), route through the wallet adapter instead of `useTransaction`. Reference `src/hooks/useIncrementCounter.ts` for a worked example using `useMidenFiWallet().requestTransaction(CustomTransaction)` with a `.masp`-loaded counter contract: it builds the input note, asserts the expected counter value, and submits via the wallet.

For the underlying SDK calls (`client.compile.noteScript`, `client.compile.txScript`, `client.transactions.execute`, foreign-account `storage` requirements, `returnNote: true` for out-of-band private-note delivery), see the `web-client-usage` skill.

## Cross-SDK Type Reference

The runtime types come from `@miden-sdk/react` (re-exported from `@miden-sdk/miden-sdk` for the underlying `MidenClient` types). The `.d.ts` files are the source of truth. Look them up in:

- `node_modules/@miden-sdk/react/dist/index.d.ts` for hook return types and option types
- `node_modules/@miden-sdk/miden-sdk/dist/index.d.ts` for `MidenClient`, `Account`, `AccountId`, `Note`, `Word`, etc.

Common app-developer types:

| Type | Source package | Notes |
|------|----------------|-------|
| `Account`, `AccountHeader` | `@miden-sdk/react` | `id`, `nonce`, `bech32id()` |
| `AccountId` | `@miden-sdk/miden-sdk` | construct via `AccountId.fromHex(hex)`; throws on invalid hex |
| `Address` | `@miden-sdk/miden-sdk` | bech32 wrapper; `Address.fromBech32(...)` |
| `Note`, `InputNoteRecord`, `ConsumableNoteRecord`, `OutputNote` | `@miden-sdk/react` | input notes are received; output notes are produced |
| `NoteVisibility` enum | `@miden-sdk/miden-sdk` | `Public`, `Private`. Replaces the legacy `NoteType`. |
| `AccountType`, `AuthScheme`, `StorageMode` | `@miden-sdk/miden-sdk` | enums; see `web-client-usage` "Visibility & Account Types". |
| `TransactionRequest` | `@miden-sdk/react` | client factory functions return this |
| `Word` | `@miden-sdk/miden-sdk` | 32-byte (4 felts) value; `Word.toU64s()` returns `bigint[]` of length 4 |

Do not hardcode this table for long-term reference. The `.d.ts` files stay in lockstep with the installed package version; this list will drift.

## Rust to TypeScript Type Mapping

The Rust (`miden-client`) and TypeScript (`@miden-sdk/miden-sdk`) SDKs share concepts but diverge on naming and primitive shapes. When porting between them:

| Concept | Rust (`miden_objects` / `miden_client`) | TypeScript (`@miden-sdk/miden-sdk`) |
|---------|------------------------------------------|--------------------------------------|
| Token amount | `u64` | `bigint` |
| Field element | `Felt` (Goldilocks `u64` mod p) | `Felt` (wraps `u64`) |
| 32-byte word | `Word` (`[Felt; 4]`) | `Word`; `toU64s(): bigint[]` length 4 |
| Account identifier | `AccountId` | `AccountId`; construct via `AccountId.fromHex` |
| Note visibility | `NoteType` enum | `NoteVisibility` enum (legacy alias `NoteType` is deprecated) |
| Account type | `AccountType` | `AccountType` enum |
| Authentication scheme | `AuthScheme` | `AuthScheme` enum |
| Storage mode | `StorageMode` | `StorageMode` enum |

Common gotchas:

- TS method names sometimes differ from Rust ones (e.g. `FeltArray.append` in TS vs `push` on a Rust `Vec`). When a method seems missing, consult `node_modules/@miden-sdk/miden-sdk/dist/index.d.ts` first instead of guessing the TS name from a Rust signature.
- TS amounts are always `bigint`. Mixing `number` causes silent precision loss above `Number.MAX_SAFE_INTEGER` and `TypeError` below.
- `Word.toU64s()` returns `bigint[]` of length 4. Use it when reading the four `u64` lanes from a Value storage slot or building assertions on `Word` outputs.

For the canonical Rust types, see [`0xMiden/miden-client`](https://github.com/0xMiden/miden-client) and the `miden_objects` crate. For the canonical TS types, see `node_modules/@miden-sdk/miden-sdk/dist/index.d.ts`.
