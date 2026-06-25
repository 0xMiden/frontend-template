import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/hooks/useIncrementCounter", () => ({
  useIncrementCounter: vi.fn(),
}));

import { useIncrementCounter } from "@/hooks/useIncrementCounter";
import { ConfiguredCounter } from "../ConfiguredCounter";

const FIXTURE_ADDRESS = "0xdeadbeef00000001";

const defaultHookReturn = {
  increment: vi.fn(),
  incrementBlockedReason: null as string | null,
  count: 42,
  isSubmitting: false,
  isWaiting: false,
  error: null as string | null,
  walletConnected: true,
  explorerUrl: `https://testnet.midenscan.com/account/${FIXTURE_ADDRESS}`,
};

describe("ConfiguredCounter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useIncrementCounter).mockReturnValue(defaultHookReturn);
  });

  it("displays the current count on the button", () => {
    render(<ConfiguredCounter counterAddress={FIXTURE_ADDRESS} />);
    expect(
      screen.getByRole("button", { name: "count is 42" }),
    ).toBeInTheDocument();
  });

  it("calls increment on button click", async () => {
    const mockIncrement = vi.fn();
    vi.mocked(useIncrementCounter).mockReturnValue({
      ...defaultHookReturn,
      increment: mockIncrement,
    });

    render(<ConfiguredCounter counterAddress={FIXTURE_ADDRESS} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "count is 42" }));
    expect(mockIncrement).toHaveBeenCalledOnce();
  });

  it("shows submitting state", () => {
    vi.mocked(useIncrementCounter).mockReturnValue({
      ...defaultHookReturn,
      isSubmitting: true,
    });

    render(<ConfiguredCounter counterAddress={FIXTURE_ADDRESS} />);
    const button = screen.getByRole("button", { name: "Submitting..." });
    expect(button).toBeDisabled();
  });

  it("shows waiting for network state", () => {
    vi.mocked(useIncrementCounter).mockReturnValue({
      ...defaultHookReturn,
      isWaiting: true,
    });

    render(<ConfiguredCounter counterAddress={FIXTURE_ADDRESS} />);
    const button = screen.getByRole("button", {
      name: "Waiting for network...",
    });
    expect(button).toBeDisabled();
  });

  it("disables button when wallet not connected", () => {
    vi.mocked(useIncrementCounter).mockReturnValue({
      ...defaultHookReturn,
      walletConnected: false,
    });

    render(<ConfiguredCounter counterAddress={FIXTURE_ADDRESS} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("disables button when count is loading (null)", () => {
    vi.mocked(useIncrementCounter).mockReturnValue({
      ...defaultHookReturn,
      count: null,
    });

    render(<ConfiguredCounter counterAddress={FIXTURE_ADDRESS} />);
    const button = screen.getByRole("button", { name: "count is ..." });
    expect(button).toBeDisabled();
  });

  it("disables the button and explains why when the write path is blocked (v0.15)", async () => {
    const mockIncrement = vi.fn();
    const reason =
      "On-chain increment is unavailable on Miden SDK v0.15: the web SDK can’t attach a network-execution target to a custom note yet.";
    vi.mocked(useIncrementCounter).mockReturnValue({
      ...defaultHookReturn,
      increment: mockIncrement,
      incrementBlockedReason: reason,
    });

    render(<ConfiguredCounter counterAddress={FIXTURE_ADDRESS} />);

    // Count still renders (read path works); button is disabled and explains why.
    const button = screen.getByRole("button", { name: "count is 42" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", reason);
    expect(screen.getByText(reason)).toBeInTheDocument();

    // A disabled button cannot be clicked, so increment is never invoked.
    const user = userEvent.setup();
    await user.click(button);
    expect(mockIncrement).not.toHaveBeenCalled();
  });

  it("displays error message", () => {
    vi.mocked(useIncrementCounter).mockReturnValue({
      ...defaultHookReturn,
      error: "Transaction failed: insufficient funds",
    });

    render(<ConfiguredCounter counterAddress={FIXTURE_ADDRESS} />);
    expect(
      screen.getByText("Transaction failed: insufficient funds"),
    ).toBeInTheDocument();
  });

  it("links to explorer with counter address", () => {
    render(<ConfiguredCounter counterAddress={FIXTURE_ADDRESS} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      `https://testnet.midenscan.com/account/${FIXTURE_ADDRESS}`,
    );
    expect(link).toHaveAttribute("target", "_blank");
  });
});
