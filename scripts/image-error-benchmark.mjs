const baseURL = process.env.OPENAI_IMAGE_BENCHMARK_URL ?? "http://127.0.0.1:3000";

const cases = [
  {
    name: "model-not-found",
    endpoint: "/v1/images/generations",
    init: {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-2",
        prompt: "生成一张小猫的图片",
      }),
    },
    expect: {
      status: 404,
      code: "model_not_found",
      param: "model",
    },
  },
  {
    name: "invalid-json",
    endpoint: "/v1/images/generations",
    init: {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{",
    },
    expect: {
      status: 400,
      code: "invalid_json",
      param: null,
    },
  },
  {
    name: "invalid-content-type",
    endpoint: "/v1/images/generations",
    init: {
      method: "POST",
      headers: {
        "content-type": "text/plain",
      },
      body: "hello",
    },
    expect: {
      status: 400,
      code: "invalid_content_type",
      param: null,
    },
  },
  {
    name: "cors-preflight",
    endpoint: "/v1/images/generations",
    init: {
      method: "OPTIONS",
      headers: {
        origin: "http://example.test",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
      },
    },
    expect: {
      status: 204,
    },
  },
];

for (const testCase of cases) {
  const response = await fetch(new URL(testCase.endpoint, baseURL), testCase.init);

  if (response.status !== testCase.expect.status) {
    throw new Error(
      `${testCase.name} expected HTTP ${testCase.expect.status}, got ${response.status}: ${await response.text()}`,
    );
  }

  if (testCase.expect.status === 204) {
    assertCorsHeaders(testCase.name, response);
    continue;
  }

  const payload = await response.json();
  const error = payload.error;

  if (!error?.message || !error?.reason) {
    throw new Error(`${testCase.name} did not include an error reason.`);
  }

  if (error.code !== testCase.expect.code) {
    throw new Error(
      `${testCase.name} expected code ${testCase.expect.code}, got ${error.code}`,
    );
  }

  if (error.param !== testCase.expect.param) {
    throw new Error(
      `${testCase.name} expected param ${testCase.expect.param}, got ${error.param}`,
    );
  }
}

console.log(`Validated ${cases.length} client error/CORS case(s).`);

function assertCorsHeaders(name, response) {
  const origin = response.headers.get("access-control-allow-origin");
  const credentials = response.headers.get("access-control-allow-credentials");

  if (origin !== "http://example.test") {
    throw new Error(`${name} did not echo access-control-allow-origin.`);
  }

  if (credentials !== "true") {
    throw new Error(`${name} did not allow credentials.`);
  }
}
