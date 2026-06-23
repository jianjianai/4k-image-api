# 4K Image API

一个基于 Nitro v3 的 OpenAI 兼容生图 API 服务。前端或第三方客户端可以按 OpenAI Images / Responses 的请求格式调用本服务，后端再按配置把统一后的图片任务分发给不同提供商。

## 功能

- 兼容 OpenAI 风格的图片接口。
- 支持 JSON 和 multipart/form-data 请求。
- 客户端错误返回 OpenAI 风格 JSON 错误体，避免只有 404 没有原因。
- 支持 CORS 预检和跨域请求。
- 支持多 provider 配置，并按 `model + action` 路由。
- 内置测试 provider，未配置真实 provider 时可直接本地调试。

## 支持的接口

| 接口 | 说明 | 统一 action |
| --- | --- | --- |
| `POST /v1/images/generations` | 文生图 | `generate` |
| `POST /v1/images/edits` | 图像编辑 | `edit` |
| `POST /v1/images/variations` | 基于图片生成变体 | `variation` |
| `POST /v1/responses` | Responses API 的 `image_generation` tool | `generate` / `edit` |
| `GET /v1/models` | 拉取当前已注册 provider 支持的模型列表 | - |

未知 `/v1/**` 路径和不支持的方法会返回 OpenAI 风格错误 JSON。

## 开发

安装依赖：

```bash
pnpm install
```

启动开发服务：

```bash
pnpm dev
```

默认监听地址通常是：

```text
http://localhost:3000
```

运行测试：

```bash
pnpm test
```

类型检查：

```bash
npx tsc --noEmit
```

构建：

```bash
pnpm build
```

预览构建产物：

```bash
pnpm preview
```

## 图片后端配置

图片后端配置支持两种加载方式，优先级从高到低：

1. 项目根目录的 `image-providers.config.json`
2. Nitro `runtimeConfig.imageProviders`，通常通过环境变量 `NITRO_IMAGE_PROVIDERS` 覆盖

当前 `nitro.config.ts` 的默认值是：

```ts
runtimeConfig: {
  apiKeys: "",
  imageProviders: "[]",
}
```

如果配置为空数组，服务会注册内置 `test` provider，用于本地开发和接口联调。

推荐在 `image-providers.config.json` 使用对象格式：

```json
{
  "processors": [],
  "providers": []
}
```

旧的 provider 数组格式仍然兼容。

如果没有 `image-providers.config.json`，可以用环境变量配置：

```bash
NITRO_IMAGE_PROVIDERS='{"processors":[],"providers":[]}' pnpm dev
```

PowerShell 示例：

```powershell
$env:NITRO_IMAGE_PROVIDERS='{"processors":[],"providers":[]}'
pnpm dev
```

## 客户端 API Key 保护

为了防止接口被滥用，可以通过环境变量配置允许访问本服务的客户端 API Key：

```bash
NITRO_API_KEYS="client-key-1,client-key-2" pnpm dev
```

PowerShell 示例：

```powershell
$env:NITRO_API_KEYS="client-key-1,client-key-2"
pnpm dev
```

配置为空时不启用鉴权，方便本地开发。配置后，所有 `/v1/**` 非 OPTIONS 请求都必须携带以下任意一种请求头：

```http
Authorization: Bearer client-key-1
```

或：

```http
x-api-key: client-key-1
```

注意：`NITRO_API_KEYS` 是访问本服务的客户端密钥，provider 配置里的 `apiKey` 是本服务访问 OpenAI 的密钥，两者用途不同。

### Provider 选择规则

请求会先被解析成统一的 `ImageInput`，其中核心字段是：

```ts
type ImageAction = "generate" | "edit" | "variation";
```

provider 声明自己支持的 action：

```ts
actionSupports: readonly ImageAction[];
```

运行时按以下条件选择 provider：

