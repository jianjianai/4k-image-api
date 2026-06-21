import { defineHandler } from "nitro";
import { imageProviderManager } from "../../utils/image.ts";
import { assertOpenAIAPIKey } from "../../utils/openai-image/auth.ts";
import { getOpenAICorsHeaders } from "../../utils/openai-image/cors.ts";
import { toOpenAIErrorResponse } from "../../utils/openai-image/errors.ts";
import { formatOpenAIModelList } from "../../utils/openai-image/models.ts";

export default defineHandler((event) => {
  try {
    assertOpenAIAPIKey(event.req);

    return Response.json(formatOpenAIModelList(imageProviderManager.list()), {
      headers: getOpenAICorsHeaders(event.req),
    });
  } catch (error) {
    return toOpenAIErrorResponse(error, event.req);
  }
});
