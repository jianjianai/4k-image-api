import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { readImageConfigFile } from "../../server/utils/image/provider-config-file.ts";
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

describe("readImageConfigFile", () => {
  it("returns undefined when the JSON config file does not exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "image-config-"));

    try {
      expect(readImageConfigFile(join(dir, "missing.json"))).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads JSON config files", () => {
    const dir = mkdtempSync(join(tmpdir(), "image-config-"));
    const file = join(dir, "image-providers.config.json");

    try {
      writeFileSync(
        file,
        JSON.stringify({
          providers: [
            {
              type: "test",
              models: ["file-model"],
            },
          ],
        }),
      );

      expect(readImageConfigFile(file)).toEqual({
        providers: [
          {
            type: "test",
            models: ["file-model"],
          },
        ],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("readImageRuntimeConfig", () => {
  it("prefers JSON file config over runtime config", async () => {
    vi.resetModules();
    vi.doMock("../../server/utils/image/provider-config-file.ts", () => ({
      readImageConfigFile: () => ({
        providers: [
          {
            type: "test",
            models: ["file-model"],
          },
        ],
      }),
    }));
    vi.doMock("nitro/runtime-config", () => ({
      useRuntimeConfig: () => ({
        imageProviders: JSON.stringify({
          providers: [
            {
              type: "test",
              models: ["env-model"],
            },
          ],
        }),
      }),
    }));

    try {
      const { readImageRuntimeConfig } = await import(
        "../../server/utils/image/provider-config.ts"
      );

      expect(readImageRuntimeConfig()).toEqual({
        processors: [],
        providers: [
          {
            id: undefined,
            type: "test",
            enabled: undefined,
            processor: undefined,
            models: ["file-model"],
          },
        ],
      });
    } finally {
      vi.doUnmock("../../server/utils/image/provider-config-file.ts");
      vi.doUnmock("nitro/runtime-config");
      vi.resetModules();
    }
  });
});
