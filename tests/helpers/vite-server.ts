import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { createServer, type ViteDevServer } from "vite";

export type TestViteServer = {
  baseURL: string;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  close: () => Promise<void>;
};

export const startViteTestServer = async (
  env: Record<string, string | undefined> = {},
): Promise<TestViteServer> => {
  const restoreEnv = setEnv(env);
  const server = await createServer({
    configFile: resolve(process.cwd(), "vite.config.ts"),
    logLevel: "silent",
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
    },
  });

  await server.listen(0);

  const port = getServerPort(server);
  const baseURL = `http://127.0.0.1:${port}`;

  return {
    baseURL,
    fetch: (path, init) => fetch(new URL(path, baseURL), init),
    close: async () => {
      await server.close();
      restoreEnv();
    },
  };
};

const setEnv = (env: Record<string, string | undefined>): (() => void) => {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);

    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }

  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
        continue;
      }

      process.env[key] = value;
    }
  };
};

const getServerPort = (server: ViteDevServer): number => {
  const address = server.httpServer?.address();

  if (!address || typeof address === "string") {
    throw new Error("Vite test server did not expose a TCP address.");
  }

  return (address as AddressInfo).port;
};
