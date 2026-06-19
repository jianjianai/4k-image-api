import { definePlugin } from "nitro";
import { getCorsHeaders } from "../utils/openai-image/cors.ts";

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("response", (response, event) => {
    const { pathname } = new URL(event.req.url);

    if (!pathname.startsWith("/v1/")) {
      return;
    }

    for (const [key, value] of getCorsHeaders(event.req)) {
      response.headers.set(key, value);
    }
  });
});
