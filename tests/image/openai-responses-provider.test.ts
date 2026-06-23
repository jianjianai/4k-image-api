import { describe, expect, it, vi } from "vitest";
import { createOpenAIResponsesImageProvider } from "../../server/utils/image/providers/openai-responses.ts";
import type { ImageInput } from "../../server/utils/image.ts";

const pngBase64 = Buffer.from([1, 2, 3]).toString("base64");

describe("createOpenAIResponsesImageProvider", () => {
  it("invokes SDK responses image generation and maps image_generation_call output", async () => {
    const create = vi.fn().mockResolvedValue(
      streamOf([
        {
          type: "response.completed",
          response: {
            output: [
              {
                type: "message",
              },
              {
                type: "image_generation_call",
                result: pngBase64,
                status: "completed",
              },
            ],
            usage: {
              input_tokens: 4,
              output_tokens: 5,
              total_tokens: 9,
            },
          },
        },
      ]),
    );
    const provider = createOpenAIResponsesImageProvider(config(), {
      images: { generate: vi.fn() },
      responses: { create },
    } as never);

    expect(provider.actionSupports).toEqual(["generate", "edit"]);

    const input = {
      ...baseInput(),
      size: "1024x1536",
      quality: "auto",
      format: "png",
      background: "opaque",
      options: {
        tool: {
          moderation: "auto",
          output_compression: 100,
          partial_images: 2,
        },
      },
    };
    const output = await provider.invoke(input);

    expect(create).toHaveBeenCalledWith({
      model: "gpt-image-1",
      input: "draw a cat",
      tools: [
        {
          type: "image_generation",
          action: "generate",
          model: "gpt-image-1",
          size: "1024x1536",
          quality: "auto",
          output_format: "png",
          background: "opaque",
          moderation: "auto",
          output_compression: 100,
          partial_images: 2,
        },
      ],
      tool_choice: "required",
      stream: true,
    });
    expect(output.images).toEqual([
      {
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "image/png",
      },
    ]);
    expect(output.usage).toEqual({
      inputTokens: 4,
      outputTokens: 5,
      totalTokens: 9,
    });
  });

  it("converts edit images to Responses input images and image masks", async () => {
    const create = vi.fn().mockResolvedValue(
      streamOf([
        {
          type: "response.completed",
          response: {
            output: [
              {
                type: "image_generation_call",
                result: pngBase64,
                status: "completed",
              },
            ],
          },
        },
      ]),
    );
    const provider = createOpenAIResponsesImageProvider(config(), {
      images: { generate: vi.fn() },
      responses: { create },
    } as never);

    await provider.invoke({
      ...baseInput(),
      action: "edit",
      images: [imageAsset()],
      mask: imageAsset(),
      options: {
        inputFidelity: "low",
      },
    });

    expect(create).toHaveBeenCalledWith({
      model: "gpt-image-1",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "draw a cat",
            },
            {
              type: "input_image",
              image_url: "data:image/png;base64,AQID",
              detail: "auto",
            },
          ],
        },
      ],
      tools: [
        {
          type: "image_generation",
          action: "edit",
          model: "gpt-image-1",
          size: undefined,
          quality: undefined,
          output_format: undefined,
          background: undefined,
          input_fidelity: "low",
          input_image_mask: {
            image_url: "data:image/png;base64,AQID",
          },
          moderation: undefined,
          output_compression: undefined,
          partial_images: undefined,
        },
      ],
      tool_choice: "required",
      stream: true,
    });
  });
});

async function* streamOf(events: Record<string, unknown>[]) {
  for (const event of events) {
    yield event;
  }
}

const config = () => ({
  id: "openai-responses",
  type: "openai-responses" as const,
  apiKey: "sk-test",
  models: ["gpt-image-1"],
});

const baseInput = (): ImageInput => ({
  action: "generate",
  prompt: "draw a cat",
  model: "gpt-image-1",
});

const imageAsset = () => ({
  data: new Uint8Array([1, 2, 3]),
  mimeType: "image/png" as const,
});
