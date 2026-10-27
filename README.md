# AI Generator Studio

Hybrid-ready workspace for AI image generation, restoration, upscaling, video, face tools, and 3D workflows.

## Current status
This is an initial UI and architecture MVP. The frontend scaffold is not connected to AI inference, cloud-provider calls, GPU jobs, or production persistence yet.

## Priorities
1. Image generation
2. Image restoration
3. Image upscaling
4. Video generation and processing
5. Face tools for authorized media only
6. 3D workflow exploration

## Architecture
- Web UI: React + TypeScript + Vite.
- Metadata: Neon PostgreSQL.
- Inference: provider-neutral adapters, local worker, and optional cloud adapters after license/cost/security review.
- Job contract: workflow, prompt, execution mode, optional source metadata, and explicit lifecycle transitions.
- Secrets: provider credentials stay server-side; never commit credentials or .env files.

Neon provides database infrastructure, not GPU inference by itself. Local inference requires compatible hardware and model weights. Cloud inference may incur costs and must be opt-in.

## Development
Requirements: Node.js 20+ and npm.

    npm install
    npm run dev
    npm test
    npm run build

The initial contract tests use Node.js's built-in test runner and do not require an extra test framework.

## License and attribution
The upstream DJNormality/AI_Generator project was reviewed as a reference. Its MIT license permits reuse of covered code subject to retaining its copyright and permission notice. Third-party code, model weights, datasets, fonts, and APIs need separate license review; an upstream code license does not automatically license those assets. Do not copy model weights or private media into this repository.

## Safety and privacy
- Process only media you own or have permission to use.
- Do not use face tools to impersonate, deceive, or violate privacy.
- Keep uploaded media private by default and define retention/deletion before production storage.
- Label synthetic or materially edited media when appropriate.
- Never expose provider keys in browser code.

## Milestones
- [x] Frontend scaffold and build CI
- [x] Provider-neutral job request contract and lifecycle transition tests added to CI
- [ ] Server API and reviewed, non-destructive Neon migrations
- [ ] Local-worker adapter and health checks
- [ ] Opt-in cloud adapters with per-job cost estimates
- [ ] Real integration tests for each media workflow
