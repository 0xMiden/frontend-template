import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { provider, adapter } = vi.hoisted(() => ({
  provider: vi.fn(),
  adapter: vi.fn(),
}));
vi.mock("@miden-sdk/miden-wallet-adapter-react", () => ({
  WalletProvider: ({ children, ...props }: { children: ReactNode }) => {
    provider(props);
    return children;
  },
}));
vi.mock("@miden-sdk/miden-wallet-adapter-miden", () => ({
  MidenWalletAdapter: class {
    constructor(options: unknown) {
      adapter(options);
    }
  },
}));
vi.mock("../MiniApp", () => ({ MiniApp: () => <div>Wallet managed app</div> }));
import { WalletRoot } from "../WalletRoot";

describe("mini-app provider boundary", () => {
  it("uses a stable wallet adapter, explicit Testnet and zero private-data permissions", () => {
    const { rerender } = render(<WalletRoot />);
    rerender(<WalletRoot />);
    expect(screen.getByText("Wallet managed app")).toBeVisible();
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[0][0]).toMatchObject({
      network: "testnet",
      allowedPrivateData: 0,
      privateDataPermission: "UPON_REQUEST",
      autoConnect: false,
      localStorageKey: "miden-mini-app:wallet",
    });
    expect(provider.mock.calls[0][0].wallets).toBe(
      provider.mock.calls[1][0].wallets,
    );
  });
});
