import { defineHandler } from "nitro";
import { getOpenAICorsHeaders } from "../../utils/openai-image/cors.ts";

export default defineHandler((event) => {
  return new Response(null, {
    status: 204,
    headers: getOpenAICorsHeaders(event.req),
  });
});
