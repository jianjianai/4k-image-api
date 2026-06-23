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

export type ImageProcessorConfig =
  | TestImageProcessorConfig
  | LocalSharpLanczos3SizeAdapterConfig
  | AliyunSuperResolutionSizeAdapterConfig
  | ModelslabRealEsrganSizeAdapterConfig;

export type TestImageProcessorConfig = {
  id: string;
  type: "testprocessor";
  enabled?: boolean;
  promptPrefix?: string;
  revisedPromptPrefix?: string;
  outputMimeType?: "image/png" | "image/jpeg" | "image/webp";
};

export type LocalSharpLanczos3SizeAdapterConfig = {
  id: string;
  type: "size-adapter:local:sharp-lanczos3";
  enabled?: boolean;
  maxWidth: number;
  maxHeight: number;
  maxPixels?: number;
  fit?: "contain" | "cover" | "fill" | "inside" | "outside";
};

export type ModelslabRealEsrganSizeAdapterConfig = {
  id: string;
  type: "size-adapter:modelslab:real-esrgan";
  enabled?: boolean;
  maxWidth: number;
  maxHeight: number;
  maxPixels?: number;
  apiKey: string;
  modelId?: ModelslabRealEsrganModelId;
  modelByScale?: Partial<Record<"2" | "3" | "4", ModelslabRealEsrganModelId>>;
  scale?: number;
  faceEnhance?: boolean;
  baseURL?: string;
};

export type AliyunSuperResolutionSizeAdapterConfig = {
  id: string;
  type: "size-adapter:aliyun:super-resolution";
  enabled?: boolean;
  maxWidth: number;
  maxHeight: number;
  maxPixels?: number;
  accessKeyId: string;
  accessKeySecret: string;
  regionId?: string;
  endpoint?: string;
  scale?: 1 | 2 | 3 | 4;
  mode?: string;
  outputFormat?: "png" | "jpg" | "bmp";
  outputQuality?: number;
  timeoutMs?: number;
};

export type ModelslabRealEsrganModelId =
  | "RealESRGAN_x4plus"
  | "RealESRGAN_x4plus_anime_6B"
  | "RealESRGAN_x2plus"
  | "realesr-general-x4v3"
  | "ultra_resolution";

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

  if (value.type === "size-adapter:local:sharp-lanczos3") {
    return parseLocalSharpLanczos3SizeAdapterConfig(value);
  }

  if (value.type === "size-adapter:aliyun:super-resolution") {
    return parseAliyunSuperResolutionSizeAdapterConfig(value);
  }

  if (value.type === "size-adapter:modelslab:real-esrgan") {
    return parseModelslabRealEsrganSizeAdapterConfig(value);
  }

  throw new Error(
    "Image processor config type must be 'testprocessor', 'size-adapter:local:sharp-lanczos3', 'size-adapter:aliyun:super-resolution', or 'size-adapter:modelslab:real-esrgan'.",
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

const parseLocalSharpLanczos3SizeAdapterConfig = (
  value: Record<string, unknown>,
): LocalSharpLanczos3SizeAdapterConfig => ({
  id: getRequiredString(value.id, "id"),
  type: "size-adapter:local:sharp-lanczos3",
  enabled: getOptionalBoolean(value.enabled, "enabled"),
  maxWidth: getRequiredNumber(value.maxWidth, "maxWidth"),
  maxHeight: getRequiredNumber(value.maxHeight, "maxHeight"),
  maxPixels: getOptionalNumber(value.maxPixels, "maxPixels"),
  fit: getOptionalSharpFit(value.fit, "fit"),
});

const parseModelslabRealEsrganSizeAdapterConfig = (
  value: Record<string, unknown>,
): ModelslabRealEsrganSizeAdapterConfig => ({
  id: getRequiredString(value.id, "id"),
  type: "size-adapter:modelslab:real-esrgan",
  enabled: getOptionalBoolean(value.enabled, "enabled"),
  maxWidth: getRequiredNumber(value.maxWidth, "maxWidth"),
  maxHeight: getRequiredNumber(value.maxHeight, "maxHeight"),
  maxPixels: getOptionalNumber(value.maxPixels, "maxPixels"),
  apiKey: getRequiredString(value.apiKey, "apiKey"),
  modelId: getOptionalModelslabModelId(value.modelId, "modelId"),
  modelByScale: getOptionalModelslabModelByScale(value.modelByScale, "modelByScale"),
  scale: getOptionalNumber(value.scale, "scale"),
  faceEnhance: getOptionalBoolean(value.faceEnhance, "faceEnhance"),
  baseURL: getOptionalString(value.baseURL, "baseURL"),
});

const parseAliyunSuperResolutionSizeAdapterConfig = (
  value: Record<string, unknown>,
): AliyunSuperResolutionSizeAdapterConfig => ({
  id: getRequiredString(value.id, "id"),
  type: "size-adapter:aliyun:super-resolution",
  enabled: getOptionalBoolean(value.enabled, "enabled"),
  maxWidth: getRequiredNumber(value.maxWidth, "maxWidth"),
  maxHeight: getRequiredNumber(value.maxHeight, "maxHeight"),
  maxPixels: getOptionalNumber(value.maxPixels, "maxPixels"),
  accessKeyId: getRequiredString(value.accessKeyId, "accessKeyId"),
  accessKeySecret: getRequiredString(value.accessKeySecret, "accessKeySecret"),
  regionId: getOptionalString(value.regionId, "regionId"),
  endpoint: getOptionalString(value.endpoint, "endpoint"),
  scale: getOptionalAliyunSuperResolutionScale(value.scale, "scale"),
  mode: getOptionalString(value.mode, "mode"),
  outputFormat: getOptionalAliyunSuperResolutionOutputFormat(
    value.outputFormat,
    "outputFormat",
  ),
  outputQuality: getOptionalNumber(value.outputQuality, "outputQuality"),
  timeoutMs: getOptionalNumber(value.timeoutMs, "timeoutMs"),
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

const getRequiredNumber = (value: unknown, name: string): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  throw new Error(`Image processor config '${name}' must be a finite number.`);
};

const getOptionalAliyunSuperResolutionScale = (
  value: unknown,
  name: string,
): 1 | 2 | 3 | 4 | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === 1 || value === 2 || value === 3 || value === 4) {
    return value;
  }

  throw new Error(`Image processor config '${name}' must be 1, 2, 3, or 4.`);
};

