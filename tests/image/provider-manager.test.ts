import { describe, expect, it } from "vitest";
import {
  ImageModelRequiredError,
  ImageProviderNotFoundError,
  imageProviderManager,
} from "../../server/utils/image/provider-manager.ts";
import type { ImageInput, ImageProvider } from "../../server/utils/image.ts";

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
          raw: "routing-test-generate",
        });
      await expect(imageProviderManager.invoke(input("routing-test-model", "edit")))
        .resolves.toMatchObject({
          raw: "routing-test-edit",
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
});

const provider = (
  id: string,
  model: string,
  actionSupports: ImageProvider["actionSupports"],
): ImageProvider => ({
  id,
  models: [model],
  actionSupports,
  invoke: async () => ({
    images: [],
    raw: id,
  }),
});

const input = (model: string, action: ImageInput["action"]): ImageInput => ({
  action,
  model,
});
