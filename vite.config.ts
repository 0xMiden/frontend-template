import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { midenVitePlugin } from "@miden-sdk/vite-plugin";

export default defineConfig({
  plugins: [react(), midenVitePlugin()],
  resolve: {
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
    alias: {
      // The wallet adapter was published under @demox-labs but imports
      // @demox-labs/miden-sdk internally. Redirect to the current package.
      "@demox-labs/miden-sdk": "@miden-sdk/miden-sdk",
    },
  },
});
