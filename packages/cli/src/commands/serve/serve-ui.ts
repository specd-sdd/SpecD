import { createApiServer, defaultAuthAdapterRegistry } from '@specd/api'
import { type Command } from 'commander'
import { spawn } from 'node:child_process'
import type { UiServeContext } from '@specd/plugin-manager'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { resolveUiServeCorsOrigins } from '../../helpers/resolve-ui-serve-cors.js'
import { loadActiveUiPlugin } from '../../helpers/resolve-ui-plugin.js'
import { handleError } from '../../handle-error.js'
import { resolveServeAuth } from './serve-api.js'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 4450

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
 * Registers `specd ui serve` — API plus UI from the configured UI plugin.
 *
 * @param uiCmd - Parent `ui` Commander command.
 */
export function registerServeUi(uiCmd: Command): void {
  uiCmd
    .command('serve')
    .description('Start embedded SpecD Studio (API + UI plugin on one or two origins).')
    .option('-p, --port <number>', 'listen port', String(DEFAULT_PORT))
    .option('-h, --host <host>', 'bind host', DEFAULT_HOST)
    .option('-c, --config <path>', 'path to specd.yaml')
    .option('--auth <type>', 'auth override (v1: disabled only)')
    .option('-o, --open', 'open the IDE in the default browser after start')
    .action(
      async (opts: {
        port: string
        host: string
        config?: string
        auth?: string
        open?: boolean
      }) => {
        try {
          const port = Number(opts.port)
          if (!Number.isFinite(port) || port <= 0) {
            throw new Error(`Invalid port: ${opts.port}`)
          }

          const { config } = await resolveCliContext({ configPath: opts.config })
          const auth = resolveServeAuth(opts.auth, config.api?.auth.type ?? 'disabled')
          const uiPlugin = await loadActiveUiPlugin(config)

          const corsOrigins = resolveUiServeCorsOrigins(config, uiPlugin)

          const server = await createApiServer({
            projectRoot: config.projectRoot,
            host: opts.host,
            port,
            auth,
            authRegistry: defaultAuthAdapterRegistry(),
            ...(uiPlugin.hasServer() ? {} : { uiDistPath: uiPlugin.getStaticRoot() }),
            ...(corsOrigins !== undefined ? { corsOrigins } : {}),
          })

          const appUrl = await server.listen()
          const apiBaseUrl = `${appUrl}/v1`
          const serveContext: UiServeContext = { config, apiBaseUrl }
          await uiPlugin.init(serveContext)

          process.stderr.write(`specd API listening at ${appUrl}/v1\n`)
          if (uiPlugin.hasServer()) {
            const uiUrl = uiPlugin.getServerUrl?.() ?? '(unknown)'
            process.stderr.write(`Studio UI (plugin server): ${uiUrl}\n`)
            if (opts.open === true) {
              openBrowser(uiUrl)
            }
          } else {
            process.stderr.write(`Studio UI (embedded): ${appUrl}\n`)
            process.stderr.write(`UI plugin: ${uiPlugin.name}\n`)
            if (opts.open === true) {
              openBrowser(appUrl)
            }
          }
          process.stderr.write('Press Ctrl+C to stop.\n')

          await new Promise<void>((resolve) => {
            const shutdown = () => {
              void (async () => {
                try {
                  await uiPlugin.destroy()
                  await server.close()
                  resolve()
                } catch (err: unknown) {
                  handleError(err, 'text')
                }
              })()
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
