// Network counter account deployed on Miden testnet
export const COUNTER_ADDRESS: string | null = "mtst1aqmx7qv6h3y92sqsmunh8uht4ujmfy4j";

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

// Application display name (used by wallet adapter)
export const APP_NAME = "Miden Template";

// Miden SDK configuration — override via environment variables
export const MIDEN_RPC_URL =
  import.meta.env.VITE_MIDEN_RPC_URL ?? "testnet";
export const MIDEN_PROVER =
  (import.meta.env.VITE_MIDEN_PROVER as "devnet" | "testnet" | "local") ?? "testnet";
