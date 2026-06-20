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

## Provider 配置

provider 配置通过 Nitro `runtimeConfig.imageProviders` 读取，类型是 JSON 字符串。当前 `nitro.config.ts` 的默认值是：

```ts
runtimeConfig: {
  imageProviders: "[]",
}
```

如果配置为空数组，服务会注册内置 `test` provider，用于本地开发和接口联调。

在运行时可以用环境变量覆盖：

```bash
NITRO_IMAGE_PROVIDERS='[...]' pnpm dev
```

PowerShell 示例：

```powershell
$env:NITRO_IMAGE_PROVIDERS='[...]'
pnpm dev
```

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

## Provider 类型

### `test`

内置测试 provider，不需要 API Key。它会返回很小的测试图片字节，用于开发环境验证接口、响应格式和前端流程。

```json
[
  {
    "type": "test",
    "models": ["test-image", "gpt-image-1"]
  }
]
```

### `openai-images`

接入 OpenAI Images API，支持：

- `generate` -> `client.images.generate(...)`
- `edit` -> `client.images.edit(...)`

```json
[
  {
    "id": "openai-images",
    "type": "openai-images",
    "apiKey": "sk-...",
    "models": ["gpt-image-1", "gpt-image-2"]
  }
]
```

### `openai-variation`

接入 OpenAI Images variation API，支持：

- `variation` -> `client.images.createVariation(...)`

该能力通常用于 `dall-e-2` 这类支持 variation 的模型。

```json
[
  {
    "id": "openai-variation",
    "type": "openai-variation",
    "apiKey": "sk-...",
    "models": ["dall-e-2"]
  }
]
```

### `openai-responses`

接入 OpenAI Responses API，通过 `image_generation` tool 生成或编辑图片，支持：

- `generate` -> `client.responses.create(...)`
- `edit` -> `client.responses.create(...)`

```json
[
  {
    "id": "openai-responses",
    "type": "openai-responses",
    "apiKey": "sk-...",
    "models": ["gpt-image-1", "gpt-image-2"]
  }
]
```

### OpenAI provider 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | provider 唯一标识 |
| `type` | 是 | `openai-images`、`openai-variation` 或 `openai-responses` |
| `apiKey` | 是 | OpenAI API Key |
| `models` | 是 | provider 支持的模型列表 |
| `enabled` | 否 | 设置为 `false` 时跳过该 provider |
| `baseURL` | 否 | 自定义 OpenAI 兼容 API 地址 |
| `organization` | 否 | OpenAI organization |
| `project` | 否 | OpenAI project |
| `timeoutMs` | 否 | SDK 请求超时时间 |
| `maxRetries` | 否 | SDK 最大重试次数 |

## 完整配置示例

```json
[
  {
    "id": "openai-images-main",
    "type": "openai-images",
    "apiKey": "sk-...",
    "models": ["gpt-image-1", "gpt-image-2"],
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
```

## 请求示例

### Images generations

```bash
curl http://localhost:3000/v1/images/generations \
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
  -F "model=gpt-image-1" \
  -F "prompt=把背景换成海边" \
  -F "image=@input.png" \
  -F "mask=@mask.png"
```

### Images variations

`/v1/images/variations` 支持 multipart/form-data，请用 `image` 上传输入图片：

```bash
curl http://localhost:3000/v1/images/variations \
  -F "model=dall-e-2" \
  -F "image=@input.png" \
  -F "response_format=b64_json"
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
