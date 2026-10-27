# AI Generator Studio

Hybrid-ready workspace for AI image generation, restoration, upscaling, video, face tools, and 3D workflows.

## Current status
The React/Vite frontend and a small Node.js API scaffold are present. The API can validate requests and enforce adapter availability, but no real AI inference provider, GPU worker, or production persistence is configured. Do not interpret API health as inference readiness.

## Priorities
1. Image generation
2. Image restoration
3. Image upscaling
4. Video generation and processing
5. Face tools for authorized media only
6. 3D workflow exploration

## Architecture
- Web UI: React + TypeScript + Vite.
- Local API: Node.js built-in HTTP server, bound to 127.0.0.1 by default.
- Job service: provider-neutral contract with local/cloud adapter slots and explicit errors when no adapter is configured.
- Metadata target: Neon PostgreSQL, pending schema review and migration.
- Inference: local worker first where hardware permits; optional cloud adapters only after license, security, and cost review.
- Secrets: provider credentials stay server-side; never commit credentials or .env files.

Neon provides database infrastructure, not GPU inference by itself. Local inference requires compatible hardware and model weights. Cloud inference may incur costs and must be opt-in.

## Development
Requirements: Node.js 20+ and npm.

Install dependencies:

    npm install

Terminal 1 — API:

    npm run dev:api

Terminal 2 — frontend:

    npm run dev

API health check: http://127.0.0.1:8787/healthz. It intentionally reports inference as not-configured until an actual provider adapter is installed.

Run tests and build:

    npm test
    npm run build

The API returns HTTP 503 INFERENCE_ADAPTER_UNAVAILABLE for job submission until the requested local/cloud adapter is configured. This is deliberate fail-closed behavior; no fake media or false success is returned. The in-memory job store is development-only and is lost when the process restarts.

## Safety and deployment boundaries
- The API is local-only by default. Do not set ALLOW_PUBLIC_BIND=1 on a public server without adding authentication, rate limits, request limits, and deployment-specific security controls.
- Do not send private media to a provider without user consent and clear retention terms.
- Process only media you own or have permission to use.
- Do not use face tools to impersonate, deceive, or violate privacy.
- Label synthetic or materially edited media when appropriate.
- No API key should ever be embedded in browser code.
- GitHub Pages can serve the static UI, but it cannot host this Node API. A separate server/runtime is required for remote API access.

## License and attribution
The upstream DJNormality/AI_Generator project was reviewed as a reference. Its MIT license permits reuse of covered code subject to retaining its copyright and permission notice. Third-party code, model weights, datasets, fonts, and APIs need separate license review; an upstream code license does not automatically license those assets. No model weights or private media are bundled here.

## Milestones
- [x] Frontend scaffold and build CI
- [x] Provider-neutral job request contract and lifecycle transition tests
- [x] Local Node API scaffold, health endpoint, job request validation, and adapter-unavailable response
- [x] Automated tests for job service and HTTP error handling
- [ ] Real local inference adapter and worker health checks
- [ ] Opt-in cloud adapters with per-job cost estimates
- [ ] Neon schema and migration on a review branch
- [ ] Authenticated production API and end-to-end tests
