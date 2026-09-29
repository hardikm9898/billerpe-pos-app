import { existsSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// Plain Vite SPA build (no TanStack Start / SSR): Capacitor ships the static
// `dist/` folder inside the Android app, so there is no server to render on.
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
      routeFileIgnorePrefix: "-",
      quoteStyle: "double",
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  // Push notifications only when the Firebase config is in the Android
  // project: registering without it would crash the app (src/lib/pos/push.ts).
  define: {
    __PUSH_ENABLED__: JSON.stringify(existsSync("android/app/google-services.json")),
  },
  server: { port: 5190, strictPort: false },
  build: { outDir: "dist", sourcemap: false, target: "es2020" },
});
