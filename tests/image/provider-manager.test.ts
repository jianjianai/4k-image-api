import { describe, expect, it } from "vitest";
import {
  ImageModelRequiredError,
  ImageProviderNotFoundError,
  imageProviderManager,
} from "../../server/utils/image/provider-manager.ts";
import {
  imageProcessorManager,
  type ImageInput,
  type ImageProcessor,
  type ImageProvider,
} from "../../server/utils/image.ts";

describe("image provider manager", () => {
  it("routes providers by model and action", async () => {
    imageProviderManager.add(
      provider("routing-test-generate", "routing-test-model", ["generate"]),
    );
    imageProviderManager.add(
      provider("routing-test-edit", "routing-test-model", ["edit"]),
    );

    try {
      await expect(imageProviderManager.invoke(input("routing-test-model", "generate")))
        .resolves.toMatchObject({
          raw: {
            id: "routing-test-generate",
          },
        });
      await expect(imageProviderManager.invoke(input("routing-test-model", "edit")))
        .resolves.toMatchObject({
          raw: {
            id: "routing-test-edit",
          },
        });
    } finally {
      imageProviderManager.remove("routing-test-generate");
      imageProviderManager.remove("routing-test-edit");
    }
  });

  it("throws model not found when no provider has the requested model", async () => {
    await expect(
      imageProviderManager.invoke(input("routing-test-missing", "generate")),
    ).rejects.toBeInstanceOf(ImageProviderNotFoundError);
  });

  it("requires an image model", async () => {
    await expect(
      imageProviderManager.invoke({
        ...input("routing-test-model-a", "generate"),
        model: undefined,
      }),
    ).rejects.toBeInstanceOf(ImageModelRequiredError);
  });

  it("runs the configured processor around provider invocation", async () => {
    imageProcessorManager.add(processor("routing-test-processor"));
    imageProviderManager.add(
      provider("routing-test-processed", "routing-test-model", ["generate"], {
        processorId: "routing-test-processor",
      }),
    );

    try {
      const output = await imageProviderManager.invoke({
        ...input("routing-test-model", "generate"),
        prompt: "cat",
      });

      expect(output.raw).toEqual({
        id: "routing-test-processed",
        prompt: "[in] cat",
      });
      expect(output.images).toEqual([
        {
          bytes: new Uint8Array([1]),
          mimeType: "image/png",
          revisedPrompt: "[out] [in] cat",
        },
      ]);
    } finally {
      imageProviderManager.remove("routing-test-processed");
      imageProcessorManager.remove("routing-test-processor");
    }
  });
});

const provider = (
  id: string,
  model: string,
  actionSupports: ImageProvider["actionSupports"],
  options: Partial<Pick<ImageProvider, "processorId">> = {},
): ImageProvider => ({
  id,
  type: "test",
  models: [model],
  actionSupports,
  processorId: options.processorId,
  invoke: async (input) => ({
    images: [
      {
        bytes: new Uint8Array([1]),
        mimeType: "image/png",
        revisedPrompt: input.prompt,
      },
    ],
    raw: {
      id,
      prompt: input.prompt,
    },
  }),
});

const processor = (id: string): ImageProcessor => ({
  id,
  type: "testprocessor",
  processInput: (input) => ({
    ...input,
    prompt: input.prompt ? `[in] ${input.prompt}` : input.prompt,
  }),
  processOutput: (output) => ({
    ...output,
    images: output.images.map((image) => ({
      ...image,
      revisedPrompt: image.revisedPrompt
        ? `[out] ${image.revisedPrompt}`
        : image.revisedPrompt,
    })),
  }),
});

const input = (model: string, action: ImageInput["action"]): ImageInput => ({
  action,
  model,
});
