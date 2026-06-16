import process from 'node:process'

const port = Number(process.env.STUDIO_E2E_PORT ?? 4450)
const baseUrl = process.env.STUDIO_E2E_BASE_URL ?? `http://127.0.0.1:${port}`
const healthUrl = `${baseUrl.replace(/\/$/, '')}/v1/health`
const timeoutMs = Number(process.env.STUDIO_E2E_HEALTH_TIMEOUT_MS ?? 20_000)

async function waitForHealth() {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(2_000),
      })
      if (response.ok) {
        process.stdout.write(`Studio E2E ready: ${healthUrl}\n`)
        return
      }
    } catch {
      // Poll until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  process.stderr.write(
    `Studio E2E is not ready. Expected health endpoint at ${healthUrl} within ${timeoutMs}ms.\n`,
  )
  process.stderr.write(
    'Start `node packages/cli/dist/index.js ui serve -p 4450` or use `pnpm studio-web:test:e2e`.\n',
  )
  process.exit(1)
}

await waitForHealth()
