import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
  runtimeConfig: {
    apiKeys: "",
    imageProviders: "[]",
  },
});
