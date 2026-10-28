# AI Generator Studio

Hybrid-ready workspace for AI image generation, restoration, upscaling, video, face tools, and 3D workflows.

## Current status
The React/Vite frontend and Node.js API scaffold are present. The optional ComfyUI adapter can submit a configured API-format workflow, poll ComfyUI history/queue, and retrieve validated output media through a job-scoped API route. Automated tests use mocked ComfyUI responses; real inference still requires a running ComfyUI server, compatible workflow, installed nodes, and model weights. No production persistence, authentication, or cloud inference provider is configured.

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
- Local inference adapter: optional ComfyUI API workflow submission.
- Metadata target: Neon PostgreSQL, pending schema review and migration.
- Secrets: provider credentials stay server-side; never commit credentials or .env files.

Neon provides database infrastructure, not GPU inference by itself. Local inference requires compatible hardware and model weights. Cloud inference may incur costs and must be opt-in.

## Development

Requirements: Node.js 20+, npm, and (for actual local inference) a running ComfyUI server with a valid API-format workflow.

Install dependencies:

    npm install

Terminal 1 — API:

    npm run dev:api

Terminal 2 — frontend:

    npm run dev

Without ComfyUI configuration, API health reports `inference: "not-configured"` and job submission returns HTTP 503. To configure the local adapter, set these environment variables **in the API process environment**, not in browser code:

- `COMFYUI_URL`: base URL of the reachable ComfyUI server, for example `http://127.0.0.1:8188`.
- `COMFYUI_WORKFLOW_PATH`: path to a ComfyUI API-format workflow JSON file.
- `COMFYUI_PROMPT_NODE_ID`: node ID in that workflow whose input will receive the prompt.
- `COMFYUI_PROMPT_INPUT`: optional input field name; defaults to `text`.

All three required variables must be supplied together. The configured node and input field must exist in the workflow. Workflow JSON is user-supplied; ensure it is compatible with the installed ComfyUI nodes and model files. The adapter sends a prompt to ComfyUI's `/prompt` endpoint and records the returned `prompt_id`. The status endpoint polls ComfyUI history and queue, updates the job to running/succeeded/failed, and returns output file metadata. `GET /api/jobs/:id/outputs/:index` serves a completed job's output only after validating the job state and index; the adapter validates the filename/subfolder/type, limits output size (100 MiB by default), applies a timeout, and checks the returned content type. Output URLs are local API routes, not public ComfyUI URLs. The Image Studio UI can submit text prompts, poll job status, and preview the first returned image/video. It intentionally blocks source-file processing, cloud mode, and non-image workflows until those adapters are implemented. Cancellation, durable job storage, authentication, and multi-user authorization are not implemented yet.

For security, keep ComfyUI and this API on a trusted local network. Do not expose ComfyUI directly to the public internet. Do not set `ALLOW_PUBLIC_BIND=1` on a public server without authentication, rate limiting, and deployment-specific security controls.

Run tests and build:

    npm test
    npm run build

The in-memory job store is development-only and is lost when the process restarts.

## Safety and deployment boundaries
- The API is local-only by default.
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
- [x] Local Node API scaffold, health endpoint, request validation, and adapter-unavailable response
- [x] Optional ComfyUI API workflow submission adapter with automated mock tests
- [x] ComfyUI completion polling and bounded, validated output retrieval
- [x] Connect Image Studio prompt submission, job polling, and first output preview (ComfyUI image/video outputs only)\n- [x] Single-process local runtime serving the built frontend and API from one origin
- [ ] Opt-in cloud adapters with per-job cost estimates
- [ ] Neon schema and migration on a review branch
- [ ] Authenticated production API and end-to-end tests
