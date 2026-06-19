import type { OpenAIImageRequest } from "./types.ts";

export const readOpenAIRequest = async (
  request: Request,
): Promise<OpenAIImageRequest> => {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    return formDataToObject(await request.formData());
  }

  if (contentType.includes("application/json")) {
    return (await request.json()) as OpenAIImageRequest;
  }

  return {};
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
