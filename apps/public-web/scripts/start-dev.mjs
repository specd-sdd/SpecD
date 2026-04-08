import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirPath = path.dirname(currentFilePath)
const appRootPath = path.resolve(currentDirPath, '..')
const docusaurusCachePath = path.join(appRootPath, '.docusaurus')

/**
 * Removes the generated Docusaurus cache so dev restarts do not keep stale plugin registries.
 */
function clearDocusaurusCache() {
  fs.rmSync(docusaurusCachePath, { recursive: true, force: true })
}

/**
 * Runs the API generation step once before booting the dev server.
 *
 * @returns A child process running the API generation command.
 */
function generateApiDocs() {
  return spawn('node', ['scripts/generate-api-docs.mjs'], {
    cwd: appRootPath,
    env: process.env,
    shell: false,
    stdio: 'inherit',
  })
}

/**
 * Starts the Docusaurus development server.
 *
 * @returns A child process running the Docusaurus dev server.
 */
function startDevServer() {
  return spawn(
    'docusaurus',
    ['start', '--host', '127.0.0.1', '--port', '3000', ...process.argv.slice(2)],
    {
      cwd: appRootPath,
      env: {
        ...process.env,
        CHOKIDAR_USEPOLLING: '1',
        CHOKIDAR_INTERVAL: '1000',
        WATCHPACK_POLLING: 'true',
      },
      shell: false,
      stdio: 'inherit',
    },
  )
}

clearDocusaurusCache()
const generator = generateApiDocs()

generator.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  if (code !== 0) {
    process.exit(code ?? 1)
    return
  }

  const child = startDevServer()

  child.on('exit', (childCode, childSignal) => {
    if (childSignal) {
      process.kill(process.pid, childSignal)
      return
    }

    process.exit(childCode ?? 0)
  })
})
