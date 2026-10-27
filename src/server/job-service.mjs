import { randomUUID } from 'node:crypto'
import { createJobRequest, transitionJob } from '../lib/job-contract.mjs'

export function createJobService({ adapters = {} } = {}) {
  const jobs = new Map()

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
        id: randomUUID(),
        status: 'queued',
        workflow: request.workflow,
        mode: request.mode,
        prompt: request.prompt,
        source: request.source,
        createdAt: new Date().toISOString(),
      })
      jobs.set(job.id, job)

      try {
        const accepted = await adapter.submit(request, { jobId: job.id })
        const nextStatus = accepted?.status === 'running' ? 'running' : 'queued'
        const updated = transitionJob(job, nextStatus)
        jobs.set(job.id, updated)
        return updated
      } catch (error) {
        const failed = transitionJob(job, 'failed')
        jobs.set(job.id, failed)
        throw error
      }
    },

    get(jobId) {
      return jobs.get(jobId) ?? null
    },
  }
}
