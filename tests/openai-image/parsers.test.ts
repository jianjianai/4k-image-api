import { describe, expect, it } from "vitest";
import { parseImageEditRequest } from "../../server/utils/openai-image/parsers/edits.ts";
import { parseImageGenerationRequest } from "../../server/utils/openai-image/parsers/generations.ts";
import { parseResponsesImageRequest } from "../../server/utils/openai-image/parsers/responses.ts";
import { parseImageVariationRequest } from "../../server/utils/openai-image/parsers/variations.ts";

const base64Image = Buffer.from("image").toString("base64");

describe("OpenAI image parsers", () => {
  it("parses image generation requests directly", async () => {
    const input = await parseImageGenerationRequest({
      prompt: "paint a mountain",
      model: "gpt-image-1",
      n: "2",
      size: "1024x1024",
      response_format: "url",
    });

    expect(input).toMatchObject({
      action: "generate",
      prompt: "paint a mountain",
      model: "gpt-image-1",
      n: 2,
      size: "1024x1024",
      responseFormat: "url",
    });
  });

  it("parses image edit requests directly", async () => {
    const input = await parseImageEditRequest({
      prompt: "replace the sky",
      image: [base64Image, base64Image],
      mask: base64Image,
      input_fidelity: "high",
    });

    expect(input.action).toBe("edit");
    expect(input.images).toHaveLength(2);
    expect(input.mask).toBeDefined();
    expect(input.options?.inputFidelity).toBe("high");
  });

  it("parses image variation requests directly", async () => {
    const input = await parseImageVariationRequest({
      image: base64Image,
      model: "dall-e-2",
      response_format: "b64_json",
    });

    expect(input.action).toBe("generate");
    expect(input.model).toBe("dall-e-2");
    expect(input.images).toHaveLength(1);
    expect(input.responseFormat).toBe("b64_json");
  });

  it("parses responses image requests directly", async () => {
    const input = await parseResponsesImageRequest({
      input: [
        { content: [{ text: "line one" }] },
        { content: "line two" },
      ],
      tools: [
        {
          type: "image_generation",
          model: "gpt-image-1",
          size: "1024x1024",
          output_format: "webp",
        },
      ],
      stream: "true",
    });

    expect(input).toMatchObject({
      action: "generate",
      prompt: "line one\nline two",
      model: "gpt-image-1",
      size: "1024x1024",
      format: "webp",
      stream: true,
    });
  });
});
