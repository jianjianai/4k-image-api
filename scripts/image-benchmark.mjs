import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const baseURL = process.env.OPENAI_IMAGE_BENCHMARK_URL ?? "http://127.0.0.1:3000";
const outputDir = fileURLToPath(
  new URL("../benchmark-output/openai-images/", import.meta.url),
);

const pngBytes = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
  0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84,
  120, 156, 99, 248, 207, 192, 240, 31, 0, 5, 0, 1, 255, 137, 153, 61, 29,
  0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

const cases = [
  {
    name: "images.generations.minimal",
    endpoint: "/v1/images/generations",
    kind: "json",
    body: {
      prompt: "A small benchmark image",
    },
    expect: { count: 1, responseFormat: "b64_json", extension: "png" },
  },
  {
    name: "images.generations.gpt-image-b64",
    endpoint: "/v1/images/generations",
    kind: "json",
    body: {
      model: "gpt-image-1",
      prompt: "A red square on white background",
      n: 2,
      size: "1024x1024",
      quality: "high",
      background: "transparent",
      output_format: "png",
      response_format: "b64_json",
    },
    expect: { count: 2, responseFormat: "b64_json", extension: "png" },
  },
  {
    name: "images.generations.dalle-url",
    endpoint: "/v1/images/generations",
    kind: "json",
    body: {
      model: "dall-e-3",
      prompt: "A blue benchmark tile",
      size: "1024x1024",
      quality: "standard",
      response_format: "url",
    },
    expect: { count: 1, responseFormat: "url", extension: "png" },
  },
  {
    name: "images.generations.webp",
    endpoint: "/v1/images/generations",
    kind: "json",
    body: {
      model: "gpt-image-1",
      prompt: "A webp benchmark image",
      output_format: "webp",
    },
    expect: { count: 1, responseFormat: "b64_json", extension: "webp" },
  },
  {
    name: "images.edits.single-image",
    endpoint: "/v1/images/edits",
    kind: "form",
    fields: {
      model: "gpt-image-1",
      prompt: "Add a tiny border",
      n: "1",
      size: "1024x1024",
      response_format: "b64_json",
    },
    files: [{ name: "image", filename: "input.png" }],
    expect: { count: 1, responseFormat: "b64_json", extension: "png" },
  },
  {
    name: "images.edits.multi-image-mask-jpeg",
    endpoint: "/v1/images/edits",
    kind: "form",
    fields: {
      model: "gpt-image-1",
      prompt: "Blend two tiny source images",
      n: "2",
      output_format: "jpeg",
    },
    files: [
      { name: "image", filename: "input-a.png" },
      { name: "image", filename: "input-b.png" },
      { name: "mask", filename: "mask.png" },
    ],
    expect: { count: 2, responseFormat: "b64_json", extension: "jpg" },
  },
  {
    name: "images.variations.b64",
    endpoint: "/v1/images/variations",
    kind: "form",
    fields: {
      model: "dall-e-2",
      n: "2",
      size: "1024x1024",
      response_format: "b64_json",
    },
    files: [{ name: "image", filename: "variation-source.png" }],
    expect: { count: 2, responseFormat: "b64_json", extension: "png" },
  },
  {
    name: "images.variations.url",
    endpoint: "/v1/images/variations",
    kind: "form",
    fields: {
      model: "dall-e-2",
      response_format: "url",
    },
    files: [{ name: "image", filename: "variation-source.png" }],
    expect: { count: 1, responseFormat: "url", extension: "png" },
  },
  {
    name: "responses.image-generation.string-input",
    endpoint: "/v1/responses",
    kind: "json",
    body: {
      model: "gpt-4.1-mini",
      input: "Generate a tiny benchmark image",
      tools: [
        {
          type: "image_generation",
          model: "gpt-image-1",
          size: "1024x1024",
          quality: "high",
          output_format: "png",
        },
      ],
    },
    expect: { count: 1, responseFormat: "responses", extension: "png" },
  },
  {
    name: "responses.image-generation.message-input-webp",
    endpoint: "/v1/responses",
    kind: "json",
    body: {
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Generate a tiny webp benchmark image",
            },
          ],
        },
      ],
      stream: false,
      tools: [
        {
          type: "image_generation",
          model: "gpt-image-1",
          output_format: "webp",
        },
      ],
    },
    expect: { count: 1, responseFormat: "responses", extension: "webp" },
  },
];

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const results = [];

