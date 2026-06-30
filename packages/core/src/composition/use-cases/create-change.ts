import { CreateChange } from '../../application/use-cases/create-change.js'
import { type GetActiveSchema } from '../../application/use-cases/get-active-schema.js'
import { type DetectOverlap } from '../../application/use-cases/detect-overlap.js'
import * as path from 'node:path'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'
import { createVcsActorResolver } from '../actor-resolver.js'
import { createSpecRepository } from '../spec-repository.js'
import { ListWorkspaces } from '../../application/use-cases/list-workspaces.js'
import { createGetActiveSchema } from './get-active-schema.js'
import { createDetectOverlap } from './detect-overlap.js'

/**
 * Domain context for a `ChangeRepository` bound to a single workspace.
 *
 * Passed to `createCreateChange(context, options)` when constructing the use
 * case without a full `SpecdConfig`.
 */
export interface CreateChangeContext {
  /** The workspace name from `specd.yaml` (e.g. `'default'`). */
  readonly workspace: string
  /** Ownership level of this workspace. */
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  /** Whether the workspace's specs live outside the current git root. */
  readonly isExternal: boolean
  readonly configPath: string
}

/**
 * Filesystem adapter paths for `createCreateChange(context, options)`.
 */
export interface FsCreateChangeOptions {
  /** Absolute path to the `changes/` directory for active changes. */
  readonly changesPath: string
  /** Absolute path to the `drafts/` directory for shelved changes. */
  readonly draftsPath: string
  /** Absolute path to the `discarded/` directory for abandoned changes. */
  readonly discardedPath: string
  /** The project orchestrator. */
  readonly listWorkspaces: ListWorkspaces
  /** Resolves the project's active schema for create orchestration. */
  readonly getActiveSchema: GetActiveSchema
  /** Detects spec overlap across active changes. */
  readonly detectOverlap: DetectOverlap
}

/**
 * Constructs a `CreateChange` use case wired to the default workspace.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createCreateChange(config: SpecdConfig): CreateChange
/**
 * Constructs a `CreateChange` use case with explicit context and fs paths.
 *
 * @param context - Workspace domain context
 * @param options - Filesystem adapter paths and orchestration dependencies
 * @returns The pre-wired use case instance
 */
export function createCreateChange(
  context: CreateChangeContext,
  options: FsCreateChangeOptions,
): CreateChange
/**
 * Constructs a `CreateChange` instance wired with filesystem adapters.
 *
 * @param configOrContext - A fully-resolved `SpecdConfig` or an explicit context object
 * @param options - Filesystem path options; required when `configOrContext` is a context object
 * @returns The pre-wired use case instance
 */
export function createCreateChange(
  configOrContext: SpecdConfig | CreateChangeContext,
  options?: FsCreateChangeOptions,
): CreateChange {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const ws = getDefaultWorkspace(config)
    const changeRepo = createChangeRepository(
      'fs',
      {
        workspace: ws.name,
        ownership: ws.ownership,
        isExternal: ws.isExternal,
        configPath: config.configPath,
      },
      {
        changesPath: config.storage.changesPath,
        draftsPath: config.storage.draftsPath,
        discardedPath: config.storage.discardedPath,
      },
    )
    const specRepos = new Map(
      config.workspaces.map((workspace) => [
        workspace.name,
        createSpecRepository(
          'fs',
          {
            workspace: workspace.name,
            ownership: workspace.ownership,
            isExternal: workspace.isExternal,
            configPath: config.configPath,
          },
          {
            specsPath: workspace.specsPath,
            metadataPath: path.join(workspace.specsPath, '..', '.specd', 'metadata'),
            ...(workspace.prefix !== undefined ? { prefix: workspace.prefix } : {}),
          },
        ),
      ]),
    )
    const actor = createVcsActorResolver()
    const listWorkspaces = new ListWorkspaces(config, specRepos)
    const getActiveSchema = createGetActiveSchema(config)
    const detectOverlap = createDetectOverlap(config)
    return new CreateChange(changeRepo, listWorkspaces, actor, getActiveSchema, detectOverlap)
  }
  const changeRepo = createChangeRepository('fs', configOrContext, options!)
  const actor = createVcsActorResolver()
  return new CreateChange(
    changeRepo,
    options!.listWorkspaces,
    actor,
    options!.getActiveSchema,
    options!.detectOverlap,
  )
}
