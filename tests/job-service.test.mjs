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
  assert.equal(service.get(job.id).id, job.id)
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
