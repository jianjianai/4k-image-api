import { describe, expect, it } from "vitest";
import {
  ImageModelRequiredError,
  ImageProviderNotFoundError,
  imageProviderManager,
} from "../../server/utils/image/provider-manager.ts";
import type { ImageInput, ImageProvider } from "../../server/utils/image.ts";

describe("image provider manager", () => {
  it("routes providers by model", async () => {
    imageProviderManager.add(provider("routing-test-a", "routing-test-model-a"));
    imageProviderManager.add(provider("routing-test-b", "routing-test-model-b"));

    try {
      await expect(imageProviderManager.invoke(input("routing-test-model-a")))
        .resolves.toMatchObject({
          raw: "routing-test-a",
        });
      await expect(imageProviderManager.invoke(input("routing-test-model-b")))
        .resolves.toMatchObject({
          raw: "routing-test-b",
        });
    } finally {
      imageProviderManager.remove("routing-test-a");
      imageProviderManager.remove("routing-test-b");
    }
  });

  it("throws model not found when no provider has the requested model", async () => {
    await expect(
      imageProviderManager.invoke(input("routing-test-missing")),
    ).rejects.toBeInstanceOf(ImageProviderNotFoundError);
  });

  it("requires an image model", async () => {
    await expect(
      imageProviderManager.invoke({
        ...input("routing-test-model-a"),
        model: undefined,
      }),
    ).rejects.toBeInstanceOf(ImageModelRequiredError);
  });
});

const provider = (id: string, model: string): ImageProvider => ({
  id,
  models: [model],
  invoke: async () => ({
    images: [],
    raw: id,
  }),
});

const input = (model: string): ImageInput => ({
  action: "generate",
  model,
  source: {
    protocol: "openai",
    endpoint: "images.generations",
    raw: {},
  },
});
