import { defineHandler } from "nitro";
import { getCorsHeaders } from "../utils/openai-image/cors.ts";

export default defineHandler((event) => {
  if (!event.url.pathname.startsWith("/v1/")) {
    return;
  }

  if (event.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(event.req),
    });
  }

  return undefined;
});
