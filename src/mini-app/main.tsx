import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WalletRoot } from "./WalletRoot";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WalletRoot />
  </StrictMode>,
);
