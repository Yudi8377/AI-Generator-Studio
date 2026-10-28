import test from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
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


test('output route serves bytes with safe media headers', async () => {
  const id = '123e4567-e89b-12d3-a456-426614174000'
  const server = createApiServer({
    jobService: {
      async getOutput(jobId, index) {
        assert.equal(jobId, id)
        assert.equal(index, 0)
        return { body: Buffer.from('image-bytes'), contentType: 'image/png', filename: 'render.png' }
      },
      async get() { return null },
      async submit() { throw new Error('unused') },
    },
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/jobs/${id}/outputs/0`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/png')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(await response.text(), 'image-bytes')
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('output route maps job service errors to structured HTTP errors', async () => {
  const id = '123e4567-e89b-12d3-a456-426614174000'
  const server = createApiServer({
    jobService: {
      async getOutput() { throw Object.assign(new Error('Job not found'), { code: 'JOB_NOT_FOUND', statusCode: 404 }) },
      async get() { return null },
      async submit() { throw new Error('unused') },
    },
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/jobs/${id}/outputs/0`)
    assert.equal(response.status, 404)
    assert.equal((await response.json()).error.code, 'JOB_NOT_FOUND')
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})


test('optional static hosting serves the built app and known assets only', async () => {
  const staticDir = await mkdtemp(join(tmpdir(), 'ai-generator-static-'))
  await mkdir(join(staticDir, 'assets'))
  await writeFile(join(staticDir, 'index.html'), '<!doctype html><title>Studio</title>')
  await writeFile(join(staticDir, 'assets', 'app.js'), 'console.log("studio")')
  const server = createApiServer({ staticDir: resolve(staticDir) })
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  try {
    const root = await fetch(`http://127.0.0.1:${address.port}/`)
    assert.equal(root.status, 200)
    assert.match(root.headers.get('content-type') || '', /text\/html/)
    assert.match(await root.text(), /Studio/)

    const asset = await fetch(`http://127.0.0.1:${address.port}/assets/app.js`)
    assert.equal(asset.status, 200)
    assert.match(asset.headers.get('content-type') || '', /javascript/)
    assert.match(await asset.text(), /console\.log/)

    const missing = await fetch(`http://127.0.0.1:${address.port}/assets/missing.js`)
    assert.equal(missing.status, 404)
  } finally {
    server.closeAllConnections?.()
    await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()))
    await rm(staticDir, { recursive: true, force: true })
  }
})


test('readiness endpoint returns 503 until inference is actually reachable', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + '/readyz')
    assert.equal(response.status, 503)
    const payload = await response.json()
    assert.equal(payload.ok, false)
    assert.equal(payload.error.code, 'INFERENCE_ADAPTER_UNAVAILABLE')
  })
})

test('readiness endpoint returns 200 after adapter health succeeds', async () => {
  const server = createApiServer({
    inference: 'comfyui-configured',
    jobService: {
      async checkInference() { return { ok: true } },
      async get() { return null },
      async getOutput() { throw new Error('unused') },
      async submit() { throw new Error('unused') },
    },
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/readyz`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true, service: 'ai-generator-studio-api', inference: 'comfyui-ready' })
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})
