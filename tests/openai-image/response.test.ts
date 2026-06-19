import { describe, expect, it } from "vitest";
import type { ImageInput, ImageOutput } from "../../server/utils/image.ts";
import { toOpenAIResponse } from "../../server/utils/openai-image/response.ts";

const input: ImageInput = {
  action: "generate",
  prompt: "original prompt",
  model: "gpt-image-1",
  source: {
    protocol: "openai",
    endpoint: "responses",
    raw: {},
  },
};

describe("toOpenAIResponse", () => {
  it("writes revised_prompt when the provider returns one", () => {
    const response = toOpenAIResponse(
      imageOutput({
        revisedPrompt: "provider prompt",
      }),
      input,
    );

    expect(response.output).toMatchObject([
      {
        type: "image_generation_call",
        status: "completed",
        revised_prompt: "provider prompt",
      },
    ]);
  });

  it("does not use the input prompt as a revised_prompt fallback", () => {
    const response = toOpenAIResponse(imageOutput(), input);

    expect(response.output).toMatchObject([
      {
        type: "image_generation_call",
        status: "completed",
      },
    ]);
    expect((response.output as Array<Record<string, unknown>>)[0]).not.toHaveProperty(
      "revised_prompt",
    );
  });
});

const imageOutput = (
  image: Partial<ImageOutput["images"][number]> = {},
): ImageOutput => ({
  images: [
    {
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
      ...image,
    },
  ],
});
