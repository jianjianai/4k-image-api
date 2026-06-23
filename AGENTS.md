This project is based on [Nitro v3](https://nitro.build), [h3](https://h3.dev/), [Vite](https://vite.dev/) and [rolldown](https://rolldown.rs/).

Refer to `node_modules/nitro/dist/docs/README.md` when working on server (your knowledge about Nitro v3 is likely outdated!).

## Project Structure

`index.html` is the entry point at the project root. `app/` is the frontend (SPA/SSR) with `entry-client.ts` and `app.ts`. `server/` contains server-side code with supported subdirs (create as needed): `api/` (/api prefixed handlers), `routes/` (non-prefixed route handlers), `middleware/`, `plugins/`, `utils/`, `assets/`, and `tasks/`. `public/` holds static assets (copied, not bundled). Config files: `vite.config.ts` (loads `nitro/vite` plugin), `nitro.config.ts` (serverDir, routeRules, preset, etc.), `tsconfig.json` (extends nitro/tsconfig, `~/*` path alias).

## Conventions

- Path alias `~/*` (tsconfig), use explicit `.ts` extensions

## Image Generation Cost Policy

When working on image providers or processors, protect image generation cost:

- Before calling an upstream image generation API, fail fast for unsupported requests when possible.
- After an upstream image generation API has returned an image, downstream processors should return a usable image whenever possible instead of rejecting solely because the exact requested size cannot be met.
- If the generated image is too small for the requested output, use the best available upscale path, such as the maximum supported cloud upscale factor, and return that result.
- If the generated image is too large for a downstream processor, resize it proportionally to a supported size and continue processing.
- Preserve aspect ratio. Do not stretch or distort generated images to force an exact size.
- Only fail after generation when no usable image can be returned, such as invalid image bytes, failed downloads, or unrecoverable processor/provider errors.

## Image Size Adapter Policy

When implementing or changing image size adapters, keep `processInput` and `processOutput` responsibilities separate:

- `processInput` runs before image generation. It should match the client-requested aspect ratio and send the largest image size the upstream generation provider can accept within configured limits. The generated request size should preserve the client aspect ratio and maximize source detail.
- `processOutput` runs after image generation. It must preserve the upstream image aspect ratio; never stretch the generated image to force the client-requested ratio.
- If the upstream generated image already satisfies both client-requested width and height, return it unchanged. Do not resize, upload to a cloud upscaler, or otherwise post-process it.
- `processOutput` should try to satisfy both client-requested width and height. Prefer dimensions whose width is not lower than the requested width and whose height is not lower than the requested height.
- If both requested dimensions cannot be satisfied, return the largest achievable image instead of failing, because generation cost has already been spent.
- If a cloud upscaler requires shrinking the generated image before upload, shrink proportionally to the largest size accepted by that upscaler and configuration. Do not shrink to `requestedSize / upscaleFactor` when that would damage the source image more than necessary.
- Choose the upscale factor after considering the actual generated image size. Use the smallest factor that satisfies the client dimensions when possible; otherwise use the maximum supported factor and return the best achievable result.



# AGENTS.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
