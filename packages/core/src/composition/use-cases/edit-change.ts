import { EditChange } from '../../application/use-cases/edit-change.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { createChangeRepository } from '../change-repository.js'
import { GitCLIAdapter } from '../../infrastructure/git/git-adapter.js'

/** Domain context for `createEditChange(context, options)`. */
export interface EditChangeContext {
  readonly workspace: string
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  readonly isExternal: boolean
}

/** Filesystem adapter paths for `createEditChange(context, options)`. */
export interface FsEditChangeOptions {
  readonly changesPath: string
  readonly draftsPath: string
  readonly discardedPath: string
  readonly workspaceNames: readonly string[]
}

/**
 * Derives the workspace list from a set of spec IDs, given a list of known workspace names.
 *
 * A spec path like `billing-ws/billing/invoices` belongs to workspace `billing-ws`.
 * A spec path without a matching workspace prefix belongs to workspace `default`.
 *
 * @param specIds - The spec IDs to derive workspaces from
 * @param workspaceNames - Known workspace names for prefix matching
 * @returns Deduplicated list of resolved workspace names
 */
function deriveWorkspaces(specIds: readonly string[], workspaceNames: readonly string[]): string[] {
  const workspaces = new Set<string>()
  for (const specId of specIds) {
    const slash = specId.indexOf('/')
    const prefix = slash !== -1 ? specId.slice(0, slash) : null
    if (prefix !== null && workspaceNames.includes(prefix)) {
      workspaces.add(prefix)
    } else {
      workspaces.add('default')
    }
  }
  return [...workspaces]
}

/**
 * Constructs an `EditChange` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createEditChange(config: SpecdConfig): EditChange
/**
 * Constructs an `EditChange` use case with explicit context and options.
 *
 * @param context - Domain context for the primary workspace
 * @param options - Filesystem paths and workspace names
 * @returns The pre-wired use case instance
 */
export function createEditChange(
  context: EditChangeContext,
  options: FsEditChangeOptions,
): EditChange
/**
 * Constructs an `EditChange` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createEditChange(
  configOrContext: SpecdConfig | EditChangeContext,
  options?: FsEditChangeOptions,
): EditChange {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const ws = config.workspaces.find((w) => w.name === 'default')!
    const workspaceNames = config.workspaces.map((w) => w.name)
    return createEditChange(
      { workspace: ws.name, ownership: ws.ownership, isExternal: ws.isExternal },
      {
        changesPath: config.storage.changesPath,
        draftsPath: config.storage.draftsPath,
        discardedPath: config.storage.discardedPath,
        workspaceNames,
      },
    )
  }
  const opts = options!
  const changeRepo = createChangeRepository('fs', configOrContext, {
    changesPath: opts.changesPath,
    draftsPath: opts.draftsPath,
    discardedPath: opts.discardedPath,
  })
  const git = new GitCLIAdapter()
  const workspaceNames = [...opts.workspaceNames]
  return new EditChange(changeRepo, git, (specIds) => deriveWorkspaces(specIds, workspaceNames))
}
