import { spawn } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const build = spawn(npmCommand, ['run', 'build'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

build.on('error', (error) => {
  process.stderr.write(`Could not start the build command: ${error.message}\n`)
  process.exitCode = 1
})

build.on('exit', (code) => {
  if (code !== 0) {
    process.exitCode = code ?? 1
    return
  }

  const api = spawn(process.execPath, ['src/server/http-server.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, SERVE_FRONTEND: '1' },
  })
  const stop = () => api.kill('SIGINT')
  process.once('SIGINT', stop)
  process.once('SIGTERM', () => api.kill('SIGTERM'))
  api.on('error', (error) => {
    process.stderr.write(`Could not start local API: ${error.message}\n`)
    process.exitCode = 1
  })
  api.on('exit', (apiCode) => {
    process.exitCode = apiCode ?? 0
  })
})
