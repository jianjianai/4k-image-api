import { useRuntimeConfig } from "nitro/runtime-config";
import { OpenAIClientError } from "./errors.ts";

export const assertOpenAIAPIKey = (request: Request): void => {
  const allowedKeys = getAllowedAPIKeys();

  if (allowedKeys.length === 0) {
    return;
  }

  const apiKey = getRequestAPIKey(request);

  if (apiKey && allowedKeys.includes(apiKey)) {
    return;
  }

  throw new OpenAIClientError("Invalid or missing API key.", {
    code: "invalid_api_key",
    status: 401,
  });
};

export const getAllowedAPIKeys = (): string[] => {
  const raw = useRuntimeConfig().apiKeys;

  if (typeof raw !== "string" || raw.trim().length === 0) {
    return [];
  }

  return raw
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
};

const getRequestAPIKey = (request: Request): string | undefined => {
  const apiKey = request.headers.get("x-api-key");

  if (apiKey && apiKey.trim().length > 0) {
    return apiKey.trim();
  }

  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);

  return match?.[1]?.trim();
};
