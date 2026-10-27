import test from 'node:test'
import assert from 'node:assert/strict'
import { createApiServer } from '../src/server/http-server.mjs'

async function withServer(run) {
  const server = createApiServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

test('health endpoint reports API readiness without claiming inference is ready', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + '/healthz')
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      ok: true,
      service: 'ai-generator-studio-api',
      inference: 'not-configured',
    })
  })
})

test('job endpoint returns explicit 503 while inference adapter is unavailable', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workflow: 'image', prompt: 'test', mode: 'local' }),
    })
    assert.equal(response.status, 503)
    assert.equal((await response.json()).error.code, 'INFERENCE_ADAPTER_UNAVAILABLE')
  })
})

test('rejects malformed JSON and unknown routes', async () => {
  await withServer(async (baseUrl) => {
    const malformed = await fetch(baseUrl + '/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    })
    assert.equal(malformed.status, 400)
    const missing = await fetch(baseUrl + '/not-a-route')
    assert.equal(missing.status, 404)
  })
})
