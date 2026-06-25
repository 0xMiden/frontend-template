import { renderHook, act, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

// Stub fetch — `increment` fetches `/packages/increment_note.masp`. We never
// reach Note construction in any test below (the path either short-circuits
// on a missing wallet address or is short-circuited before `requestTransaction`
// completes), but the fetch itself runs once and we don't want jsdom to error
// out on an unhandled network request.
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

// `useIncrementCounter` calls into many SDK constructors (Word/Felt/AccountId,
// note builders, etc.) and chained builder methods like
// `TransactionRequestBuilder().withOwnOutputNotes(...).build()`. We don't need
// real values from these in unit tests — only that calls don't throw and the
// hook can reach the poll loop. A Proxy-backed stub satisfies all chained
// calls (`new X(...)`, `X.staticMethod(...)`, `instance.foo().bar(...)`) by
// returning another callable+constructable stub for any property access.
//
// The one shape we DO need real data from is `Word.toU64s()` (the storage-map
// value the hook reads to derive the count). The proxy intercepts that
// specific access and returns a 4-tuple BigUint64Array-like value.
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
  NETWORK_POLL_INTERVAL_MS,
  NETWORK_POLL_TIMEOUT_MS,
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

  it("surfaces an error when increment is called without a wallet address", async () => {
    // Default stub has `address: null` (wallet not connected to an account).
    // Make the mount-time loadCount succeed so its error path doesn't race
    // with the one we're asserting against.
    const fakeAccount = {
      storage: () => ({ getMapItem: () => null }),
    };
    mockGetAccount.mockResolvedValue(fakeAccount as never);

    const { result } = renderHook(() => useIncrementCounter(COUNTER_ADDRESS));
    // Wait for mount-effect to finish (count resolves from null → 0).
    await waitFor(() => expect(result.current.count).toBe(0));

    await act(async () => {
      await result.current.increment();
    });

    expect(result.current.error).toMatch(/no wallet account available/i);
    expect(result.current.isSubmitting).toBe(false);
    // requestTransaction must NOT have been called — we short-circuit before
    // touching the wallet.
    expect(defaultWallet.requestTransaction).not.toHaveBeenCalled();
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

  it("does not call useMiden().sync() during a poll iteration", async () => {
    // Wallet must be connected so increment doesn't short-circuit before the
    // poll loop. Provide a real address + a working `requestTransaction`.
    const requestTransaction = vi.fn(async () => "0xtx");
    vi.mocked(useMidenFiWallet).mockReturnValue({
      ...defaultWallet,
      address: "mtst1arwk88k8smzcq5p30upr6eerw5npmnyz",
      connected: true,
      requestTransaction,
    });

    // Spy on the hook-level `sync()`. The fix this test guards against would
    // call this inside the poll loop; production code now does not.
    const sync = vi.fn(async () => undefined);
    vi.mocked(useMiden).mockReturnValue({
      client: null,
      isReady: true,
      isInitializing: false,
      error: null,
      sync,
      runExclusive: <T,>(fn: () => Promise<T>) => fn(),
      prover: null,
      signerAccountId: null,
      signerConnected: null,
    });

    // Storage-map value drives `count`. `Word.toU64s()` already resolves to
    // [0n, 0n, 0n, 0n] via the SDK proxy stub above, so `loadCount()` always
    // returns 0 → `previousCount === latest`. The loop will keep ticking
    // until the deadline; we only need ONE iteration to elapse, then stop.
    mockGetAccount.mockResolvedValue({
      storage: () => ({ getMapItem: () => ({ toU64s: () => [0n, 0n, 0n, 0n] }) }),
    } as never);

    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useIncrementCounter(COUNTER_ADDRESS));

      // Wait for mount-effect's loadCount to settle.
      await vi.waitFor(() => {
        expect(result.current.count).toBe(0);
      });

      // Snapshot sync-call count before increment so we measure only what
      // happens during the click + poll iteration.
      expect(sync).not.toHaveBeenCalled();

      // Trigger increment without awaiting; the call schedules the poll loop.
      let incrementPromise: Promise<void> | undefined;
      await act(async () => {
        incrementPromise = result.current.increment();
        // Let microtasks settle for the requestTransaction await.
        await Promise.resolve();
      });

      // Advance past one poll interval (2.5s) — exactly one iteration runs.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(NETWORK_POLL_INTERVAL_MS + 50);
      });

      // The redundant `await sync()` was removed from the poll loop. After
      // one iteration, `useMiden().sync` must not have been called.
      expect(sync).not.toHaveBeenCalled();

      // requestTransaction was reached — proves the loop actually ran.
      expect(requestTransaction).toHaveBeenCalledTimes(1);

      // Drain the rest of the deadline so the increment promise resolves
      // cleanly and React unmount can finish.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(NETWORK_POLL_TIMEOUT_MS);
        await incrementPromise;
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