1. `model` 在 provider 的 `models` 列表中。
2. `action` 在 provider 的 `actionSupports` 列表中。
3. 多个 provider 同时匹配时，使用配置顺序中最先注册的 provider。
4. 如果 provider 配置了 `processor`，会在调用 provider 前后执行对应 processor。

## Processor 类型

processor 用于在 provider 调用前后修改 `ImageInput` 和 `ImageOutput`。每个 provider 最多引用一个 processor：

```json
{
  "type": "test",
  "models": ["test-image"],
  "processor": "demo-processor"
}
```

### `testprocessor`

内置测试 processor，用于验证 processor 链路。它可以给 prompt 和 revised prompt 加前缀，也可以改输出图片的 MIME 类型。

```json
{
  "id": "demo-processor",
  "type": "testprocessor",
  "promptPrefix": "[input] ",
  "revisedPromptPrefix": "[output] ",
  "outputMimeType": "image/webp"
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | processor 唯一标识，provider 用 `processor` 字段引用 |
| `type` | 是 | 当前支持 `testprocessor` |
| `enabled` | 否 | 设置为 `false` 时跳过该 processor |
| `promptPrefix` | 否 | 调用 provider 前给 `ImageInput.prompt` 加前缀 |
| `revisedPromptPrefix` | 否 | provider 返回后给 `ImageOutput.images[].revisedPrompt` 加前缀 |
| `outputMimeType` | 否 | 将输出图片 MIME 类型改为 `image/png`、`image/jpeg` 或 `image/webp` |

### `size-adapter:local:sharp-lanczos3`

本地尺寸适配器。它会先判断用户请求的 `size` 是否超过配置的最大尺寸；如果超过，就把生成请求的 `size` 等比缩小到最大尺寸内。生成完成后，它会按 provider 实际返回图片的宽高，用 `sharp` 的 Lanczos3 kernel 等比放大，直到输出宽度和高度都不低于用户原始请求尺寸，不裁剪、不拉伸。

```json
{
  "id": "resize-local-4k",
  "type": "size-adapter:local:sharp-lanczos3",
  "maxWidth": 1920,
  "maxHeight": 1920,
  "maxPixels": 2073600
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | processor 唯一标识 |
| `type` | 是 | `size-adapter:local:sharp-lanczos3` |
| `maxWidth` | 是 | 允许发送给生成 provider 的最大宽度 |
| `maxHeight` | 是 | 允许发送给生成 provider 的最大高度 |
| `maxPixels` | 否 | 允许发送给生成 provider 的最大像素数，例如 `1920 * 1080 = 2073600` |
| `fit` | 否 | 兼容旧配置；当前输出固定按比例缩放，不使用该字段 |

### `size-adapter:aliyun:super-resolution`

阿里云视觉智能开放平台「图像超分」云端处理器。生成前，它会把用户请求的 `size` 按原始比例缩到生成 provider 可接受的最大尺寸内。生成完成后，它会读取 provider 实际返回图片的宽高；如果实际图片已经满足客户端请求，直接返回；如果需要超分，则按阿里云硬限制和本 processor 配置等比缩到可上传的最大尺寸，再通过阿里云官方 SDK 调用 `MakeSuperResolutionImage`，最后下载返回的图片 URL。

阿里云版本不会在云端放大后再用本地 `sharp` 强制裁切或拉伸到客户端比例。输出阶段会按实际上传尺寸选择刚好满足客户端宽高的最小倍率；如果 `4x` 也无法满足，就用 `4x` 返回可达到的最大图片。生成已经成功后，如果阿里云后处理失败，会尽量返回 provider 原图，避免浪费生图成本。

```json
{
  "id": "resize-aliyun-auto",
  "type": "size-adapter:aliyun:super-resolution",
  "maxWidth": 1920,
  "maxHeight": 1920,
  "maxPixels": 2073600,
  "accessKeyId": "aliyun-your-access-key-id",
  "accessKeySecret": "aliyun-your-access-key-secret",
  "regionId": "cn-shanghai",
  "mode": "base",
  "outputFormat": "png",
  "outputQuality": 95,
  "timeoutMs": 120000
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | processor 唯一标识 |
| `type` | 是 | `size-adapter:aliyun:super-resolution` |
| `maxWidth` | 是 | 允许发送给生成 provider 的最大宽度 |
| `maxHeight` | 是 | 允许发送给生成 provider 的最大高度 |
| `maxPixels` | 否 | 允许发送给生成 provider 的最大像素数，例如 `1920 * 1080 = 2073600` |
| `accessKeyId` | 是 | 阿里云 RAM 用户 AccessKey ID |
| `accessKeySecret` | 是 | 阿里云 RAM 用户 AccessKey Secret |
| `regionId` | 否 | 阿里云地域，默认 `cn-shanghai` |
| `endpoint` | 否 | 自定义阿里云 imageenhan endpoint |
| `mode` | 否 | 阿里云 `Mode` 参数，例如 `base` |
| `outputFormat` | 否 | 输出格式，只能是 `png`、`jpg` 或 `bmp` |
| `outputQuality` | 否 | 阿里云 `OutputQuality` 参数 |
| `timeoutMs` | 否 | SDK 连接和读取超时时间，单位毫秒 |

### `size-adapter:modelslab:real-esrgan`

Modelslab Real-ESRGAN 云端超分处理器。生成前，它会把用户请求的 `size` 按原始比例缩到生成 provider 可接受的最大尺寸内。生成完成后，它会读取 provider 实际返回图片的宽高；如果实际图片已经满足客户端请求，直接返回；如果需要超分，则把 provider 输出图片提交到 Modelslab super resolution API 放大，再下载返回的图片 URL。

Modelslab 版本不会在云端放大后再用本地 `sharp` 强制裁切或拉伸到客户端比例。输出阶段会按实际图片尺寸选择刚好满足客户端宽高的最小倍率；如果 `4x` 也无法满足，就用 `4x` 返回可达到的最大图片。生成已经成功后，如果 Modelslab 后处理失败，会尽量返回 provider 原图，避免浪费生图成本。

```json
{
  "id": "resize-modelslab-auto",
  "type": "size-adapter:modelslab:real-esrgan",
  "maxWidth": 1920,
  "maxHeight": 1920,
  "maxPixels": 2073600,
  "apiKey": "modelslab-your-api-key",
  "modelByScale": {
    "2": "RealESRGAN_x2plus",
    "3": "realesr-general-x4v3",
    "4": "realesr-general-x4v3"
  },
  "faceEnhance": false
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | processor 唯一标识 |
| `type` | 是 | `size-adapter:modelslab:real-esrgan` |
| `maxWidth` | 是 | 允许发送给生成 provider 的最大宽度 |
| `maxHeight` | 是 | 允许发送给生成 provider 的最大高度 |
| `maxPixels` | 否 | 允许发送给生成 provider 的最大像素数，例如 `1920 * 1080 = 2073600` |
| `apiKey` | 是 | Modelslab API Key |
| `modelId` | 否 | 全局强制使用的 Modelslab 模型。配置后会覆盖 `modelByScale` 和内置默认模型 |
| `modelByScale` | 否 | 按倍率覆盖模型，例如 `{ "2": "RealESRGAN_x2plus", "4": "ultra_resolution" }`。不填时，`2x` 使用 `RealESRGAN_x2plus`，`3x/4x` 使用 `realesr-general-x4v3` |
| `faceEnhance` | 否 | 是否启用人脸增强，默认 `false` |
| `baseURL` | 否 | 自定义 Modelslab super resolution API 地址 |

## Provider 类型

### `test`

内置测试 provider，不需要 API Key。它会返回很小的测试图片字节，用于开发环境验证接口、响应格式和前端流程。

```json
{
  "providers": [
    {
      "type": "test",
      "models": ["test-image", "gpt-image-1"]
    }
  ]
}
```

### `openai-images`

接入 OpenAI Images API，支持：

- `generate` -> `client.images.generate(...)`
- `edit` -> `client.images.edit(...)`

```json
{
  "providers": [
    {
      "id": "openai-images",
      "type": "openai-images",
      "apiKey": "sk-...",
      "models": ["gpt-image-1", "gpt-image-2"]
    }
  ]
}
```

### `openai-variation`

接入 OpenAI Images variation API，支持：

- `variation` -> `client.images.createVariation(...)`

该能力通常用于 `dall-e-2` 这类支持 variation 的模型。

```json
{
  "providers": [
    {
      "id": "openai-variation",
      "type": "openai-variation",
      "apiKey": "sk-...",
      "models": ["dall-e-2"]
    }
  ]
}
```

### `openai-responses`

接入 OpenAI Responses API，通过 `image_generation` tool 生成或编辑图片，支持：

- `generate` -> `client.responses.create(...)`
- `edit` -> `client.responses.create(...)`

```json
{
  "providers": [
    {
      "id": "openai-responses",
      "type": "openai-responses",
      "apiKey": "sk-...",
      "models": ["gpt-image-1", "gpt-image-2"]
    }
  ]
}
```

### OpenAI provider 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | provider 唯一标识 |
| `type` | 是 | `openai-images`、`openai-variation` 或 `openai-responses` |
| `apiKey` | 是 | OpenAI API Key |
| `models` | 是 | provider 支持的模型列表 |
| `enabled` | 否 | 设置为 `false` 时跳过该 provider |
| `processor` | 否 | 引用一个已配置的 processor |
| `baseURL` | 否 | 自定义 OpenAI 兼容 API 地址 |
| `organization` | 否 | OpenAI organization |
| `project` | 否 | OpenAI project |
| `timeoutMs` | 否 | SDK 请求超时时间 |
| `maxRetries` | 否 | SDK 最大重试次数 |
| `userAgent` | 否 | 覆盖 OpenAI SDK 请求的 User-Agent，默认 `4k-image-api` |

## 完整配置示例

```json
{
  "processors": [
    {
      "id": "demo-processor",
      "type": "testprocessor",
      "promptPrefix": "[input] ",
      "revisedPromptPrefix": "[output] "
    },
    {
      "id": "resize-local-4k",
      "type": "size-adapter:local:sharp-lanczos3",
      "maxWidth": 1920,
      "maxHeight": 1920,
      "maxPixels": 2073600
    },
    {
      "id": "resize-modelslab-auto",
      "type": "size-adapter:modelslab:real-esrgan",
      "maxWidth": 1920,
      "maxHeight": 1920,
      "maxPixels": 2073600,
      "apiKey": "modelslab-your-api-key",
      "modelByScale": {
        "2": "RealESRGAN_x2plus",
        "3": "realesr-general-x4v3",
        "4": "realesr-general-x4v3"
      }
    },
    {
      "id": "resize-aliyun-auto",
      "type": "size-adapter:aliyun:super-resolution",
      "maxWidth": 1920,
      "maxHeight": 1920,
      "maxPixels": 2073600,
      "accessKeyId": "aliyun-your-access-key-id",
      "accessKeySecret": "aliyun-your-access-key-secret",
      "regionId": "cn-shanghai",
      "mode": "base",
      "outputFormat": "png",
      "outputQuality": 95,
      "timeoutMs": 120000
    }
  ],
  "providers": [
    {
      "id": "openai-images-main",
      "type": "openai-images",
      "apiKey": "sk-...",
      "models": ["gpt-image-1", "gpt-image-2"],
      "processor": "resize-local-4k",
      "userAgent": "4k-image-api",
      "timeoutMs": 120000,
      "maxRetries": 1
    },
    {
      "id": "openai-variation-main",
      "type": "openai-variation",
      "apiKey": "sk-...",
      "models": ["dall-e-2"]
    },
    {
      "id": "openai-responses-main",
      "type": "openai-responses",
      "apiKey": "sk-...",
      "models": ["gpt-image-1"]
    }
  ]
}
```

## 请求示例

### Images generations

```bash
curl http://localhost:3000/v1/images/generations \
  -H "authorization: Bearer client-key-1" \
  -H "content-type: application/json" \
  -d '{
    "model": "gpt-image-1",
    "prompt": "生成一张小猫图片",
    "size": "1024x1024",
    "output_format": "png"
  }'
```

### Responses image generation

```bash
curl http://localhost:3000/v1/responses \
  -H "authorization: Bearer client-key-1" \
  -H "content-type: application/json" \
  -d '{
    "model": "gpt-image-1",
    "input": "生成一张小猫图片",
    "tools": [
      {
        "type": "image_generation",
        "size": "1024x1024",
        "output_format": "png",
        "quality": "auto"
      }
    ],
    "tool_choice": "required"
  }'
```

### Images edits

`/v1/images/edits` 支持 multipart/form-data，请用 `image` 上传输入图片，可选 `mask`：

```bash
curl http://localhost:3000/v1/images/edits \
  -H "authorization: Bearer client-key-1" \
  -F "model=gpt-image-1" \
  -F "prompt=把背景换成海边" \
  -F "image=@input.png" \
  -F "mask=@mask.png"
```

### Images variations

`/v1/images/variations` 支持 multipart/form-data，请用 `image` 上传输入图片：

```bash
curl http://localhost:3000/v1/images/variations \
  -H "authorization: Bearer client-key-1" \
  -F "model=dall-e-2" \
  -F "image=@input.png" \
  -F "response_format=b64_json"
```

### Models

`/v1/models` 返回当前已注册 provider 的模型列表，并包含每个模型支持的 action：

```bash
curl http://localhost:3000/v1/models \
  -H "authorization: Bearer client-key-1"
```

## 响应格式

Images API 风格接口返回：

```json
{
  "created": 1760000000,
  "data": [
    {
      "b64_json": "..."
    }
  ],
  "usage": {}
}
```

`/v1/responses` 返回 Responses 风格结构，图片结果位于 `output[].result`：

```json
{
  "id": "resp_xxx",
  "object": "response",
  "status": "completed",
  "output": [
    {
      "type": "image_generation_call",
      "status": "completed",
      "result": "..."
    }
  ],
  "output_text": "",
  "usage": {}
}
```

## 错误格式

客户端错误会返回 JSON：

```json
{
  "error": {
    "message": "Image model is required.",
    "type": "invalid_request_error",
    "param": "model",
    "code": "model_required"
  }
}
```

常见错误：

- 请求体不是合法 JSON。
- `Content-Type` 不是 `application/json` 或 `multipart/form-data`。
- 配置了 `NITRO_API_KEYS` 但没有传有效客户端 API Key。
- 没有传 `model`。
- 没有 provider 支持该 `model + action`。
- 请求了不存在的 `/v1/**` 接口。

## 项目结构

```text
app/                         前端入口
server/routes/v1/            OpenAI 兼容路由
server/utils/openai-image/   OpenAI 请求解析、响应格式化、错误处理
server/utils/image/          统一图片输入输出、provider manager
server/utils/image/providers 后端 provider 实现
tests/                       Vitest 测试
```

## 设计约定

- 前端 OpenAI endpoint 不进入统一后端类型，后端只关心 `ImageAction`。
- provider 不通过 endpoint 分流，而是声明 `actionSupports`。
- `openai-images`、`openai-variation`、`openai-responses` 分开实现，避免在 provider 内部用隐式条件猜接口类型。
- `createImageProviderManager` 保持私有，只导出全局 `imageProviderManager`。
