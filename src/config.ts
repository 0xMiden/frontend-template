// Network counter account deployed on Miden testnet.
//
// Resolution rules for `COUNTER_ADDRESS`:
//   - `VITE_MIDEN_COUNTER_ADDRESS` unset (or omitted) → use the live default
//     deployment (the testnet counter the template ships with).
//   - `VITE_MIDEN_COUNTER_ADDRESS=""` (explicit empty string) → unconfigured,
//     `<Counter>` renders the "address not configured" card.
//   - Any other string → that string is used verbatim (e.g. your own deploy).
const DEFAULT_COUNTER_ADDRESS = "mtst1aqmx7qv6h3y92sqsmunh8uht4ujmfy4j";
const configuredCounterAddress: string | undefined =
  import.meta.env.VITE_MIDEN_COUNTER_ADDRESS;

export const COUNTER_ADDRESS: string | null =
  configuredCounterAddress === ""
    ? null
    : (configuredCounterAddress ?? DEFAULT_COUNTER_ADDRESS);

// StorageMap slot name for the counter
export const COUNTER_SLOT_NAME =
  "miden_counter_account::counter_contract::count_map";

// Block explorer base URL
export const EXPLORER_BASE_URL = "https://testnet.midenscan.com";

// Poll interval (ms) while waiting for the network operator to consume an
// increment note and update the counter's on-chain state.
export const NETWORK_POLL_INTERVAL_MS = 2_500;

// Hard cap (ms) on how long to poll for the post-increment state change before
// giving up and showing whatever value the counter currently has. Covers
// ~3 block cycles at testnet's ~3s block time with margin.
export const NETWORK_POLL_TIMEOUT_MS = 30_000;

// ── On-chain increment: blocked on Miden SDK v0.15 ──────────────────────────
// The increment note is a custom-script note that the network operator only
// executes if it carries a `NetworkAccountTarget` attachment. v0.15 CAN build
// that attachment — `NoteAttachment.fromWord(new NoteAttachmentScheme(2), word)`
// (scheme id 2 = NetworkAccountTarget), or `createNoteAttachment(...)` from
// `@miden-sdk/react`. What v0.15 lacks is any entry point to ATTACH a
// `NoteAttachment` to a *custom-script* note: `NoteMetadata` no longer carries
// attachments and the `Note` constructor takes none — only
// `Note.createP2IDNote`/`createP2IDENote` accept one (and those force the P2ID
// script, not the increment script). So the write path cannot be completed from
// the web SDK yet. (The shipped `.masp` also needs a v0.15 / MAST `[0,0,3]`
// rebuild and the counter a v0.15 redeploy.) The increment hook therefore
// surfaces this and does NOT submit a doomed, fee-bearing transaction.
//
// To re-enable once 0xMiden/web-sdk ships a custom-note attachment API: set this
// to `false`, restore the attachment line in `useIncrementCounter.ts`, rebuild
// the artifacts, and redeploy a v0.15 counter. See README → Known Temporary
// Workarounds.
export const INCREMENT_ONCHAIN_BLOCKED: boolean = true;
export const INCREMENT_BLOCKED_MESSAGE =
  'On-chain increment is unavailable on Miden SDK v0.15: the web SDK can’t attach a network-execution target to a custom note yet (it also needs a v0.15-rebuilt .masp and a redeployed v0.15 counter). The counter read path still works — see the README’s “Known Temporary Workarounds”.';

// Application display name (used by wallet adapter)
export const APP_NAME = "Miden Template";

// Miden SDK configuration — override via environment variables
export const MIDEN_RPC_URL =
  import.meta.env.VITE_MIDEN_RPC_URL ?? "testnet";
export const MIDEN_PROVER =
  (import.meta.env.VITE_MIDEN_PROVER as "devnet" | "testnet" | "local") ?? "testnet";
