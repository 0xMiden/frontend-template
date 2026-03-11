# Miden Frontend App

React 19 + TypeScript + Vite frontend for the Miden blockchain.

## Project Structure

- `src/` — React application source
- `src/components/` — UI components (Counter, AppContent)
- `src/hooks/` — Custom hooks (useIncrementCounter)
- `src/lib/` — Shared utilities
- `vite.config.ts` — Vite config with midenVitePlugin() from @miden-sdk/vite-plugin
- `package.json` — Dependencies: @miden-sdk/react, @miden-sdk/miden-sdk, @demox-labs/miden-wallet-adapter

## Build & Dev

```
npm run dev          # Start dev server (Vite)
npm run build        # Type check + production build (tsc -b && vite build)
npm run lint         # ESLint
```

Type checking alone (verification command):
```
npx tsc -b --noEmit
```

## SDK Choice: React SDK over Raw WebClient

ALWAYS prefer `@miden-sdk/react` hooks over raw `@miden-sdk/miden-sdk` WebClient methods.
Only use WebClient directly via `useMidenClient()` for operations not covered by hooks.

### Setup (main.tsx or App.tsx)
```tsx
import { MidenProvider } from "@miden-sdk/react";

<MidenProvider config={{ rpcUrl: "devnet", prover: "devnet" }}>
  <App />
</MidenProvider>
```

### Query Hooks (return { data, isLoading, error, refetch })
```tsx
const { data: accounts } = useAccounts();       // .wallets, .faucets, .all
const { data: account } = useAccount(accountId); // .balance(faucetId)
const { data: notes } = useNotes();              // .input, .consumable
const { syncHeight, sync } = useSyncState();
const { data: metadata } = useAssetMetadata(faucetId); // .symbol, .decimals
```

### Mutation Hooks (return { mutate, isLoading, stage, error, reset })
Transaction stages: `idle → executing → proving → submitting → complete`
```tsx
const { mutate: createWallet } = useCreateWallet();
const { mutate: send, stage } = useSend();
const { mutate: consume } = useConsume();
const { mutate: mint } = useMint();
const { mutate: swap } = useSwap();
const { mutate: execute } = useTransaction();  // arbitrary tx requests
```

### Token Amounts Are BigInt
```tsx
import { formatAssetAmount, parseAssetAmount } from "@miden-sdk/react";
const display = formatAssetAmount(balance, 8);  // bigint → string
const amount = parseAssetAmount("1.5", 8);       // string → bigint
```

## Critical Pitfalls

**WASM init must complete first**: Always use MidenProvider's `loadingComponent` or check `useMiden().isReady`. Components rendering before WASM init will crash.

**Recursive WASM access crashes**: Never call client methods concurrently. Use `runExclusive()` from `useMiden()` for sequential execution. Built-in hooks handle this automatically.

**COOP/COEP headers required**: WASM SharedArrayBuffer needs `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` in vite.config.ts AND production server.

**Token amounts are bigint, not number**: `send({ amount: 1000 })` will fail. Use `amount: 1000n` or `parseAssetAmount("10", 8)`.

## General Frontend Skills (Recommended)

For general React, TypeScript, and design capabilities, install these official skills alongside our Miden-specific ones:

```bash
# Vercel's React/design skills
git clone https://github.com/vercel-labs/agent-skills.git
# Install: react-best-practices, web-design-guidelines, composition-patterns

# Anthropic's frontend design skill (Claude Code plugin)
# See: https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design
```

These provide the general frontend layer. The Miden-specific skills below layer on top.

## Miden Skills

For Miden-specific guidance, Claude will auto-load these skills when relevant:
- `react-sdk-patterns` — Complete React SDK hook API reference
- `frontend-pitfalls` — All frontend/WASM/browser pitfalls with safe/unsafe examples
- `miden-concepts` — Miden architecture from a developer perspective
- `vite-wasm-setup` — Vite + WASM configuration, deployment headers, troubleshooting

## Advanced Development

For complex applications beyond basic hook usage (custom signers, raw WebClient, advanced note flows):

1. Clone `miden-client` repo alongside this project (see `frontend-source-guide` skill)
2. Use Plan Mode first — Claude explores React SDK source + examples before coding
3. Claude uses sub-agents to explore repos efficiently without filling main context
4. The type check hook provides verification — check types, fix errors, recheck

The basic skills cover ~80% of patterns. Source repos provide the remaining 20% for advanced builders.

## Verification Workflow

After modifying TypeScript/React code, always:
1. Type check: `npx tsc -b --noEmit`
2. Build test: `npm run build`
