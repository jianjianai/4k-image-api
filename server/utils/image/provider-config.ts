import { useRuntimeConfig } from "nitro/runtime-config";
import { readImageConfigFile } from "./provider-config-file.ts";

export type ImageRuntimeConfig = {
  providers: ImageProviderConfig[];
  processors: ImageProcessorConfig[];
};

export type ImageProviderConfig =
  | OpenAIImagesProviderConfig
  | OpenAIVariationProviderConfig
  | OpenAIResponsesProviderConfig
  | TestImageProviderConfig;

export type ImageProcessorConfig = TestImageProcessorConfig;

export type TestImageProcessorConfig = {
  id: string;
  type: "testprocessor";
  enabled?: boolean;
  promptPrefix?: string;
  revisedPromptPrefix?: string;
  outputMimeType?: "image/png" | "image/jpeg" | "image/webp";
};

export type OpenAIProviderConfig =
  | OpenAIImagesProviderConfig
  | OpenAIVariationProviderConfig
  | OpenAIResponsesProviderConfig;

export type OpenAIProviderConfigBase = {
  id: string;
  enabled?: boolean;
  processor?: string;
  apiKey: string;
  baseURL?: string;
  organization?: string;
  project?: string;
  models: string[];
  timeoutMs?: number;
  maxRetries?: number;
};

export type OpenAIImagesProviderConfig = OpenAIProviderConfigBase & {
  type: "openai-images";
};

export type OpenAIVariationProviderConfig = OpenAIProviderConfigBase & {
  type: "openai-variation";
};

export type OpenAIResponsesProviderConfig = OpenAIProviderConfigBase & {
  type: "openai-responses";
};

export type TestImageProviderConfig = {
  id?: string;
  type: "test";
  enabled?: boolean;
  processor?: string;
  models?: string[];
};

export const readImageRuntimeConfig = (): ImageRuntimeConfig => {
  const fileConfig = readImageConfigFile();

  if (fileConfig !== undefined) {
    return parseImageRuntimeConfig(fileConfig);
  }

  const raw = useRuntimeConfig().imageProviders;

  if (typeof raw !== "string" || raw.trim().length === 0) {
    return {
      providers: [],
      processors: [],
    };
  }

  const parsed = JSON.parse(raw) as unknown;

  return parseImageRuntimeConfig(parsed);
};

export const parseImageRuntimeConfig = (parsed: unknown): ImageRuntimeConfig => {
  if (Array.isArray(parsed)) {
    return {
      providers: parsed.map(parseImageProviderConfig),
      processors: [],
    };
  }

  if (!isObject(parsed)) {
    throw new Error(
      "Runtime config imageProviders must be a JSON array or object.",
    );
  }

  if (!Array.isArray(parsed.providers)) {
    throw new Error("Runtime config imageProviders.providers must be a JSON array.");
  }

  return {
    providers: parsed.providers.map(parseImageProviderConfig),
    processors:
      parsed.processors === undefined
        ? []
        : parseImageProcessorConfigList(parsed.processors),
  };
};

export const readImageProviderConfigs = (): ImageProviderConfig[] =>
  readImageRuntimeConfig().providers;

const parseImageProcessorConfigList = (
  value: unknown,
): ImageProcessorConfig[] => {
  if (!Array.isArray(value)) {
    throw new Error("Runtime config imageProviders.processors must be a JSON array.");
  }

  return value.map(parseImageProcessorConfig);
};

export const parseImageProviderConfig = (
  value: unknown,
): ImageProviderConfig => {
  if (!isObject(value)) {
    throw new Error("Image provider config must be an object.");
  }

  if (
    value.type === "openai-images" ||
    value.type === "openai-variation" ||
    value.type === "openai-responses"
  ) {
    return parseOpenAIProviderConfig(value, value.type);
  }

  if (value.type === "test") {
    return parseTestImageProviderConfig(value);
  }

  throw new Error(
    "Image provider config type must be 'openai-images', 'openai-variation', 'openai-responses', or 'test'.",
  );
};

export const parseImageProcessorConfig = (
  value: unknown,
): ImageProcessorConfig => {
  if (!isObject(value)) {
    throw new Error("Image processor config must be an object.");
  }

  if (value.type === "testprocessor") {
    return parseTestImageProcessorConfig(value);
  }

  throw new Error("Image processor config type must be 'testprocessor'.");
};

const parseOpenAIProviderConfig = (
  value: Record<string, unknown>,
  type: OpenAIProviderConfig["type"],
): OpenAIProviderConfig => {
  const id = getRequiredString(value.id, "id");
  const apiKey = getRequiredString(value.apiKey, "apiKey");
  const models = getStringArray(value.models, "models");

  if (models.length === 0) {
    throw new Error(`OpenAI image provider '${id}' must configure at least one model.`);
  }

  return {
    id,
    type,
    apiKey,
    models,
    enabled: getOptionalBoolean(value.enabled, "enabled"),
    processor: getOptionalString(value.processor, "processor"),
    baseURL: getOptionalString(value.baseURL, "baseURL"),
    organization: getOptionalString(value.organization, "organization"),
    project: getOptionalString(value.project, "project"),
    timeoutMs: getOptionalNumber(value.timeoutMs, "timeoutMs"),
    maxRetries: getOptionalNumber(value.maxRetries, "maxRetries"),
  };
};

const parseTestImageProviderConfig = (
  value: Record<string, unknown>,
): TestImageProviderConfig => ({
  id: getOptionalString(value.id, "id"),
  type: "test",
  enabled: getOptionalBoolean(value.enabled, "enabled"),
  processor: getOptionalString(value.processor, "processor"),
  models:
    value.models === undefined ? undefined : getStringArray(value.models, "models"),
});

const parseTestImageProcessorConfig = (
  value: Record<string, unknown>,
): TestImageProcessorConfig => ({
  id: getRequiredString(value.id, "id"),
  type: "testprocessor",
  enabled: getOptionalBoolean(value.enabled, "enabled"),
  promptPrefix: getOptionalString(value.promptPrefix, "promptPrefix"),
  revisedPromptPrefix: getOptionalString(
    value.revisedPromptPrefix,
    "revisedPromptPrefix",
  ),
  outputMimeType: getOptionalImageMimeType(value.outputMimeType, "outputMimeType"),
});

const getRequiredString = (value: unknown, name: string): string => {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  throw new Error(`Image provider config '${name}' must be a non-empty string.`);
};

const getOptionalString = (
  value: unknown,
  name: string,
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  throw new Error(`Image provider config '${name}' must be a non-empty string.`);
};

const getOptionalBoolean = (
  value: unknown,
  name: string,
): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  throw new Error(`Image provider config '${name}' must be a boolean.`);
};

const getOptionalNumber = (
  value: unknown,
  name: string,
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  throw new Error(`Image provider config '${name}' must be a finite number.`);
};

const getStringArray = (value: unknown, name: string): string[] => {
  if (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" && item.length > 0)
  ) {
    return [...value];
  }

  throw new Error(`Image provider config '${name}' must be a string array.`);
};

const getOptionalImageMimeType = (
  value: unknown,
  name: string,
): "image/png" | "image/jpeg" | "image/webp" | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === "image/png" || value === "image/jpeg" || value === "image/webp") {
    return value;
  }

  throw new Error(
    `Image processor config '${name}' must be 'image/png', 'image/jpeg', or 'image/webp'.`,
  );
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
