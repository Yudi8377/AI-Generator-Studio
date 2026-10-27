const DEFAULT_TIMEOUT_MS = 15_000

export function createComfyUIAdapter({
  baseUrl,
  workflow,
  promptNodeId,
  promptInput = 'text',
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) throw new TypeError('ComfyUI baseUrl is required')
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) throw new TypeError('A ComfyUI API workflow object is required')
  if (typeof promptNodeId !== 'string' || !promptNodeId.trim()) throw new TypeError('ComfyUI promptNodeId is required')
  if (typeof promptInput !== 'string' || !promptInput.trim()) throw new TypeError('ComfyUI promptInput is required')
  const endpoint = new URL('/prompt', baseUrl).toString()

  return {
    async submit(request) {
      const prompt = structuredClone(workflow)
      const node = prompt[promptNodeId]
      if (!node || !node.inputs || !(promptInput in node.inputs)) {
        const error = new Error(`Configured prompt input ${promptNodeId}.${promptInput} was not found in the workflow`)
        error.code = 'COMFYUI_WORKFLOW_PROMPT_INPUT_MISSING'
        error.statusCode = 422
        throw error
      }
      node.inputs[promptInput] = request.prompt

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      let response
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ prompt }),
          signal: controller.signal,
        })
      } catch (cause) {
        const error = new Error(cause?.name === 'AbortError' ? 'ComfyUI request timed out' : 'Could not reach ComfyUI')
        error.code = cause?.name === 'AbortError' ? 'COMFYUI_TIMEOUT' : 'COMFYUI_UNREACHABLE'
        error.statusCode = 502
        throw error
      } finally {
        clearTimeout(timeout)
      }

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const error = new Error(`ComfyUI rejected the workflow (HTTP ${response.status})`)
        error.code = 'COMFYUI_REJECTED_WORKFLOW'
        error.statusCode = 502
        throw error
      }
      if (typeof payload?.prompt_id !== 'string' || !payload.prompt_id) {
        const error = new Error('ComfyUI response did not include prompt_id')
        error.code = 'COMFYUI_INVALID_RESPONSE'
        error.statusCode = 502
        throw error
      }
      return { status: 'queued', externalId: payload.prompt_id }
    },
  }
}
