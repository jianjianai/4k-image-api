import { describe, expect, it } from "vitest";
import {
  OpenAIClientError,
  toOpenAIErrorResponse,
} from "../../server/utils/openai-image/errors.ts";

describe("toOpenAIErrorResponse", () => {
  it("serializes OpenAI client errors with status, code, param, and reason", async () => {
    const response = toOpenAIErrorResponse(
      new OpenAIClientError("Request body must be valid JSON.", {
        code: "invalid_json",
        param: "body",
        status: 422,
      }),
      {
        "x-test": "1",
      },
    );

    expect(response.status).toBe(422);
    expect(response.headers.get("x-test")).toBe("1");

    const payload = await response.json();

    expect(payload.error).toEqual({
      message: "Request body must be valid JSON.",
      type: "invalid_request_error",
      param: "body",
      code: "invalid_json",
      reason: "Request body must be valid JSON.",
    });
  });

  it("normalizes unknown errors into OpenAI-style client errors", async () => {
    const response = toOpenAIErrorResponse(new Error("Provider failed."));

    expect(response.status).toBe(400);

    const payload = await response.json();

    expect(payload.error).toEqual({
      message: "Provider failed.",
      type: "invalid_request_error",
      param: null,
      code: "invalid_request",
      reason: "Provider failed.",
    });
  });
});
