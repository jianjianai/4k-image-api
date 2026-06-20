import { describe, expect, it } from "vitest";
import { createTestImageProcessor } from "../../server/utils/image/processors/testprocessor.ts";
import type { ImageInput, ImageOutput } from "../../server/utils/image.ts";

describe("createTestImageProcessor", () => {
  it("changes ImageInput and ImageOutput according to config", async () => {
    const processor = createTestImageProcessor({
      id: "test-processor",
      type: "testprocessor",
      promptPrefix: "[in] ",
      revisedPromptPrefix: "[out] ",
      outputMimeType: "image/webp",
    });

    const input = await processor.processInput?.(baseInput(), context());
    const output = await processor.processOutput?.(
      baseOutput(),
      input ?? baseInput(),
      context(),
    );

    expect(input).toMatchObject({
      prompt: "[in] cat",
    });
    expect(output?.images).toEqual([
      {
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "image/webp",
        revisedPrompt: "[out] cat revised",
      },
    ]);
  });
});

const baseInput = (): ImageInput => ({
  action: "generate",
  model: "test-image",
  prompt: "cat",
});

const baseOutput = (): ImageOutput => ({
  images: [
    {
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
      revisedPrompt: "cat revised",
    },
  ],
});

const context = () => ({
  providerId: "test-provider",
  providerType: "test" as const,
  model: "test-image",
  action: "generate" as const,
  processorId: "test-processor",
});
