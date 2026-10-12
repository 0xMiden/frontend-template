import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@miden-sdk/miden-wallet-adapter-react", () => ({
  useWallet: vi.fn(),
}));
import { useWallet } from "@miden-sdk/miden-wallet-adapter-react";
import { WalletReadyState } from "@miden-sdk/miden-wallet-adapter-base";
import { MiniApp } from "../MiniApp";

const sender = "mtst1arqxg9er3xclayt95nud82jnpggl9azj";
const mocks = {
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(async () => {}),
  select: vi.fn(),
};
const w = {
  ...mocks,
  connected: false,
  connecting: false,
  disconnecting: false,
  address: null,
  wallets: [],
  wallet: null,
  autoConnect: false,
  publicKey: null,
  requestTransaction: undefined,
  requestSend: vi.fn(async () => "accepted-1"),
  waitForTransaction: vi.fn(async () => ({
    txHash: "hash-2",
    outputNotes: [],
  })),
  requestConsume: undefined,
  requestAssets: undefined,
  requestPrivateNotes: undefined,
  signBytes: undefined,
  importPrivateNote: undefined,
  requestConsumableNotes: undefined,
  requestGuardianInfo: undefined,
};

describe("mini-app connection screen", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(useWallet).mockReturnValue(w);
  });

  it("renders provider absence with disabled actions instead of waiting for a client", () => {
    render(<MiniApp />);
    expect(
      screen.getByRole("heading", { name: "Send with Bread" }),
    ).toBeVisible();
    expect(screen.getByText(/Open this page in Bread/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Choose Bread" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Request public send" }),
    ).toBeDisabled();
  });

  it("requests explicit selection before connecting and handles refusal", async () => {
    const user = userEvent.setup();
    const adapter = { name: "Bread Wallet" } as NonNullable<
      ReturnType<typeof useWallet>["wallet"]
    >["adapter"];
    const installed = { adapter, readyState: WalletReadyState.Installed };
    vi.mocked(useWallet).mockReturnValue({ ...w, wallets: [installed] });
    const { rerender } = render(<MiniApp />);
    await user.click(screen.getByRole("button", { name: "Choose Bread" }));
    expect(mocks.select).toHaveBeenCalledWith("Bread Wallet");
    expect(mocks.connect).not.toHaveBeenCalled();
    vi.mocked(useWallet).mockReturnValue({
      ...w,
      wallet: installed,
      wallets: [installed],
    });
    mocks.connect.mockRejectedValueOnce(new Error("Connection declined"));
    rerender(<MiniApp />);
    await user.click(screen.getByRole("button", { name: "Connect Bread" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Connection declined",
    );
  });

  it("clears form values when the account changes", async () => {
    const user = userEvent.setup();
    vi.mocked(useWallet).mockReturnValue({
      ...w,
      connected: true,
      address: sender,
    });
    const { rerender } = render(<MiniApp />);
    await user.type(screen.getByLabelText("Recipient Testnet address"), sender);
    expect(screen.getByLabelText("Recipient Testnet address")).toHaveValue(
      sender,
    );
    vi.mocked(useWallet).mockReturnValue({
      ...w,
      connected: true,
      address: "other-account",
    });
    rerender(<MiniApp />);
    expect(screen.getByLabelText("Recipient Testnet address")).toHaveValue("");
  });

  it("lets the user correct validation input before a request was dispatched", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: vi.fn(async (_name, _options, fn) => fn({ name: "test" })),
      },
    });
    vi.mocked(useWallet).mockReturnValue({
      ...w,
      connected: true,
      address: sender,
    });
    render(<MiniApp />);
    await user.type(screen.getByLabelText("Recipient Testnet address"), sender);
    await user.type(
      screen.getByLabelText("Token faucet Testnet address"),
      "mtst1aqvpq8a9ytqhfvt9al20wzsrs56g83ec",
    );
    await user.type(
      screen.getByLabelText("Amount in token base units"),
      "9007199254740992",
    );
    await user.click(
      screen.getByRole("button", { name: "Request public send" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/safe integer/);
    expect(w.requestSend).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Amount in token base units")).toBeEnabled();
  });
});
