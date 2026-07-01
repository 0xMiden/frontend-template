// Public (NoAuth) counter account deployed on Miden testnet.
//
// Resolution rules for `COUNTER_ADDRESS`:
//   - `VITE_MIDEN_COUNTER_ADDRESS` unset (or omitted) → use the live default
//     deployment (the testnet counter the template ships with).
//   - `VITE_MIDEN_COUNTER_ADDRESS=""` (explicit empty string) → unconfigured,
//     `<Counter>` renders the "address not configured" card.
//   - Any other string → that string is used verbatim (e.g. your own deploy).
// v0.15 counter deployed from project-template `migrate-protocol-v015`
// (contracts/counter-account, built with cargo-miden 0.9). Public + NoAuth, so
// anyone can consume increment notes against it. Hex account id (use AccountId.fromHex).
const DEFAULT_COUNTER_ADDRESS = "0x4dcaee76ffebfc511e06582702289d";
const configuredCounterAddress: string | undefined =
  import.meta.env.VITE_MIDEN_COUNTER_ADDRESS;

export const COUNTER_ADDRESS: string | null =
  configuredCounterAddress === ""
    ? null
    : (configuredCounterAddress ?? DEFAULT_COUNTER_ADDRESS);

// StorageMap slot name for the counter (v0.15 counter-account component)
export const COUNTER_SLOT_NAME =
  "counter_account::counter_contract::count_map";

// Block explorer base URL
export const EXPLORER_BASE_URL = "https://testnet.midenscan.com";

// Poll interval (ms) while waiting for a submitted transaction (the increment
// note publish, then the counter's consume) to commit and the count to update.
export const NETWORK_POLL_INTERVAL_MS = 2_500;

// Hard cap (ms) on how long to wait for each step of the increment (publish
// commit, then the post-consume count change) before giving up. Covers several
// testnet block cycles (~3s block time) with margin.
export const NETWORK_POLL_TIMEOUT_MS = 60_000;

// Compiled increment-note package (cargo-miden 0.9, MAST [0,0,3]). Fetched at
// runtime and turned into the note script the counter consumes.
export const INCREMENT_NOTE_PACKAGE_URL = "/packages/increment-note.masp";

// Application display name (used by wallet adapter)
export const APP_NAME = "Miden Template";

// Miden SDK configuration — override via environment variables
export const MIDEN_RPC_URL =
  import.meta.env.VITE_MIDEN_RPC_URL ?? "testnet";
export const MIDEN_PROVER =
  (import.meta.env.VITE_MIDEN_PROVER as "devnet" | "testnet" | "local") ?? "testnet";
