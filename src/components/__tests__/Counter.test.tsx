import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/hooks/useIncrementCounter", () => ({
  useIncrementCounter: vi.fn(),
}));

import { useIncrementCounter } from "@/hooks/useIncrementCounter";
import { Counter } from "../Counter";

const defaultHookReturn = {
  increment: vi.fn(),
  count: 42,
  isSubmitting: false,
  isWaiting: false,
  error: null,
  walletConnected: true,
  explorerUrl: "https://testnet.midenscan.com/account/mtst1test",
};

describe("Counter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useIncrementCounter).mockReturnValue(defaultHookReturn);
  });

  it("displays the current count on the button", () => {
    render(<Counter />);
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

    render(<Counter />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "count is 42" }));
    expect(mockIncrement).toHaveBeenCalledOnce();
  });

  it("shows submitting state", () => {
    vi.mocked(useIncrementCounter).mockReturnValue({
      ...defaultHookReturn,
      isSubmitting: true,
    });

    render(<Counter />);
    const button = screen.getByRole("button", { name: "Submitting..." });
    expect(button).toBeDisabled();
  });

  it("shows waiting for network state", () => {
    vi.mocked(useIncrementCounter).mockReturnValue({
      ...defaultHookReturn,
      isWaiting: true,
    });

    render(<Counter />);
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

    render(<Counter />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("disables button when count is loading (null)", () => {
    vi.mocked(useIncrementCounter).mockReturnValue({
      ...defaultHookReturn,
      count: null,
    });

    render(<Counter />);
    const button = screen.getByRole("button", { name: "count is ..." });
    expect(button).toBeDisabled();
  });

  it("displays error message", () => {
    vi.mocked(useIncrementCounter).mockReturnValue({
      ...defaultHookReturn,
      error: "Transaction failed: insufficient funds",
    });

    render(<Counter />);
    expect(
      screen.getByText("Transaction failed: insufficient funds"),
    ).toBeInTheDocument();
  });

  it("links to explorer with counter address", () => {
    render(<Counter />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "https://testnet.midenscan.com/account/mtst1test",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });
});
