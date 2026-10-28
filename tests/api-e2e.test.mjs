import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createApiServer } from '../src/server/http-server.mjs'
import { createJobService } from '../src/server/job-service.mjs'
import { createComfyUIAdapter } from '../src/server/comfyui-adapter.mjs'

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${server.address().port}`
}

async function close(server) {
  server.closeAllConnections?.()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

test('end-to-end API submits a ComfyUI job, polls completion, and serves its media', async () => {
  const imageBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
  const comfy = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    if (request.method === 'POST' && url.pathname === '/prompt') {
      request.resume()
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ prompt_id: 'e2e-prompt-1' }))
      return
    }
    if (request.method === 'GET' && url.pathname === '/history/e2e-prompt-1') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        'e2e-prompt-1': {
          status: { completed: true, status_str: 'success' },
          outputs: { '9': { images: [{ filename: 'render.png', subfolder: 'output', type: 'output' }] } },
        },
      }))
      return
    }
    if (request.method === 'GET' && url.pathname === '/view') {
      assert.equal(url.searchParams.get('filename'), 'render.png')
      assert.equal(url.searchParams.get('subfolder'), 'output')
      response.writeHead(200, { 'content-type': 'image/png', 'content-length': imageBytes.length })
      response.end(imageBytes)
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'not found' }))
  })
  const comfyUrl = await listen(comfy)
  const workflow = { '6': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['1', 0] } } }
  const adapter = createComfyUIAdapter({ baseUrl: comfyUrl, workflow, promptNodeId: '6' })
  const jobService = createJobService({ adapters: { local: adapter } })
  const api = createApiServer({ jobService, inference: 'comfyui-configured' })
  const apiUrl = await listen(api)

  try {
    const submitResponse = await fetch(`${apiUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workflow: 'image', prompt: 'A quiet paper garden', mode: 'local' }),
    })
    assert.equal(submitResponse.status, 202)
    const submitted = await submitResponse.json()
    assert.equal(submitted.job.status, 'queued')

    const statusResponse = await fetch(`${apiUrl}/api/jobs/${submitted.job.id}`)
    assert.equal(statusResponse.status, 200)
    const status = await statusResponse.json()
    assert.equal(status.job.status, 'succeeded')
    assert.equal(status.job.outputs[0].filename, 'render.png')

    const outputResponse = await fetch(`${apiUrl}/api/jobs/${submitted.job.id}/outputs/0`)
    assert.equal(outputResponse.status, 200)
    assert.equal(outputResponse.headers.get('content-type'), 'image/png')
    assert.deepEqual(Buffer.from(await outputResponse.arrayBuffer()), imageBytes)
  } finally {
    await close(api)
    await close(comfy)
  }
})
