import { randomUUID } from 'node:crypto'
import { createJobRequest, transitionJob } from '../lib/job-contract.mjs'

function serviceError(message, code, statusCode) {
  return Object.assign(new Error(message), { code, statusCode })
}

export function createJobService({ adapters = {} } = {}) {
  const jobs = new Map()
  const adapterFor = (job) => adapters[job.mode === 'local' ? 'local' : 'cloud']

  return {
    async submit(input) {
      const request = createJobRequest(input)
      const adapterKey = request.mode === 'local' ? 'local' : 'cloud'
      const adapter = adapters[adapterKey]
      if (!adapter || typeof adapter.submit !== 'function') {
        const error = new Error(`No ${adapterKey} inference adapter is configured`)
        error.code = 'INFERENCE_ADAPTER_UNAVAILABLE'
        error.statusCode = 503
        throw error
      }
      const job = Object.freeze({
        id: randomUUID(), status: 'queued', workflow: request.workflow, mode: request.mode,
        prompt: request.prompt, source: request.source, createdAt: new Date().toISOString(),
      })
      jobs.set(job.id, job)
      try {
        const accepted = await adapter.submit(request, { jobId: job.id })
        const updated = Object.freeze({
          ...(accepted?.status === 'running' ? transitionJob(job, 'running') : job),
          ...(typeof accepted?.externalId === 'string' ? { externalId: accepted.externalId } : {}),
        })
        jobs.set(job.id, updated)
        return updated
      } catch (error) {
        jobs.set(job.id, transitionJob(job, 'failed'))
        throw error
      }
    },

    async get(jobId) {
      let job = jobs.get(jobId)
      if (!job) return null
      if (!job.externalId || !['queued', 'running'].includes(job.status)) return job
      const adapter = adapterFor(job)
      if (typeof adapter?.inspect !== 'function') return job
      try {
        const inspected = await adapter.inspect(job.externalId)
        if (!inspected || !['queued', 'running', 'succeeded', 'failed'].includes(inspected.status)) return job
        if (inspected.status === 'queued') return job
        if (inspected.status === 'failed') {
          job = transitionJob(job, 'failed')
        } else {
          if (job.status === 'queued') job = transitionJob(job, 'running')
          if (inspected.status === 'succeeded') job = transitionJob(job, 'succeeded')
        }
        const additions = {}
        if (Array.isArray(inspected.outputs)) additions.outputs = inspected.outputs
        if (typeof inspected.error === 'string') additions.error = inspected.error
        job = Object.freeze({ ...job, ...additions, updatedAt: new Date().toISOString() })
        jobs.set(jobId, job)
        return job
      } catch {
        // A transient polling failure must not erase the last known job status.
        return job
      }
    },

    async getOutput(jobId, outputIndex) {
      if (!Number.isSafeInteger(outputIndex) || outputIndex < 0) {
        throw serviceError('Output index must be a non-negative integer', 'INVALID_OUTPUT_INDEX', 400)
      }
      const job = await this.get(jobId)
      if (!job) throw serviceError('Job not found', 'JOB_NOT_FOUND', 404)
      if (job.status !== 'succeeded') {
        throw serviceError('Outputs are available only after a job succeeds', 'JOB_OUTPUT_NOT_READY', 409)
      }
      if (!Array.isArray(job.outputs) || outputIndex >= job.outputs.length) {
        throw serviceError('Output not found for this job', 'OUTPUT_NOT_FOUND', 404)
      }
      const adapter = adapterFor(job)
      if (typeof adapter?.downloadOutput !== 'function') {
        throw serviceError('Output retrieval is not supported by this adapter', 'OUTPUT_RETRIEVAL_UNAVAILABLE', 503)
      }
      return adapter.downloadOutput(job.outputs[outputIndex])
    },
  }
}
