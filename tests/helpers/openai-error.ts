import { expect } from "vitest";

export const expectOpenAIError = async (
  response: Response,
  expected: {
    status: number;
    code: string;
    param: string | null;
    messageIncludes?: string;
  },
): Promise<void> => {
  expect(response.status).toBe(expected.status);
  expect(response.headers.get("content-type") ?? "").toContain("application/json");

  const payload = await response.json();
  const error = payload.error;

  expect(error).toMatchObject({
    type: "invalid_request_error",
    param: expected.param,
    code: expected.code,
  });
  expect(error.message).toEqual(expect.any(String));
  expect(error.reason).toBe(error.message);

  if (expected.messageIncludes) {
    expect(error.message).toContain(expected.messageIncludes);
  }
};
