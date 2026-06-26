import { spawn } from 'node:child_process'
import process from 'node:process'

const repoRoot = process.cwd()
const port = Number(process.env.STUDIO_E2E_PORT ?? 4450)
const apiBaseUrl = process.env.STUDIO_E2E_BASE_URL ?? `http://127.0.0.1:${port}`
// Vite dev server binds to localhost (often ::1); 127.0.0.1 can refuse connections.
const uiBaseUrl = process.env.STUDIO_E2E_UI_BASE_URL ?? 'http://localhost:5174'
const healthUrl = `${apiBaseUrl.replace(/\/$/, '')}/v1/health`
const rawPlaywrightArgs = process.argv.slice(2)
const playwrightArgs =
  rawPlaywrightArgs[0] === '--' ? rawPlaywrightArgs.slice(1) : rawPlaywrightArgs

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: false,
      ...options,
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} ${args.join(' ')} failed with code ${code ?? 'null'} signal ${signal ?? 'none'}`))
    })
  })
}

async function waitForHealth(timeoutMs = 30_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(2_000),
      })
      if (response.ok) return
    } catch {
      // Poll until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Studio health endpoint did not become ready: ${healthUrl}`)
}

async function main() {
  await run('pnpm', ['--filter', '@specd/cli', 'build'])
  await run('pnpm', ['--filter', '@specd/ui', 'build'])
  await run('pnpm', ['--filter', '@specd/studio-web', 'build'])

  const server = spawn(
    'node',
    ['packages/cli/dist/index.js', 'ui', 'serve', '-p', String(port)],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: false,
    },
  )

  const shutdown = () => {
    if (!server.killed) {
      server.kill('SIGTERM')
    }
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  try {
    await waitForHealth()
    await run(
      'pnpm',
      ['--dir', 'apps/specd-studio-web', 'exec', 'playwright', 'test', ...playwrightArgs],
      {
        env: {
          ...process.env,
          CI: process.env.CI ?? '1',
          STUDIO_E2E_PORT: String(port),
          STUDIO_E2E_BASE_URL: apiBaseUrl,
          STUDIO_E2E_UI_BASE_URL: uiBaseUrl,
        },
      },
    )
  } finally {
    shutdown()
    await new Promise((resolve) => server.once('exit', () => resolve()))
  }
}

await main()
