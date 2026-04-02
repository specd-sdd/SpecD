import { type SpecdConfig } from '@specd/core'
import { join } from 'node:path'

/**
 * Creates a minimal `SpecdConfig` for graph bootstrap mode.
 *
 * The resulting config is sufficient for graph commands that operate without
 * `specd.yaml`, treating the resolved repository root as a synthetic single
 * `default` workspace.
 *
 * @param params - Bootstrap parameters.
 * @param params.projectRoot - Project root for graph storage and path resolution.
 * @param params.vcsRoot - Resolved repository root used as the synthetic workspace code root.
 * @returns A minimal `SpecdConfig` suitable for graph commands.
 */
export function createBootstrapGraphConfig(params: {
  readonly projectRoot: string
  readonly vcsRoot: string
}): SpecdConfig {
  const configPath = join(params.projectRoot, '.specd', 'config')
  return {
    projectRoot: params.projectRoot,
    configPath,
    schemaRef: '@specd/schema-std',
    workspaces: [
      {
        name: 'default',
        specsPath: join(params.projectRoot, 'specs'),
        schemasPath: join(configPath, 'schemas'),
        codeRoot: params.vcsRoot,
        ownership: 'owned',
        isExternal: false,
      },
    ],
    storage: {
      changesPath: join(params.projectRoot, '.specd', 'changes'),
      draftsPath: join(params.projectRoot, '.specd', 'drafts'),
      discardedPath: join(params.projectRoot, '.specd', 'discarded'),
      archivePath: join(params.projectRoot, '.specd', 'archive'),
    },
    approvals: { spec: false, signoff: false },
  }
}
