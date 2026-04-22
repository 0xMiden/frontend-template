import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/components/ConfiguredCounter", () => ({
  ConfiguredCounter: ({ counterAddress }: { counterAddress: string }) => (
    <div data-testid="configured-counter">{counterAddress}</div>
  ),
}));

vi.mock("@/config", async () => {
  const actual = await vi.importActual<typeof import("@/config")>("@/config");
  return { ...actual };
});

import { Counter } from "../Counter";
import * as config from "@/config";

describe("Counter gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders ConfiguredCounter when COUNTER_ADDRESS is set", () => {
    render(<Counter />);
    const configured = screen.getByTestId("configured-counter");
    expect(configured).toBeInTheDocument();
    expect(configured).toHaveTextContent(config.COUNTER_ADDRESS!);
  });

  it("shows not-configured message when COUNTER_ADDRESS is null", () => {
    vi.spyOn(config, "COUNTER_ADDRESS", "get").mockReturnValue(
      null as unknown as string,
    );

    render(<Counter />);
    expect(
      screen.getByText(/counter address not configured/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("configured-counter"),
    ).not.toBeInTheDocument();
  });
});
