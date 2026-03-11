import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@miden-sdk/react", () => import("@/__tests__/mocks/miden-sdk-react"));
vi.mock("@miden-sdk/miden-wallet-adapter", () => ({
  WalletMultiButton: () => <button>Connect Wallet</button>,
}));
vi.mock("@/components/Counter", () => ({
  Counter: () => <div data-testid="counter">Counter Mock</div>,
}));

import { useMiden, useSyncState } from "@miden-sdk/react";
import { AppContent } from "../AppContent";

describe("AppContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders main content when Miden is ready", () => {
    render(<AppContent />);

    expect(screen.getByText("Vite + React + Miden")).toBeInTheDocument();
    expect(screen.getByAltText("Vite logo")).toBeInTheDocument();
    expect(screen.getByAltText("React logo")).toBeInTheDocument();
    expect(screen.getByAltText("Miden logo")).toBeInTheDocument();
    expect(screen.getByText("Connect Wallet")).toBeInTheDocument();
    expect(screen.getByTestId("counter")).toBeInTheDocument();
  });

  it("shows sync height from testnet", () => {
    render(<AppContent />);
    expect(screen.getByText(/Testnet block: 12345/)).toBeInTheDocument();
  });

  it("shows syncing indicator when syncHeight is null", () => {
    vi.mocked(useSyncState).mockReturnValue({
      syncHeight: null as unknown as number,
      isSyncing: true,
      lastSyncTime: null,
      error: null,
      sync: vi.fn(),
    });

    render(<AppContent />);
    expect(screen.getByText(/syncing\.\.\./)).toBeInTheDocument();
  });

  it("shows loading message during initialization", () => {
    vi.mocked(useMiden).mockReturnValue({
      client: null,
      isReady: false,
      isInitializing: true,
      error: null,
      sync: vi.fn(),
      runExclusive: vi.fn(),
      prover: null,
      signerAccountId: null,
    });

    render(<AppContent />);
    expect(
      screen.getByText("Initializing Miden client..."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Vite + React + Miden")).not.toBeInTheDocument();
  });

  it("shows error message on initialization failure", () => {
    vi.mocked(useMiden).mockReturnValue({
      client: null,
      isReady: false,
      isInitializing: false,
      error: new Error("WASM failed to load"),
      sync: vi.fn(),
      runExclusive: vi.fn(),
      prover: null,
      signerAccountId: null,
    });

    render(<AppContent />);
    expect(
      screen.getByText("Failed to initialize Miden client"),
    ).toBeInTheDocument();
    expect(screen.getByText("WASM failed to load")).toBeInTheDocument();
  });
});
