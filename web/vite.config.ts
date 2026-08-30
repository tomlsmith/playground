import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: false,
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2022",
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "editor",
              test: /node_modules[\\/](?:@codemirror|@lezer|@marijn|codemirror|crelt|style-mod|w3c-keyname)[\\/]/u,
            },
            {
              name: "react",
              test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/u,
            },
          ],
        },
      },
    },
  },
  server: {
    port: 4173,
  },
});
