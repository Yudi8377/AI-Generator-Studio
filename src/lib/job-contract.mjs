export const WORKFLOWS = Object.freeze(['image', 'restore', 'upscale', 'video', 'face', 'three'])
export const EXECUTION_MODES = Object.freeze(['local', 'cloud'])
export const JOB_STATUSES = Object.freeze(['queued', 'running', 'succeeded', 'failed', 'cancelled'])

const transitions = {
  queued: new Set(['running', 'cancelled', 'failed']),
  running: new Set(['succeeded', 'failed', 'cancelled']),
  succeeded: new Set(),
  failed: new Set(),
  cancelled: new Set(),
}

export function createJobRequest({ workflow, prompt, mode = 'local', source = null }) {
  if (!WORKFLOWS.includes(workflow)) throw new TypeError('Unsupported workflow')
  if (!EXECUTION_MODES.includes(mode)) throw new TypeError('Unsupported execution mode')
  if (typeof prompt !== 'string' || !prompt.trim()) throw new TypeError('Prompt is required')
  if (prompt.trim().length > 10_000) throw new RangeError('Prompt exceeds 10000 characters')

  let normalizedSource = null
  if (source !== null) {
    if (typeof source.name !== 'string' || !source.name.trim()) throw new TypeError('Source name is required')
    if (!Number.isSafeInteger(source.size) || source.size < 0) throw new TypeError('Source size must be a non-negative safe integer')
    if (typeof source.type !== 'string') throw new TypeError('Source type must be a string')
    normalizedSource = { name: source.name.trim(), size: source.size, type: source.type }
  }

  return Object.freeze({
    workflow,
    prompt: prompt.trim(),
    mode,
    source: normalizedSource ? Object.freeze(normalizedSource) : null,
  })
}

export function canTransitionJob(from, to) {
  return JOB_STATUSES.includes(from) && JOB_STATUSES.includes(to) && transitions[from].has(to)
}

export function transitionJob(job, nextStatus) {
  if (!job || !JOB_STATUSES.includes(job.status)) throw new TypeError('Invalid current job status')
  if (!JOB_STATUSES.includes(nextStatus)) throw new TypeError('Invalid next job status')
  if (!canTransitionJob(job.status, nextStatus)) {
    throw new Error(`Invalid job status transition: ${job.status} -> ${nextStatus}`)
  }
  return Object.freeze({ ...job, status: nextStatus })
}
