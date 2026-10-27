import test from 'node:test'
import assert from 'node:assert/strict'
import { createComfyUIAdapter } from '../src/server/comfyui-adapter.mjs'

const workflow = { '6': { class_type: 'CLIPTextEncode', inputs: { text: 'placeholder', clip: ['1', 0] } } }

test('injects the prompt into the configured node and returns ComfyUI prompt id', async () => {
  let request
  const adapter = createComfyUIAdapter({
    baseUrl: 'http://127.0.0.1:8188',
    workflow,
    promptNodeId: '6',
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) }
      return new Response(JSON.stringify({ prompt_id: 'comfy-prompt-123' }), { status: 200 })
    },
  })
  const result = await adapter.submit({ prompt: 'A quiet paper garden' })
  assert.equal(request.url, 'http://127.0.0.1:8188/prompt')
  assert.equal(request.body.prompt['6'].inputs.text, 'A quiet paper garden')
  assert.equal(workflow['6'].inputs.text, 'placeholder', 'configured workflow is not mutated')
  assert.deepEqual(result, { status: 'queued', externalId: 'comfy-prompt-123' })
})

test('reports a missing prompt input before making a network request', async () => {
  let called = false
  const adapter = createComfyUIAdapter({
    baseUrl: 'http://127.0.0.1:8188',
    workflow,
    promptNodeId: 'missing',
    fetchImpl: async () => { called = true },
  })
  await assert.rejects(adapter.submit({ prompt: 'test' }), { code: 'COMFYUI_WORKFLOW_PROMPT_INPUT_MISSING', statusCode: 422 })
  assert.equal(called, false)
})

test('maps an unreachable ComfyUI service to a clear gateway error', async () => {
  const adapter = createComfyUIAdapter({
    baseUrl: 'http://127.0.0.1:8188',
    workflow,
    promptNodeId: '6',
    fetchImpl: async () => { throw new TypeError('connection refused') },
  })
  await assert.rejects(adapter.submit({ prompt: 'test' }), { code: 'COMFYUI_UNREACHABLE', statusCode: 502 })
})

test('rejects successful HTTP responses without a prompt id', async () => {
  const adapter = createComfyUIAdapter({
    baseUrl: 'http://127.0.0.1:8188',
    workflow,
    promptNodeId: '6',
    fetchImpl: async () => new Response('{}', { status: 200 }),
  })
  await assert.rejects(adapter.submit({ prompt: 'test' }), { code: 'COMFYUI_INVALID_RESPONSE', statusCode: 502 })
})

test('inspects completed history and extracts output metadata without claiming a public URL', async () => {
  const adapter = createComfyUIAdapter({
    baseUrl: 'http://127.0.0.1:8188',
    workflow,
    promptNodeId: '6',
    fetchImpl: async (url) => {
      assert.equal(url, 'http://127.0.0.1:8188/history/comfy-prompt-123')
      return new Response(JSON.stringify({
        'comfy-prompt-123': {
          status: { completed: true, status_str: 'success' },
          outputs: { '9': { images: [{ filename: 'render.png', subfolder: 'output', type: 'output' }] } },
        },
      }), { status: 200 })
    },
  })
  assert.deepEqual(await adapter.inspect('comfy-prompt-123'), {
    status: 'succeeded',
    outputs: [{ nodeId: '9', type: 'image', filename: 'render.png', subfolder: 'output', contentType: 'output' }],
  })
})

test('reports running status when prompt appears in ComfyUI running queue', async () => {
  let count = 0
  const adapter = createComfyUIAdapter({
    baseUrl: 'http://127.0.0.1:8188',
    workflow,
    promptNodeId: '6',
    fetchImpl: async (url) => {
      count++
      if (url.endsWith('/history/comfy-prompt-123')) return new Response('{}', { status: 200 })
      return new Response(JSON.stringify({ queue_running: [[0, 'comfy-prompt-123']], queue_pending: [] }), { status: 200 })
    },
  })
  assert.deepEqual(await adapter.inspect('comfy-prompt-123'), { status: 'running' })
  assert.equal(count, 2)
})
