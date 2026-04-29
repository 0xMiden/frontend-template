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

// `useIncrementCounter` calls into a few SDK constructors (Word/Felt/AccountId).
// The successful `increment` path that actually hits `requestTransaction`
// requires real WASM types we can't easily stub here — those are exercised by
// the live MidenFi-extension E2E. These unit tests focus on the contract +
// error paths that don't depend on those constructors.
vi.mock("@miden-sdk/miden-sdk", async () => {
  const actual: Record<string, unknown> = {};
  const factory = (name: string) =>
    class {
      constructor() {}
      static fromBech32() {
        return new (factory(name))();
      }
      static newFromFelts() {
        return new (factory(name))();
      }
      static fromPackage() {
        return new (factory(name))();
      }
      static deserialize() {
        return new (factory(name))();
      }
      static withAccountTarget() {
        return new (factory(name))();
      }
      static newNetworkAccountTarget() {
        return new (factory(name))();
      }
      static always() {
        return new (factory(name))();
      }
    };
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
    "NoteAttachment",
    "NoteExecutionHint",
    "NoteArray",
    "AccountId",
    "Felt",
    "FeltArray",
    "Word",
  ]) {
    actual[k] = factory(k);
  }
  return actual;
});

vi.mock("@miden-sdk/miden-wallet-adapter-base", () => ({
  Transaction: { createCustomTransaction: vi.fn(() => ({})) },
}));

vi.mock("@/lib/miden", () => ({ randomWord: () => ({}) }));

import { useMiden, useMidenClient } from "@miden-sdk/react";
import { useMidenFiWallet } from "@miden-sdk/miden-wallet-adapter-react";
import { useIncrementCounter } from "../useIncrementCounter";

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

  it("does not double-sync per poll iteration (drops await sync())", async () => {
    // Render the hook normally; `loadCount` runs on mount and calls
    // `client.syncState()` exactly once. The presence of a second sync would
    // show up as syncState being called >1 time in a single load.
    const { result } = renderHook(() => useIncrementCounter(COUNTER_ADDRESS));

    await waitFor(() => {
      // mount-effect ran loadCount → exactly one syncState
      expect(mockSyncState).toHaveBeenCalledTimes(1);
    });
    // No accidental double-sync from anywhere else in the mount path.
    expect(mockSyncState).toHaveBeenCalledTimes(1);
    // Sanity: the hook returned a value object.
    expect(result.current.walletConnected).toBe(false);
  });
});
