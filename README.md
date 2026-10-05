# Sandbox 3D

A living 3D diorama floating in the void: sculpt terrain, make rain, open rivers, trigger eruptions and meteors, and watch life grow and burn. No goals, no score. Soft, jelly-like, iOS-style look.

> Working name. Plan: [`docs/plan.md`](docs/plan.md). Decisions and rules: [`CLAUDE.md`](CLAUDE.md).

**Status:** Phase 0 (setup). A rounded cube spins on screen with a performance panel. Rendering uses WebGPU and falls back to WebGL2 automatically.

## Run it

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173
```

Other commands:

```bash
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
npm run typecheck  # TypeScript only
npm test           # unit tests (Vitest)
```

## The Phase 0 check (needs your PC)

Open the app in recent Chrome or Edge on a machine with a dedicated GPU. The panel at the top left shows:

- the backend in use (`WebGPU` or `WebGL2`),
- FPS, average frame time, 1% low and worst frame.

Phase 0 is done when the cube holds **60+ FPS** with the panel visible. If you see `WebGL2`, WebGPU was not available on that browser or driver; that is expected on some setups.

## Deploy (Cloudflare Pages)

Cloudflare dashboard → Workers & Pages → Create → Connect to Git → pick this repo.

| Setting | Value |
|---|---|
| Framework preset | None (or Vite) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | set env var `NODE_VERSION` to `22` |

Every push gets a preview link; `main` is the public site.

## Layout

```
src/core/      renderer, fixed-step loop, config
src/perf/      FPS panel and frame statistics
src/ui/        unsupported-browser notice (more UI later)
src/<others>/  empty folders reserved for later phases (see CLAUDE.md)
tests/         Vitest unit tests
```
