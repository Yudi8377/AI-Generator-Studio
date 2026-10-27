import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { createJobService } from './job-service.mjs'
import { createComfyUIAdapter } from './comfyui-adapter.mjs'

const MAX_BODY_BYTES = 32 * 1024

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(JSON.stringify(body))
}

async function readJson(request) {
  const chunks = []
  let bytes = 0
  for await (const chunk of request) {
    bytes += chunk.length
    if (bytes > MAX_BODY_BYTES) {
      const error = new Error('Request body too large')
      error.statusCode = 413
      throw error
    }
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    const error = new Error('Request body must be valid JSON')
    error.statusCode = 400
    throw error
  }
}

export function createApiServer({ jobService = createJobService(), inference = 'not-configured' } = {}) {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')

    if (request.method === 'GET' && url.pathname === '/healthz') {
      return sendJson(response, 200, { ok: true, service: 'ai-generator-studio-api', inference })
    }

    if (request.method === 'POST' && url.pathname === '/api/jobs') {
      try {
        const body = await readJson(request)
        const job = await jobService.submit(body)
        return sendJson(response, 202, { job })
      } catch (error) {
        const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 400
        const code = error.code ?? (statusCode === 400 ? 'INVALID_REQUEST' : 'REQUEST_FAILED')
        return sendJson(response, statusCode, { error: { code, message: error.message } })
      }
    }

    const match = request.method === 'GET' && url.pathname.match(/^\\/api\\/jobs\\/([0-9a-f-]{36})$/i)
    if (match) {
      const job = jobService.get(match[1])
      return job
        ? sendJson(response, 200, { job })
        : sendJson(response, 404, { error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } })
    }

    return sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Route not found' } })
  })
}

function configuredAdapters() {
  const baseUrl = process.env.COMFYUI_URL
  const workflowPath = process.env.COMFYUI_WORKFLOW_PATH
  const promptNodeId = process.env.COMFYUI_PROMPT_NODE_ID
  if (!baseUrl && !workflowPath && !promptNodeId) return { adapters: {}, inference: 'not-configured' }
  if (!baseUrl || !workflowPath || !promptNodeId) {
    throw new Error('Configure COMFYUI_URL, COMFYUI_WORKFLOW_PATH, and COMFYUI_PROMPT_NODE_ID together')
  }

  const workflow = JSON.parse(readFileSync(workflowPath, 'utf8'))
  const adapter = createComfyUIAdapter({
    baseUrl,
    workflow,
    promptNodeId,
    promptInput: process.env.COMFYUI_PROMPT_INPUT || 'text',
  })
  return { adapters: { local: adapter }, inference: 'comfyui-configured' }
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const host = process.env.HOST || '127.0.0.1'
  const port = Number.parseInt(process.env.PORT || '8787', 10)
  if (host !== '127.0.0.1' && process.env.ALLOW_PUBLIC_BIND !== '1') {
    throw new Error('Public bind is disabled by default. Set ALLOW_PUBLIC_BIND=1 only behind a secured deployment.')
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535')
  const { adapters, inference } = configuredAdapters()
  createApiServer({ jobService: createJobService({ adapters }), inference }).listen(port, host, () => {
    process.stdout.write(`AI Generator Studio API listening on http://${host}:${port} (inference: ${inference})\\n`)
  })
}