for (const testCase of cases) {
  const startedAt = performance.now();
  const response = await send(testCase);
  const elapsedMs = performance.now() - startedAt;

  if (!response.ok) {
    throw new Error(
      `${testCase.name} failed with HTTP ${response.status}: ${await response.text()}`,
    );
  }

  const payload = await response.json();
  const images = extractImages(payload, testCase.expect.responseFormat);

  if (images.length !== testCase.expect.count) {
    throw new Error(
      `${testCase.name} expected ${testCase.expect.count} image(s), got ${images.length}`,
    );
  }

  const files = [];

  for (const [index, image] of images.entries()) {
    assertImageBytes(testCase.name, image.bytes, testCase.expect.extension);

    const filename = `${testCase.name}.${index + 1}.${testCase.expect.extension}`;
    await writeFile(join(outputDir, filename), image.bytes);
    files.push(filename);
  }

  results.push({
    name: testCase.name,
    elapsedMs: Math.round(elapsedMs),
    files,
  });
}

console.table(
  results.map((result) => ({
    case: result.name,
    ms: result.elapsedMs,
    files: result.files.join(", "),
  })),
);

console.log(`Generated ${results.reduce((sum, result) => sum + result.files.length, 0)} image(s).`);
console.log(`Output: ${outputDir}`);

async function send(testCase) {
  if (testCase.kind === "json") {
    return fetch(new URL(testCase.endpoint, baseURL), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer benchmark",
      },
      body: JSON.stringify(testCase.body),
    });
  }

  const form = new FormData();

  for (const [key, value] of Object.entries(testCase.fields ?? {})) {
    form.append(key, value);
  }

  for (const file of testCase.files ?? []) {
    form.append(
      file.name,
      new File([pngBytes], file.filename, { type: "image/png" }),
    );
  }

  return fetch(new URL(testCase.endpoint, baseURL), {
    method: "POST",
    headers: {
      authorization: "Bearer benchmark",
    },
    body: form,
  });
}

function extractImages(payload, responseFormat) {
  if (responseFormat === "responses") {
    return payload.output
      .filter((item) => item.type === "image_generation_call")
      .map((item) => ({
        bytes: Buffer.from(item.result, "base64"),
      }));
  }

  if (!Array.isArray(payload.data)) {
    throw new Error("Image response must include a data array.");
  }

  return payload.data.map((item) => {
    if (responseFormat === "url") {
      return {
        bytes: decodeDataURL(item.url),
      };
    }

    return {
      bytes: Buffer.from(item.b64_json, "base64"),
    };
  });
}

function decodeDataURL(value) {
  if (typeof value !== "string" || !value.startsWith("data:image/")) {
    throw new Error("Expected a data image URL.");
  }

  return Buffer.from(value.split(",").at(-1), "base64");
}

function assertImageBytes(name, bytes, extension) {
  if (bytes.length === 0) {
    throw new Error(`${name} returned an empty image.`);
  }

  const magic = Buffer.from(bytes.subarray(0, 12));

  if (extension === "png" && !magic.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error(`${name} did not return a PNG image.`);
  }

  if (extension === "jpg" && !(magic[0] === 255 && magic[1] === 216)) {
    throw new Error(`${name} did not return a JPEG image.`);
  }

  if (extension === "webp" && magic.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error(`${name} did not return a WebP image.`);
  }
}
