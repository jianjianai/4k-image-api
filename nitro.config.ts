import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
  routeRules: {
    "/v1/**": {
      cors: true,
    },
  },
});
