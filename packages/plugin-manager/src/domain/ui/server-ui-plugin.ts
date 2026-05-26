import { type ChildProcess, spawn } from 'node:child_process'
import path from 'node:path'
import type { PluginContext } from '../types/specd-plugin.js'
import type { UiPlugin, UiServeContext } from '../types/ui-plugin.js'

const DEFAULT_SERVER_PORT = 5174

/**
 * Options for {@link createServerUiPlugin}.
 */
export interface ServerUiPluginOptions {
  readonly name: string
  readonly version: string
  readonly packageRoot: string
  readonly serverPort?: number
}

/**
 * Creates a UI plugin that runs its own HTTP server (e.g. Vite) in `init`.
 *
 * @param options - Package identity and listen settings.
 * @returns {@link UiPlugin} with `hasServer() === true`.
 */
export function createServerUiPlugin(options: ServerUiPluginOptions): UiPlugin {
  const port = options.serverPort ?? DEFAULT_SERVER_PORT
  const serverUrl = `http://127.0.0.1:${port}`
  let child: ChildProcess | undefined

  return {
    name: options.name,
    type: 'ui',
    version: options.version,
    configSchema: {},

    hasServer(): boolean {
      return true
    },

    getStaticRoot(): string {
      return path.join(options.packageRoot, 'dist')
    },

    getServerUrl(): string {
      return serverUrl
    },

    async init(context: PluginContext | UiServeContext): Promise<void> {
      const apiBaseUrl = 'apiBaseUrl' in context ? context.apiBaseUrl : undefined
      const env = {
        ...process.env,
        ...(apiBaseUrl !== undefined ? { SPECD_API_BASE_URL: apiBaseUrl } : {}),
      }
      child = spawn('pnpm', ['exec', 'vite', '--port', String(port), '--strictPort'], {
        cwd: options.packageRoot,
        env,
        stdio: 'inherit',
        shell: true,
      })
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 1500)
        child?.once('error', (err) => {
          clearTimeout(timer)
          reject(err)
        })
        child?.once('exit', (code) => {
          if (code !== null && code !== 0) {
            clearTimeout(timer)
            reject(new Error(`UI server process exited with code ${code}`))
          }
        })
      })
    },

    destroy(): Promise<void> {
      if (child !== undefined && !child.killed) {
        child.kill('SIGTERM')
      }
      child = undefined
      return Promise.resolve()
    },
  }
}
