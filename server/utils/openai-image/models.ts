import type { ImageAction, ImageProviderType, ImageProviders } from "../image.ts";

export type OpenAIModelListResponse = {
  object: "list";
  data: OpenAIImageModel[];
};

export type OpenAIImageModel = {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  actions: ImageAction[];
  providerIds: string[];
  providerTypes: ImageProviderType[];
};

export const formatOpenAIModelList = (
  providers: ImageProviders,
): OpenAIModelListResponse => ({
  object: "list",
  data: [...collectModels(providers).values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  ),
});

const collectModels = (providers: ImageProviders): Map<string, OpenAIImageModel> => {
  const models = new Map<string, OpenAIImageModel>();

  for (const provider of providers) {
    for (const modelId of provider.models) {
      const model = models.get(modelId) ?? {
        id: modelId,
        object: "model",
        created: 0,
        owned_by: provider.type,
        actions: [],
        providerIds: [],
        providerTypes: [],
      };

      model.actions = mergeUnique(model.actions, provider.actionSupports);
      model.providerIds = mergeUnique(model.providerIds, [provider.id]);
      model.providerTypes = mergeUnique(model.providerTypes, [provider.type]);
      models.set(modelId, model);
    }
  }

  return models;
};

const mergeUnique = <T>(current: T[], incoming: readonly T[]): T[] => [
  ...new Set([...current, ...incoming]),
];
