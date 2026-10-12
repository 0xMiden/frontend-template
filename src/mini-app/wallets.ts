import { MidenWalletAdapter } from "@miden-sdk/miden-wallet-adapter-miden";

// Browser-only entry. Stable identity avoids adapter disconnection on rerender.
export const wallets = [
  new MidenWalletAdapter({ appName: "Miden Mini-app Starter" }),
];
