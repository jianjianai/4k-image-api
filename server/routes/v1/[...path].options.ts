import { defineHandler } from "nitro";

export default defineHandler((event) => {
  const origin = event.req.headers.get("origin") ?? "*";
  const requestedHeaders = event.req.headers.get(
    "access-control-request-headers",
  );

  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers":
        requestedHeaders ?? "authorization,content-type,accept,cache-control,pragma",
      "access-control-max-age": "86400",
      vary: "Origin",
    },
  });
});
