import { describe, expect, it } from "vitest";
import {
  parseImageProcessorConfig,
  parseImageProviderConfig,
  parseImageRuntimeConfig,
} from "../../server/utils/image/provider-config.ts";

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
        processor: "test-processor",
        timeoutMs: 120000,
        maxRetries: 1,
      }),
    ).toEqual({
      id: "openai",
      type: "openai-images",
      enabled: undefined,
      processor: "test-processor",
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
      processor: undefined,
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
        processor: "test-processor",
        models: ["test-image"],
      }),
    ).toEqual({
      id: undefined,
      type: "test",
      enabled: false,
      processor: "test-processor",
      models: ["test-image"],
    });
  });
});

describe("parseImageProcessorConfig", () => {
  it("parses testprocessor configs", () => {
    expect(
      parseImageProcessorConfig({
        id: "test-processor",
        type: "testprocessor",
        promptPrefix: "[in] ",
        revisedPromptPrefix: "[out] ",
        outputMimeType: "image/webp",
      }),
    ).toEqual({
      id: "test-processor",
      type: "testprocessor",
      enabled: undefined,
      promptPrefix: "[in] ",
      revisedPromptPrefix: "[out] ",
      outputMimeType: "image/webp",
    });
  });

  it("rejects unknown processor configs", () => {
    expect(() =>
      parseImageProcessorConfig({
        id: "unknown",
        type: "unknown",
      }),
    ).toThrow("processor config type");
  });
});

describe("parseImageRuntimeConfig", () => {
  it("supports the new providers/processors runtime config object", () => {
    expect(
      parseImageRuntimeConfig({
        processors: [
          {
            id: "test-processor",
            type: "testprocessor",
            promptPrefix: "[in] ",
          },
        ],
        providers: [
          {
            type: "test",
            processor: "test-processor",
            models: ["test-image"],
          },
        ],
      }),
    ).toEqual({
      processors: [
        {
          id: "test-processor",
          type: "testprocessor",
          enabled: undefined,
          promptPrefix: "[in] ",
          revisedPromptPrefix: undefined,
          outputMimeType: undefined,
        },
      ],
      providers: [
        {
          id: undefined,
          type: "test",
          enabled: undefined,
          processor: "test-processor",
          models: ["test-image"],
        },
      ],
    });
  });

  it("keeps legacy provider array configs working", () => {
    expect(
      parseImageRuntimeConfig([
        {
          type: "test",
          models: ["test-image"],
        },
      ]),
    ).toEqual({
      processors: [],
      providers: [
        {
          id: undefined,
          type: "test",
          enabled: undefined,
          processor: undefined,
          models: ["test-image"],
        },
      ],
    });
  });
});
