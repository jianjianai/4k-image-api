const fallbackAllowedHeaders = [
  "authorization",
  "content-type",
  "accept",
  "cache-control",
  "pragma",
].join(", ");

export const getCorsHeaders = (request: Request): Headers => {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  const requestHeaders = request.headers.get("access-control-request-headers");

  headers.set("access-control-allow-origin", origin ?? "*");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set(
    "access-control-allow-headers",
    requestHeaders ?? fallbackAllowedHeaders,
  );
  headers.set("access-control-allow-credentials", "true");
  headers.set("access-control-max-age", "86400");
  headers.set("vary", "Origin");

  return headers;
};
