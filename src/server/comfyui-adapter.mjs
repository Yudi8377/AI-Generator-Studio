const DEFAULT_TIMEOUT_MS = 15_000

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

export function createComfyUIAdapter({ baseUrl, workflow, promptNodeId, promptInput = 'text', fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) throw new TypeError('ComfyUI baseUrl is required')
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) throw new TypeError('A ComfyUI API workflow object is required')
  if (typeof promptNodeId !== 'string' || !promptNodeId.trim()) throw new TypeError('ComfyUI promptNodeId is required')
  if (typeof promptInput !== 'string' || !promptInput.trim()) throw new TypeError('ComfyUI promptInput is required')
  const root = new URL(baseUrl)
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
  }
}
