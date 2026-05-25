import { createApiServer, defaultAuthAdapterRegistry } from '@specd/api'
import type { SpecdApiAuthConfig } from '@specd/core'
import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { handleError } from '../../handle-error.js'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 4400

/**
 * Resolves effective API auth from CLI flag and project config.
 *
 * @param cliAuth - `--auth` flag value when provided.
 * @param configAuthType - `specd.yaml` `api.auth.type`.
 * @returns Effective auth configuration for {@link createApiServer}.
 * @throws {Error} When the effective auth type is not `disabled`.
 */
export function resolveServeAuth(
  cliAuth: string | undefined,
  configAuthType: string,
): SpecdApiAuthConfig {
  const effective = cliAuth ?? configAuthType
  if (effective !== 'disabled') {
    throw new Error(
      `Unsupported --auth value '${effective}'. v1 supports only 'disabled' for specd serve.`,
    )
  }
  return { type: 'disabled' }
}

/**
 * Registers the `serve` command (API-only Studio server).
 *
 * @param program - Root Commander program.
 */
export function registerServeApi(program: Command): void {
  program
    .command('serve')
    .description('Start the SpecD Studio HTTP API for the current project (loopback).')
    .option('-p, --port <number>', 'listen port', String(DEFAULT_PORT))
    .option('-h, --host <host>', 'bind host', DEFAULT_HOST)
    .option('-c, --config <path>', 'path to specd.yaml')
    .option('--auth <type>', 'auth override (v1: disabled only)')
    .action(async (opts: { port: string; host: string; config?: string; auth?: string }) => {
      try {
        const port = Number(opts.port)
        if (!Number.isFinite(port) || port <= 0) {
          throw new Error(`Invalid port: ${opts.port}`)
        }

        const { config } = await resolveCliContext({ configPath: opts.config })
        const auth = resolveServeAuth(opts.auth, config.api?.auth.type ?? 'disabled')

        const server = await createApiServer({
          projectRoot: config.projectRoot,
          host: opts.host,
          port,
          auth,
          authRegistry: defaultAuthAdapterRegistry(),
        })

        const url = await server.listen()
        process.stderr.write(`specd API listening at ${url}/v1\n`)
        process.stderr.write('Press Ctrl+C to stop.\n')

        await new Promise<void>((resolve) => {
          const shutdown = () => {
            void server.close().then(resolve).catch((err: unknown) => {
              handleError(err, 'text')
            })
          }
          process.once('SIGINT', shutdown)
          process.once('SIGTERM', shutdown)
        })
      } catch (err) {
        handleError(err, 'text')
      }
    })
}
