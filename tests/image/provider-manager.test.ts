import { describe, expect, it } from "vitest";
import {
  ImageProviderNotFoundError,
  imageProviderManager,
} from "../../server/utils/image/provider-manager.ts";
import type { ImageInput, ImageProvider } from "../../server/utils/image.ts";

describe("image provider manager", () => {
  it("routes providers by model and supports predicate", async () => {
    imageProviderManager.add(provider("routing-test-generations", "images.generations"));
    imageProviderManager.add(provider("routing-test-responses", "responses"));

    try {
      await expect(
        imageProviderManager.invoke(input("images.generations")),
      ).resolves.toMatchObject({
        raw: "routing-test-generations",
      });
      await expect(
        imageProviderManager.invoke(input("responses")),
      ).resolves.toMatchObject({
        raw: "routing-test-responses",
      });
    } finally {
      imageProviderManager.remove("routing-test-generations");
      imageProviderManager.remove("routing-test-responses");
    }
  });

  it("throws model not found when model matches but endpoint is unsupported", async () => {
    imageProviderManager.add(provider("routing-test-generations", "images.generations"));

    try {
      await expect(
        imageProviderManager.invoke(input("responses")),
      ).rejects.toBeInstanceOf(ImageProviderNotFoundError);
    } finally {
      imageProviderManager.remove("routing-test-generations");
    }
  });
});

const provider = (
  id: string,
  endpoint: ImageInput["source"]["endpoint"],
): ImageProvider => ({
  id,
  models: ["routing-test-model"],
  supports: (input) => input.source.endpoint === endpoint,
  invoke: async () => ({
    images: [],
    raw: id,
  }),
});

const input = (endpoint: ImageInput["source"]["endpoint"]): ImageInput => ({
  action: "generate",
  model: "routing-test-model",
  source: {
    protocol: "openai",
    endpoint,
    raw: {},
  },
});
