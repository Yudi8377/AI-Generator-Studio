const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_OUTPUT_BYTES = 100 * 1024 * 1024
const ALLOWED_OUTPUT_TYPES = new Map([
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'],
  ['.gif', 'image/gif'], ['.mp4', 'video/mp4'], ['.webm', 'video/webm'],
])

function makeError(message, code, statusCode = 502) {
  return Object.assign(new Error(message), { code, statusCode })
}

async function jsonRequest(fetchImpl, url, timeoutMs, init = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal, headers: { accept: 'application/json', ...init.headers } })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw makeError(`ComfyUI returned HTTP ${response.status}`, 'COMFYUI_HTTP_ERROR')
    return payload
  } catch (cause) {
    if (cause?.code) throw cause
    throw makeError(cause?.name === 'AbortError' ? 'ComfyUI request timed out' : 'Could not reach ComfyUI', cause?.name === 'AbortError' ? 'COMFYUI_TIMEOUT' : 'COMFYUI_UNREACHABLE')
  } finally {
    clearTimeout(timeout)
  }
}

function collectOutputs(outputs = {}) {
  const files = []
  for (const [nodeId, value] of Object.entries(outputs)) {
    for (const key of ['images', 'videos', 'gifs']) {
      for (const item of Array.isArray(value?.[key]) ? value[key] : []) {
        if (typeof item?.filename !== 'string' || !item.filename) continue
        files.push({ nodeId, type: key === 'images' ? 'image' : 'video', filename: item.filename, subfolder: typeof item.subfolder === 'string' ? item.subfolder : '', contentType: typeof item.type === 'string' ? item.type : 'output' })
      }
    }
  }
  return files
}

function validateOutputMetadata(output) {
  if (!output || typeof output.filename !== 'string' || output.filename.length > 255 ||
      output.filename === '.' || output.filename === '..' || /[\\/\0]/.test(output.filename)) {
    throw makeError('Invalid output metadata', 'INVALID_OUTPUT_METADATA', 400)
  }
  if (typeof output.subfolder !== 'string' || output.subfolder.length > 1024 ||
      output.subfolder.startsWith('/') || output.subfolder.includes('\\') ||
      output.subfolder.split('/').some((part) => part === '.' || part === '..' || part.includes('\0'))) {
    throw makeError('Invalid output metadata', 'INVALID_OUTPUT_METADATA', 400)
  }
  const extension = output.filename.slice(output.filename.lastIndexOf('.')).toLowerCase()
  const contentType = ALLOWED_OUTPUT_TYPES.get(extension)
  if (!contentType) throw makeError('Output media type is not allowed', 'OUTPUT_TYPE_NOT_ALLOWED', 415)
  if (!['output', 'temp', 'input'].includes(output.contentType)) {
    throw makeError('Invalid ComfyUI output type', 'INVALID_OUTPUT_METADATA', 400)
  }
  return { contentType, filename: output.filename }
}

async function readBoundedBody(response, maxBytes) {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw makeError('ComfyUI output exceeds the configured size limit', 'OUTPUT_TOO_LARGE', 413)
  }
  if (!response.body) return Buffer.alloc(0)
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        throw makeError('ComfyUI output exceeds the configured size limit', 'OUTPUT_TOO_LARGE', 413)
      }
      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, total)
}

export function createComfyUIAdapter({ baseUrl, workflow, promptNodeId, promptInput = 'text', fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES }) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) throw new TypeError('ComfyUI baseUrl is required')
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) throw new TypeError('A ComfyUI API workflow object is required')
  if (typeof promptNodeId !== 'string' || !promptNodeId.trim()) throw new TypeError('ComfyUI promptNodeId is required')
  if (typeof promptInput !== 'string' || !promptInput.trim()) throw new TypeError('ComfyUI promptInput is required')
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1) throw new TypeError('maxOutputBytes must be a positive integer')
  const root = new URL(baseUrl)
  if (!['http:', 'https:'].includes(root.protocol)) throw new TypeError('ComfyUI baseUrl must use HTTP or HTTPS')
  const endpoint = (path) => new URL(path, root.toString().endsWith('/') ? root : root.toString() + '/').toString()

  return {
    async submit(request) {
      const prompt = structuredClone(workflow)
      const node = prompt[promptNodeId]
      if (!node?.inputs || !(promptInput in node.inputs)) throw makeError(`Configured prompt input ${promptNodeId}.${promptInput} was not found in the workflow`, 'COMFYUI_WORKFLOW_PROMPT_INPUT_MISSING', 422)
      node.inputs[promptInput] = request.prompt
      const payload = await jsonRequest(fetchImpl, endpoint('/prompt'), timeoutMs, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }) })
      if (typeof payload?.prompt_id !== 'string' || !payload.prompt_id) throw makeError('ComfyUI response did not include prompt_id', 'COMFYUI_INVALID_RESPONSE')
      return { status: 'queued', externalId: payload.prompt_id }
    },

    async inspect(externalId) {
      const history = await jsonRequest(fetchImpl, endpoint(`/history/${encodeURIComponent(externalId)}`), timeoutMs)
      const record = history?.[externalId]
      if (record) {
        const status = record.status ?? {}
        if (status.status_str === 'error' || (Array.isArray(status.messages) && status.messages.some((m) => JSON.stringify(m).includes('execution_error')))) {
          return { status: 'failed', error: 'ComfyUI reported an execution error' }
        }
        if (status.completed === true) return { status: 'succeeded', outputs: collectOutputs(record.outputs) }
        return { status: 'running' }
      }
      const queue = await jsonRequest(fetchImpl, endpoint('/queue'), timeoutMs)
      const hasId = (items) => Array.isArray(items) && items.some((item) => item?.[1] === externalId)
      if (hasId(queue?.queue_running)) return { status: 'running' }
      return { status: 'queued' }
    },

    async health() {
      const payload = await jsonRequest(fetchImpl, endpoint('/system_stats'), timeoutMs)
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw makeError('ComfyUI returned an invalid health response', 'COMFYUI_INVALID_HEALTH_RESPONSE')
      }
      return { ok: true }
    },

    async downloadOutput(output) {
      const safe = validateOutputMetadata(output)
      const url = new URL(endpoint('/view'))
      url.searchParams.set('filename', safe.filename)
      url.searchParams.set('subfolder', output.subfolder)
      url.searchParams.set('type', output.contentType)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetchImpl(url, { signal: controller.signal, headers: { accept: safe.contentType } })
        if (!response.ok) throw makeError(`ComfyUI returned HTTP ${response.status} for output retrieval`, 'COMFYUI_OUTPUT_HTTP_ERROR')
        const body = await readBoundedBody(response, maxOutputBytes)
        const upstreamType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
        if (upstreamType && upstreamType !== 'application/octet-stream' && upstreamType !== safe.contentType) {
          throw makeError('ComfyUI output content type does not match its file extension', 'OUTPUT_TYPE_MISMATCH', 502)
        }
        return { body, contentType: safe.contentType, filename: safe.filename }
      } catch (cause) {
        if (cause?.code) throw cause
        throw makeError(cause?.name === 'AbortError' ? 'ComfyUI output retrieval timed out' : 'Could not retrieve output from ComfyUI', cause?.name === 'AbortError' ? 'COMFYUI_TIMEOUT' : 'COMFYUI_OUTPUT_UNREACHABLE')
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}