const getOptionalAliyunSuperResolutionOutputFormat = (
  value: unknown,
  name: string,
): "png" | "jpg" | "bmp" | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === "png" || value === "jpg" || value === "bmp") {
    return value;
  }

  throw new Error(
    `Image processor config '${name}' must be 'png', 'jpg', or 'bmp'.`,
  );
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

const getOptionalSharpFit = (
  value: unknown,
  name: string,
): "contain" | "cover" | "fill" | "inside" | "outside" | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (
    value === "contain" ||
    value === "cover" ||
    value === "fill" ||
    value === "inside" ||
    value === "outside"
  ) {
    return value;
  }

  throw new Error(
    `Image processor config '${name}' must be 'contain', 'cover', 'fill', 'inside', or 'outside'.`,
  );
};

const getOptionalModelslabModelId = (
  value: unknown,
  name: string,
): ModelslabRealEsrganModelId | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (
    value === "RealESRGAN_x4plus" ||
    value === "RealESRGAN_x4plus_anime_6B" ||
    value === "RealESRGAN_x2plus" ||
    value === "realesr-general-x4v3" ||
    value === "ultra_resolution"
  ) {
    return value;
  }

  throw new Error(
    `Image processor config '${name}' must be a supported Modelslab RealESRGAN model id.`,
  );
};

const getOptionalModelslabModelByScale = (
  value: unknown,
  name: string,
): Partial<Record<"2" | "3" | "4", ModelslabRealEsrganModelId>> | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isObject(value)) {
    throw new Error(`Image processor config '${name}' must be an object.`);
  }

  const modelByScale: Partial<
    Record<"2" | "3" | "4", ModelslabRealEsrganModelId>
  > = {};

  for (const key of Object.keys(value)) {
    if (key !== "2" && key !== "3" && key !== "4") {
      throw new Error(
        `Image processor config '${name}' keys must be '2', '3', or '4'.`,
      );
    }

    modelByScale[key] = getRequiredModelslabModelId(value[key], `${name}.${key}`);
  }

  return modelByScale;
};

const getRequiredModelslabModelId = (
  value: unknown,
  name: string,
): ModelslabRealEsrganModelId => {
  const modelId = getOptionalModelslabModelId(value, name);

  if (modelId !== undefined) {
    return modelId;
  }

  throw new Error(
    `Image processor config '${name}' must be a supported Modelslab RealESRGAN model id.`,
  );
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
