const defaultAllowedHeaders =
  "authorization,content-type,accept,cache-control,pragma";

export const getOpenAICorsHeaders = (request: Request): HeadersInit => {
  const origin = request.headers.get("origin") ?? "*";
  const requestedHeaders = request.headers.get("access-control-request-headers");
  const headers: Record<string, string> = {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": requestedHeaders ?? defaultAllowedHeaders,
    "access-control-max-age": "86400",
    vary: "Origin",
  };

  if (origin !== "*") {
    headers["access-control-allow-credentials"] = "true";
  }

  return headers;
};
