import { definePlugin } from "nitro";
import { imageProcessorManager, imageProviderManager } from "../utils/image.ts";
import { imageLog } from "../utils/image/logger.ts";
import { readImageRuntimeConfig } from "../utils/image/provider-config.ts";
import { createOpenAIImageGenerationProvider } from "../utils/image/providers/openai-generations.ts";
import { createOpenAIImageVariationProvider } from "../utils/image/providers/openai-variation.ts";
import { createOpenAIResponsesImageProvider } from "../utils/image/providers/openai-responses.ts";
import { createTestImageProvider, testImageProvider } from "../utils/image/providers/test.ts";
import { createAliyunSuperResolutionSizeAdapter } from "../utils/image/processors/size-adapter-aliyun-super-resolution.ts";
import { createLocalSharpLanczos3SizeAdapter } from "../utils/image/processors/size-adapter-local-sharp-lanczos3.ts";
import { createModelslabRealEsrganSizeAdapter } from "../utils/image/processors/size-adapter-modelslab-real-esrgan.ts";
import { createTestImageProcessor } from "../utils/image/processors/testprocessor.ts";

export default definePlugin(() => {
  const config = readImageRuntimeConfig();

  imageLog("image runtime config loaded", {
    processorCount: config.processors.length,
    providerCount: config.providers.length,
  });

  for (const processorConfig of config.processors) {
    if (processorConfig.enabled === false) {
      imageLog("processor skipped", {
        processorId: processorConfig.id,
        processorType: processorConfig.type,
        reason: "disabled",
      });
      continue;
    }

    if (processorConfig.type === "testprocessor") {
      imageProcessorManager.add(createTestImageProcessor(processorConfig));
      imageLog("processor registered", {
        processorId: processorConfig.id,
        processorType: processorConfig.type,
      });
      continue;
    }

    if (processorConfig.type === "size-adapter:local:sharp-lanczos3") {
      imageProcessorManager.add(createLocalSharpLanczos3SizeAdapter(processorConfig));
      imageLog("processor registered", {
        processorId: processorConfig.id,
        processorType: processorConfig.type,
        maxWidth: processorConfig.maxWidth,
        maxHeight: processorConfig.maxHeight,
        maxPixels: processorConfig.maxPixels,
      });
      continue;
    }

    if (processorConfig.type === "size-adapter:aliyun:super-resolution") {
      imageProcessorManager.add(createAliyunSuperResolutionSizeAdapter(processorConfig));
      imageLog("processor registered", {
        processorId: processorConfig.id,
        processorType: processorConfig.type,
        maxWidth: processorConfig.maxWidth,
        maxHeight: processorConfig.maxHeight,
        maxPixels: processorConfig.maxPixels,
        regionId: processorConfig.regionId,
        endpoint: processorConfig.endpoint,
      });
      continue;
    }

    if (processorConfig.type === "size-adapter:modelslab:real-esrgan") {
      imageProcessorManager.add(createModelslabRealEsrganSizeAdapter(processorConfig));
      imageLog("processor registered", {
        processorId: processorConfig.id,
        processorType: processorConfig.type,
        maxWidth: processorConfig.maxWidth,
        maxHeight: processorConfig.maxHeight,
        maxPixels: processorConfig.maxPixels,
      });
    }
  }

  if (config.providers.length === 0) {
    imageProviderManager.add(testImageProvider);
    imageLog("provider registered", {
      providerId: testImageProvider.id,
      providerType: testImageProvider.type,
      models: testImageProvider.models,
      reason: "fallback",
    });
    return;
  }

  for (const providerConfig of config.providers) {
    if (providerConfig.enabled === false) {
      imageLog("provider skipped", {
        providerId: providerConfig.id,
        providerType: providerConfig.type,
        reason: "disabled",
      });
      continue;
    }

    if (providerConfig.type === "openai-images") {
      imageProviderManager.add(createOpenAIImageGenerationProvider(providerConfig));
      imageLog("provider registered", {
        providerId: providerConfig.id,
        providerType: providerConfig.type,
        models: providerConfig.models,
        processor: providerConfig.processor,
        baseURL: providerConfig.baseURL,
      });
      continue;
    }

    if (providerConfig.type === "openai-variation") {
      imageProviderManager.add(createOpenAIImageVariationProvider(providerConfig));
      imageLog("provider registered", {
        providerId: providerConfig.id,
        providerType: providerConfig.type,
        models: providerConfig.models,
        processor: providerConfig.processor,
        baseURL: providerConfig.baseURL,
      });
      continue;
    }

    if (providerConfig.type === "openai-responses") {
      imageProviderManager.add(createOpenAIResponsesImageProvider(providerConfig));
      imageLog("provider registered", {
        providerId: providerConfig.id,
        providerType: providerConfig.type,
        models: providerConfig.models,
        processor: providerConfig.processor,
        baseURL: providerConfig.baseURL,
      });
      continue;
    }

    imageProviderManager.add(createTestImageProvider(providerConfig));
    imageLog("provider registered", {
      providerId: providerConfig.id,
      providerType: providerConfig.type,
      models: providerConfig.models,
      processor: providerConfig.processor,
    });
  }
});
