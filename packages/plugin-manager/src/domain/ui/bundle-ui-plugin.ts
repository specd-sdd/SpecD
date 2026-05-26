import fs from 'node:fs'
import path from 'node:path'
import { type SpecdConfig, UiPluginBundleMissingError } from '@specd/core'
import type { UiInstallOptions, UiInstallResult, UiPlugin } from '../types/ui-plugin.js'

/**
 * Options for {@link createBundleUiPlugin}.
 */
export interface BundleUiPluginOptions {
  readonly name: string
  readonly version: string
  readonly packageRoot: string
  readonly staticDir?: string
}

/**
 * Creates a distribution UI plugin that serves a pre-built `dist/` folder.
 *
 * @param options - Package identity and static directory name.
 * @returns {@link UiPlugin} with `hasServer() === false`.
 */
export function createBundleUiPlugin(options: BundleUiPluginOptions): UiPlugin {
  const staticDir = options.staticDir ?? 'dist'
  const staticRoot = path.join(options.packageRoot, staticDir)

  return {
    name: options.name,
    type: 'ui',
    version: options.version,
    configSchema: {},

    hasServer(): boolean {
      return false
    },

    getStaticRoot(): string {
      return staticRoot
    },

    init(): Promise<void> {
      return Promise.resolve()
    },

    destroy(): Promise<void> {
      return Promise.resolve()
    },

    install(_config: SpecdConfig, installOptions?: UiInstallOptions): Promise<UiInstallResult> {
      const requireBuilt = installOptions?.requireBuiltDist !== false
      const indexPath = path.join(staticRoot, 'index.html')
      const hasIndexHtml = fs.existsSync(indexPath)
      if (requireBuilt && !hasIndexHtml) {
        throw new UiPluginBundleMissingError(staticRoot)
      }
      return Promise.resolve({
        staticRoot,
        hasIndexHtml,
        message: hasIndexHtml
          ? `UI bundle ready at ${staticRoot}`
          : `UI plugin registered; build output not found at ${staticRoot}`,
      })
    },
  }
}
