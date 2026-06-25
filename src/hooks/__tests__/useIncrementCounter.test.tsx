import { renderHook, act, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

// `increment` is gated on v0.15 (config `INCREMENT_ONCHAIN_BLOCKED`) and returns
// before any fetch / SDK note construction / wallet call, so the artifact fetch
// is never reached. We still stub fetch so an accidental call can't hit the
// network under jsdom.
const mockFetch = vi.fn(async () => ({
  arrayBuffer: async () => new ArrayBuffer(0),
}));
vi.stubGlobal("fetch", mockFetch);

vi.mock("@miden-sdk/react", () => import("@/__tests__/mocks/miden-sdk-react"));

// `useIncrementCounter` reads `requestTransaction` and `address` directly from
// the hook return per `WalletContextState`. We mock the wallet-adapter-react
// package and provide a default disconnected stub. Individual tests override
// via `vi.mocked(useMidenFiWallet).mockReturnValue(...)`.
const defaultWallet = {
  autoConnect: false,
  wallets: [],
  wallet: null,
  address: null as string | null,
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
};

const mockGetAccount = vi.fn(async () => null);
const mockImportAccountById = vi.fn(async () => undefined);
const mockSyncState = vi.fn(async () => undefined);

vi.mock("@miden-sdk/miden-wallet-adapter-react", () => ({
  useMidenFiWallet: vi.fn(() => defaultWallet),
}));

// `loadCount` (the read path) calls into a handful of SDK constructors —
// `AccountId.fromBech32`, `Word.newFromFelts`, `new Felt(...)` — and reads
// `value.toU64s()` from the storage map. A Proxy-backed stub satisfies every
// `new X(...)` / `X.static(...)` / `instance.foo().bar(...)` chain by returning
// another callable+constructable stub; we intercept `toU64s` to return a real
// 4-tuple so the count derivation works. The note-construction classes are
// listed too but are never reached while the write path is gated.
vi.mock("@miden-sdk/miden-sdk", async () => {
  const stub = (): object =>
    new Proxy(function noop() {}, {
      get: (_t, prop) => {
        if (prop === "toU64s") return () => [0n, 0n, 0n, 0n];
        // Avoid breaking Promise resolution / native Symbol checks
        if (typeof prop === "symbol") return undefined;
        return stub();
      },
      apply: () => stub(),
      construct: () => stub(),
    });
  const exports: Record<string, unknown> = {};
  for (const k of [
    "TransactionRequestBuilder",
    "Package",
    "NoteScript",
    "Note",
    "NoteAssets",
    "NoteMetadata",
    "NoteRecipient",
    "NoteStorage",
    "NoteTag",
    "NoteType",
    "NoteArray",
    "AccountId",
    "Felt",
    "FeltArray",
    "Word",
  ]) {
    exports[k] = stub();
  }
  return exports;
});

vi.mock("@miden-sdk/miden-wallet-adapter-base", () => ({
  Transaction: { createCustomTransaction: vi.fn(() => ({})) },
}));

vi.mock("@/lib/miden", () => ({ randomWord: () => ({}) }));

import { useMiden, useMidenClient } from "@miden-sdk/react";
import { useMidenFiWallet } from "@miden-sdk/miden-wallet-adapter-react";
import { useIncrementCounter } from "../useIncrementCounter";
import {
  INCREMENT_BLOCKED_MESSAGE,
  INCREMENT_ONCHAIN_BLOCKED,
} from "@/config";

const COUNTER_ADDRESS = "mtst1aqmx7qv6h3y92sqsmunh8uht4ujmfy4j";

describe("useIncrementCounter", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mockGetAccount.mockReset();
    mockImportAccountById.mockReset();
    mockSyncState.mockReset();
    mockFetch.mockClear();

    vi.mocked(useMiden).mockReturnValue({
      client: null,
      isReady: true,
      isInitializing: false,
      error: null,
      sync: vi.fn(),
      runExclusive: <T,>(fn: () => Promise<T>) => fn(),
      prover: null,
      signerAccountId: null,
      signerConnected: null,
    });
    vi.mocked(useMidenClient).mockReturnValue({
      getAccount: mockGetAccount,
      importAccountById: mockImportAccountById,
      syncState: mockSyncState,
    } as unknown as ReturnType<typeof useMidenClient>);
    vi.mocked(useMidenFiWallet).mockReturnValue(defaultWallet);
  });

  it("loads the counter value from on-chain storage (read path)", async () => {
    // Account present with a storage-map value → count derives from toU64s()[0].
    mockGetAccount.mockResolvedValue({
      storage: () => ({
        getMapItem: () => ({ toU64s: () => [7n, 0n, 0n, 0n] }),
      }),
    } as never);

    const { result } = renderHook(() => useIncrementCounter(COUNTER_ADDRESS));

    await waitFor(() => expect(result.current.count).toBe(7));
    expect(result.current.error).toBeNull();
  });

  it("surfaces an error when the counter account is unreachable on-chain", async () => {
    // import + retry both return null → should setError, not stay silent.
    mockGetAccount.mockResolvedValue(null);

    const { result } = renderHook(() => useIncrementCounter(COUNTER_ADDRESS));

    await waitFor(() => {
      expect(result.current.error).toMatch(/counter account not found/i);
    });
    expect(result.current.count).toBeNull();
  });

  it("gates the on-chain write path on v0.15: exposes the reason, surfaces it on click, and never submits a transaction", async () => {
    // Sanity: the migration intentionally disables the write path on v0.15.
    expect(INCREMENT_ONCHAIN_BLOCKED).toBe(true);

    // Connect a wallet so the ONLY thing stopping submission is the v0.15 gate
    // (not the missing-wallet guard, which sits after it).
    const requestTransaction = vi.fn(async () => "0xtx");
    vi.mocked(useMidenFiWallet).mockReturnValue({
      ...defaultWallet,
      address: "mtst1arwk88k8smzcq5p30upr6eerw5npmnyz",
      connected: true,
      requestTransaction,
    });
    mockGetAccount.mockResolvedValue({
      storage: () => ({
        getMapItem: () => ({ toU64s: () => [0n, 0n, 0n, 0n] }),
      }),
    } as never);

    const { result } = renderHook(() => useIncrementCounter(COUNTER_ADDRESS));
    await waitFor(() => expect(result.current.count).toBe(0));

    // The hook advertises the blocker so the UI can disable + explain.
    expect(result.current.incrementBlockedReason).toBe(INCREMENT_BLOCKED_MESSAGE);

    await act(async () => {
      await result.current.increment();
    });

    // The doomed, fee-bearing submission must NOT happen on v0.15: no wallet
    // transaction, no artifact fetch, no poll spin-up — just the clear blocker.
    expect(requestTransaction).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.error).toBe(INCREMENT_BLOCKED_MESSAGE);
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.isWaiting).toBe(false);
  });
});
