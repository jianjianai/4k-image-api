import { describe, expect, it } from "vitest";
import { formatOpenAIModelList } from "../../server/utils/openai-image/models.ts";

describe("formatOpenAIModelList", () => {
  it("deduplicates models and merges provider capabilities", () => {
    expect(
      formatOpenAIModelList([
        {
          id: "images",
          type: "openai-images",
          models: ["gpt-image-1"],
          actionSupports: ["generate", "edit"],
          invoke: async () => ({ images: [] }),
        },
        {
          id: "responses",
          type: "openai-responses",
          models: ["gpt-image-1", "gpt-image-2"],
          actionSupports: ["generate"],
          invoke: async () => ({ images: [] }),
        },
      ]),
    ).toEqual({
      object: "list",
      data: [
        {
          id: "gpt-image-1",
          object: "model",
          created: 0,
          owned_by: "openai-images",
          actions: ["generate", "edit"],
          providerIds: ["images", "responses"],
          providerTypes: ["openai-images", "openai-responses"],
        },
        {
          id: "gpt-image-2",
          object: "model",
          created: 0,
          owned_by: "openai-responses",
          actions: ["generate"],
          providerIds: ["responses"],
          providerTypes: ["openai-responses"],
        },
      ],
    });
  });
});
