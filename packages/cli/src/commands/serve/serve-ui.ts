import { createApiServer, defaultAuthAdapterRegistry } from '@specd/api'
import { type Command } from 'commander'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { handleError } from '../../handle-error.js'
import { resolveServeAuth } from './serve-api.js'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 4400

/**
 * Resolves the default built `@specd/ui` dist directory relative to the CLI package.
 *
 * @returns Absolute path to the UI dist folder
 * @throws {Error} When no built `index.html` is found under known dist paths
 */
function defaultUiDistPath(): string {
  const fromCwd = path.join(process.cwd(), 'apps/specd-studio-web/dist')
  if (fs.existsSync(path.join(fromCwd, 'index.html'))) {
    return fromCwd
  }
  const cliDistDir = path.dirname(fileURLToPath(import.meta.url))
  const fromCli = path.resolve(cliDistDir, '../../..', 'apps/specd-studio-web/dist')
  if (fs.existsSync(path.join(fromCli, 'index.html'))) {
    return fromCli
  }
  throw new Error(
    `Studio web build not found. From repo root run: pnpm --filter @specd/studio-web build\n` +
      `  Tried: ${fromCwd}\n  Tried: ${fromCli}`,
  )
}

/**
 * Opens a URL in the system default browser (best-effort, detached).
 *
 * @param url - URL to open.
 */
function openBrowser(url: string): void {
  const platform = process.platform
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open'
  spawn(command, [url], { detached: true, stdio: 'ignore' }).unref()
}

/**
 * Registers `specd ui serve` — API plus static `@specd/ui` on one origin.
 *
 * @param uiCmd - Parent `ui` Commander command.
 */
export function registerServeUi(uiCmd: Command): void {
  uiCmd
    .command('serve')
    .description('Start embedded SpecD Studio (API + static UI on one origin).')
    .option('-p, --port <number>', 'listen port', String(DEFAULT_PORT))
    .option('-h, --host <host>', 'bind host', DEFAULT_HOST)
    .option('-c, --config <path>', 'path to specd.yaml')
    .option('--auth <type>', 'auth override (v1: disabled only)')
    .option('-o, --open', 'open the IDE in the default browser after start')
    .option('--ui-dist <path>', 'path to built @specd/ui dist directory')
    .action(
      async (opts: {
        port: string
        host: string
        config?: string
        auth?: string
        open?: boolean
        uiDist?: string
      }) => {
        try {
          const port = Number(opts.port)
          if (!Number.isFinite(port) || port <= 0) {
            throw new Error(`Invalid port: ${opts.port}`)
          }

          const { config } = await resolveCliContext({ configPath: opts.config })
          const auth = resolveServeAuth(opts.auth, config.api?.auth.type ?? 'disabled')
          const uiDistPath = opts.uiDist ?? defaultUiDistPath()

          const server = await createApiServer({
            projectRoot: config.projectRoot,
            host: opts.host,
            port,
            auth,
            authRegistry: defaultAuthAdapterRegistry(),
            uiDistPath,
          })

          const appUrl = await server.listen()
          process.stderr.write(`specd Studio listening at ${appUrl}\n`)
          process.stderr.write(`API: ${appUrl}/v1\n`)
          process.stderr.write(`UI dist: ${uiDistPath}\n`)
          process.stderr.write('Press Ctrl+C to stop.\n')

          if (opts.open === true) {
            openBrowser(appUrl)
          }

          await new Promise<void>((resolve) => {
            const shutdown = () => {
              void server
                .close()
                .then(resolve)
                .catch((err: unknown) => {
                  handleError(err, 'text')
                })
            }
            process.once('SIGINT', shutdown)
            process.once('SIGTERM', shutdown)
          })
        } catch (err) {
          handleError(err, 'text')
        }
      },
    )
}
