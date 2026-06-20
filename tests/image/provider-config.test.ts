import { describe, expect, it } from "vitest";
import { parseImageProviderConfig } from "../../server/utils/image/provider-config.ts";

describe("parseImageProviderConfig", () => {
  it("parses OpenAI Images provider configs", () => {
    expect(
      parseImageProviderConfig({
        id: "openai",
        type: "openai-images",
        apiKey: "sk-test",
        baseURL: "https://api.openai.com/v1",
        organization: "org-test",
        project: "proj-test",
        models: ["gpt-image-1"],
        timeoutMs: 120000,
        maxRetries: 1,
      }),
    ).toEqual({
      id: "openai",
      type: "openai-images",
      enabled: undefined,
      apiKey: "sk-test",
      baseURL: "https://api.openai.com/v1",
      organization: "org-test",
      project: "proj-test",
      models: ["gpt-image-1"],
      timeoutMs: 120000,
      maxRetries: 1,
    });
  });

  it("rejects OpenAI configs without models", () => {
    expect(() =>
      parseImageProviderConfig({
        id: "openai",
        type: "openai-responses",
        apiKey: "sk-test",
        models: [],
      }),
    ).toThrow("must configure at least one model");
  });

  it("parses OpenAI variation provider configs", () => {
    expect(
      parseImageProviderConfig({
        id: "openai-variation",
        type: "openai-variation",
        apiKey: "sk-test",
        models: ["dall-e-2"],
      }),
    ).toEqual({
      id: "openai-variation",
      type: "openai-variation",
      enabled: undefined,
      apiKey: "sk-test",
      baseURL: undefined,
      organization: undefined,
      project: undefined,
      models: ["dall-e-2"],
      timeoutMs: undefined,
      maxRetries: undefined,
    });
  });

  it("rejects legacy generic OpenAI configs", () => {
    expect(() =>
      parseImageProviderConfig({
        id: "openai",
        type: "openai",
        apiKey: "sk-test",
        models: ["gpt-image-1"],
      }),
    ).toThrow("type must be");
  });

  it("parses test provider configs", () => {
    expect(
      parseImageProviderConfig({
        type: "test",
        enabled: false,
        models: ["test-image"],
      }),
    ).toEqual({
      id: undefined,
      type: "test",
      enabled: false,
      models: ["test-image"],
    });
  });
});
