import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WalletContextState } from "@miden-sdk/miden-wallet-adapter-react";
import { useWalletSend } from "../useWalletSend";
import { JOURNAL_KEY, readJournal, writeJournal } from "../journal";

const sender = "mtst1arqxg9er3xclayt95nud82jnpggl9azj";
const input = {
  recipient: sender,
  faucetId: "mtst1aqvpq8a9ytqhfvt9al20wzsrs56g83ec",
  amount: "10",
};
const intent = {
  ...input,
  sender,
  version: 1 as const,
  network: "testnet" as const,
  phase: "submitting" as const,
};

function wallet() {
  return {
    connected: true,
    address: sender,
    requestSend: vi.fn<NonNullable<WalletContextState["requestSend"]>>(
      async () => "accepted-1",
    ),
    waitForTransaction: vi.fn<
      NonNullable<WalletContextState["waitForTransaction"]>
    >(async () => ({ txHash: "chain-2", outputNotes: [] })),
  };
}

describe("wallet-managed send", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: vi.fn(async (_name, _options, fn) => fn({ name: "test" })),
      },
    });
  });

  it("persists before dispatch and distinguishes accepted work from a reported result", async () => {
    const w = wallet();
    w.requestSend.mockImplementation(async () => {
      expect(readJournal(localStorage)).toEqual(intent);
      return "accepted-1";
    });
    const { result } = renderHook(() => useWalletSend(w));
    await act(() => result.current.send(input));
    expect(w.requestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        senderAddress: sender,
        noteType: "public",
        amount: 10,
      }),
    );
    expect(w.waitForTransaction).toHaveBeenCalledWith("accepted-1", 60_000);
    expect(readJournal(localStorage)).toMatchObject({
      phase: "reported",
      requestId: "accepted-1",
      txHash: "chain-2",
    });
    await act(() => result.current.send(input));
    expect(w.requestSend).toHaveBeenCalledTimes(1);
  });

  it("reconciles a persisted id after reload without sending again", async () => {
    writeJournal(localStorage, {
      ...intent,
      phase: "accepted",
      requestId: "old-id",
    });
    const w = wallet();
    const { result } = renderHook(() => useWalletSend(w));
    await act(() => result.current.reconcile());
    expect(w.requestSend).not.toHaveBeenCalled();
    expect(w.waitForTransaction).toHaveBeenCalledWith("old-id", 60_000);
    expect(result.current.journal?.txHash).toBe("chain-2");
  });

  it("retains accepted ids on timeout and allows checking that same id", async () => {
    const w = wallet();
    w.waitForTransaction.mockRejectedValueOnce(new Error("Timed out"));
    const { result } = renderHook(() => useWalletSend(w));
    await act(() => result.current.send(input));
    expect(result.current.journal).toMatchObject({
      phase: "accepted",
      requestId: "accepted-1",
    });
    await act(() => result.current.send(input));
    await act(() => result.current.reconcile());
    expect(w.requestSend).toHaveBeenCalledTimes(1);
    expect(w.waitForTransaction.mock.calls.map((c) => c[0])).toEqual([
      "accepted-1",
      "accepted-1",
    ]);
  });

  it("blocks retry after a refused/lost response with no id, including after remount", async () => {
    const w = wallet();
    w.requestSend.mockRejectedValue(
      new Error("Request refused or connection lost"),
    );
    const first = renderHook(() => useWalletSend(w));
    await act(() => first.result.current.send(input));
    first.unmount();
    const second = renderHook(() => useWalletSend(w));
    await act(() => second.result.current.send(input));
    await act(() => second.result.current.reconcile());
    expect(w.requestSend).toHaveBeenCalledTimes(1);
    expect(w.waitForTransaction).not.toHaveBeenCalled();
    expect(readJournal(localStorage)?.phase).toBe("submitting");
  });

  it("blocks work for a different connected account or disconnected session", async () => {
    writeJournal(localStorage, {
      ...intent,
      phase: "accepted",
      requestId: "old-id",
    });
    const w = { ...wallet(), address: input.faucetId };
    const { result, rerender } = renderHook(() => useWalletSend(w));
    await act(() => result.current.reconcile());
    w.address = sender;
    w.connected = false;
    rerender();
    await act(() => result.current.reconcile());
    expect(w.waitForTransaction).not.toHaveBeenCalled();
  });

  it("does not dispatch when storage is blocked or corrupted", async () => {
    const w = wallet();
    const { result } = renderHook(() => useWalletSend(w));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Quota exceeded");
    });
    await act(() => result.current.send(input));
    expect(w.requestSend).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/Quota/);
  });

  it("fails closed when cross-tab locks are unavailable", async () => {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: undefined,
    });
    const w = wallet();
    const { result } = renderHook(() => useWalletSend(w));
    await act(() => result.current.send(input));
    expect(w.requestSend).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/Web Locks/);
  });

  it("does not dispatch or discard a corrupted journal", async () => {
    localStorage.setItem(JOURNAL_KEY, "broken-record");
    const w = wallet();
    const { result } = renderHook(() => useWalletSend(w));
    expect(result.current.blocked).toBe(true);
    await act(() => result.current.send(input));
    expect(w.requestSend).not.toHaveBeenCalled();
    expect(localStorage.getItem(JOURNAL_KEY)).toBe("broken-record");
  });

  it("allows a deliberate second request only after the first wallet result was reported", async () => {
    const w = wallet();
    const { result } = renderHook(() => useWalletSend(w));
    await act(() => result.current.send(input));
    await act(() => result.current.startAnother());
    expect(result.current.journal).toBeNull();
    await act(() => result.current.send(input));
    expect(w.requestSend).toHaveBeenCalledTimes(2);
  });

  it("rereads a journal from another tab before dispatch and responds to storage events", async () => {
    const w = wallet();
    const { result } = renderHook(() => useWalletSend(w));
    writeJournal(localStorage, intent);
    await act(() => result.current.send(input));
    expect(w.requestSend).not.toHaveBeenCalled();
    act(() =>
      window.dispatchEvent(new StorageEvent("storage", { key: JOURNAL_KEY })),
    );
    await waitFor(() => expect(result.current.journal).toEqual(intent));
  });

  it("dispatches once for concurrent clicks", async () => {
    const w = wallet();
    const { result } = renderHook(() => useWalletSend(w));
    await act(async () => {
      await Promise.all([
        result.current.send(input),
        result.current.send(input),
      ]);
    });
    expect(w.requestSend).toHaveBeenCalledTimes(1);
  });
});
