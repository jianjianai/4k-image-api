import { useRuntimeConfig } from "nitro/runtime-config";

export type ImageProviderConfig =
  | OpenAIImagesProviderConfig
  | OpenAIVariationProviderConfig
  | OpenAIResponsesProviderConfig
  | TestImageProviderConfig;

export type OpenAIProviderConfig =
  | OpenAIImagesProviderConfig
  | OpenAIVariationProviderConfig
  | OpenAIResponsesProviderConfig;

export type OpenAIProviderConfigBase = {
  id: string;
  enabled?: boolean;
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
  models?: string[];
};

export const readImageProviderConfigs = (): ImageProviderConfig[] => {
  const raw = useRuntimeConfig().imageProviders;

  if (typeof raw !== "string" || raw.trim().length === 0) {
    return [];
  }

  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("Runtime config imageProviders must be a JSON array.");
  }

  return parsed.map(parseImageProviderConfig);
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
  models:
    value.models === undefined ? undefined : getStringArray(value.models, "models"),
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

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
