import test from 'node:test'
import assert from 'node:assert/strict'
import { createJobService } from '../src/server/job-service.mjs'

const request = { workflow: 'image', prompt: 'A paper sculpture', mode: 'local' }

test('fails closed when the requested inference adapter is not configured', async () => {
  const service = createJobService()
  await assert.rejects(service.submit(request), (error) => {
    assert.equal(error.code, 'INFERENCE_ADAPTER_UNAVAILABLE')
    assert.equal(error.statusCode, 503)
    return true
  })
})

test('submits to the selected adapter and records a queued job', async () => {
  let seen
  const service = createJobService({
    adapters: {
      local: {
        async submit(input, context) {
          seen = { input, context }
          return { status: 'queued' }
        },
      },
    },
  })
  const job = await service.submit(request)
  assert.equal(job.status, 'queued')
  assert.equal(job.workflow, 'image')
  assert.equal(seen.input.prompt, request.prompt)
  assert.equal(seen.context.jobId, job.id)
  assert.equal((await service.get(job.id)).id, job.id)
})

test('does not route local requests to the cloud adapter', async () => {
  const service = createJobService({
    adapters: { cloud: { async submit() { throw new Error('must not be called') } } },
  })
  await assert.rejects(service.submit(request), { code: 'INFERENCE_ADAPTER_UNAVAILABLE' })
})

test('marks adapter submission failures as failed jobs before returning the error', async () => {
  let jobId
  const service = createJobService({
    adapters: {
      local: {
        async submit(_input, context) {
          jobId = context.jobId
          throw new Error('worker offline')
        },
      },
    },
  })
  await assert.rejects(service.submit(request), /worker offline/)
  assert.equal(service.get(jobId).status, 'failed')
})

test('polls external jobs and stores succeeded output metadata', async () => {
  let inspections = 0
  const service = createJobService({
    adapters: { local: {
      async submit() { return { status: 'queued', externalId: 'external-1' } },
      async inspect(id) { inspections++; assert.equal(id, 'external-1'); return { status: 'succeeded', outputs: [{ type: 'image', filename: 'sample.png' }] } },
    } },
  })
  const submitted = await service.submit(request)
  assert.equal(submitted.status, 'queued')
  const completed = await service.get(submitted.id)
  assert.equal(completed.status, 'succeeded')
  assert.equal(completed.outputs[0].filename, 'sample.png')
  assert.equal(inspections, 1)
})

test('polling errors preserve the last known job status', async () => {
  const service = createJobService({
    adapters: { local: {
      async submit() { return { status: 'queued', externalId: 'external-2' } },
      async inspect() { throw new Error('temporary network error') },
    } },
  })
  const submitted = await service.submit(request)
  const polled = await service.get(submitted.id)
  assert.equal(polled.status, 'queued')
})
