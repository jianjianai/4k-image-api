export type OpenAIErrorCode =
  | "invalid_request"
  | "invalid_content_type"
  | "invalid_json"
  | "invalid_image"
  | "model_required"
  | "model_not_found";

export class OpenAIClientError extends Error {
  code: OpenAIErrorCode;
  param: string | null;
  status: number;

  constructor(
    message: string,
    options: {
      code?: OpenAIErrorCode;
      param?: string | null;
      status?: number;
    } = {},
  ) {
    super(message);
    this.code = options.code ?? "invalid_request";
    this.param = options.param ?? null;
    this.status = options.status ?? 400;
  }
}

export const toOpenAIErrorResponse = (
  error: unknown,
  headers?: HeadersInit,
): Response => {
  if (error instanceof OpenAIClientError) {
    return Response.json(
      {
        error: {
          message: error.message,
          type: "invalid_request_error",
          param: error.param,
          code: error.code,
          reason: error.message,
        },
      },
      { status: error.status, headers },
    );
  }

  const message =
    error instanceof Error ? error.message : "Unexpected image generation error.";

  return Response.json(
    {
      error: {
        message,
        type: "invalid_request_error",
        param: null,
        code: "invalid_request",
        reason: message,
      },
    },
    { status: 400, headers },
  );
};
