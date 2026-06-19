import type { OpenAIImageRequest } from "./types.ts";
import { OpenAIClientError } from "./errors.ts";

export const readOpenAIRequest = async (
  request: Request,
): Promise<OpenAIImageRequest> => {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    try {
      return formDataToObject(await request.formData());
    } catch (error) {
      throw new OpenAIClientError("Invalid multipart form data.", {
        code: "invalid_request",
      });
    }
  }

  if (contentType.includes("application/json")) {
    try {
      return (await request.json()) as OpenAIImageRequest;
    } catch (error) {
      throw new OpenAIClientError("Request body must be valid JSON.", {
        code: "invalid_json",
      });
    }
  }

  throw new OpenAIClientError(
    "Content-Type must be application/json or multipart/form-data.",
    {
      code: "invalid_content_type",
    },
  );
};

const formDataToObject = (formData: FormData): OpenAIImageRequest => {
  const request: OpenAIImageRequest = {};

  for (const [key, value] of formData.entries()) {
    const normalizedKey = key.endsWith("[]") ? key.slice(0, -2) : key;
    const existing = request[normalizedKey];

    if (existing === undefined) {
      request[normalizedKey] = value;
      continue;
    }

    if (Array.isArray(existing)) {
      existing.push(value);
      continue;
    }

    request[normalizedKey] = [existing, value];
  }

  return request;
};
