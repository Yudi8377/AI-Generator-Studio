import test from 'node:test'
import assert from 'node:assert/strict'
import { canTransitionJob, createJobRequest, transitionJob } from '../src/lib/job-contract.mjs'

test('creates a normalized provider-neutral request without media bytes or credentials', () => {
  const request = createJobRequest({
    workflow: 'image',
    prompt: '  A quiet modernist pavilion  ',
    mode: 'cloud',
    source: { name: 'reference.png', size: 1200, type: 'image/png' },
  })
  assert.deepEqual(request, {
    workflow: 'image',
    prompt: 'A quiet modernist pavilion',
    mode: 'cloud',
    source: { name: 'reference.png', size: 1200, type: 'image/png' },
  })
  assert.equal('apiKey' in request, false)
  assert.equal('bytes' in request.source, false)
})

test('rejects invalid workflow, mode, empty prompt, and excessive prompt', () => {
  assert.throws(() => createJobRequest({ workflow: 'unknown', prompt: 'x' }), /Unsupported workflow/)
  assert.throws(() => createJobRequest({ workflow: 'image', prompt: 'x', mode: 'remote' }), /Unsupported execution mode/)
  assert.throws(() => createJobRequest({ workflow: 'image', prompt: '  ' }), /Prompt is required/)
  assert.throws(() => createJobRequest({ workflow: 'image', prompt: 'x'.repeat(10001) }), /exceeds/)
})

test('allows only declared lifecycle transitions', () => {
  assert.equal(canTransitionJob('queued', 'running'), true)
  assert.equal(canTransitionJob('running', 'succeeded'), true)
  assert.equal(canTransitionJob('succeeded', 'running'), false)
  assert.equal(canTransitionJob('unknown', 'running'), false)
  const running = transitionJob({ id: 'job-1', status: 'queued' }, 'running')
  assert.deepEqual(running, { id: 'job-1', status: 'running' })
  assert.throws(() => transitionJob(running, 'queued'), /Invalid job status transition/)
})
