import path from 'node:path'
import { applyPersistedSpecStatePatch } from '../../domain/services/apply-persisted-spec-state-patch.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { isValidWorkspaceName } from '../../domain/services/spec-id-rules.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { ImplementationFileNotFoundError } from '../../domain/errors/implementation-file-not-found-error.js'
import { ImplementationWorkspaceBoundaryError } from '../../domain/errors/implementation-workspace-boundary-error.js'
import { InvalidInputError } from '../../domain/errors/invalid-input-error.js'
import { ReadOnlyWorkspaceError } from '../../domain/errors/read-only-workspace-error.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { type FileReader } from '../ports/file-reader.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'
import { WorkspaceNotFoundError } from '../errors/workspace-not-found-error.js'
import { type ExtractorTransformRegistry } from '../../domain/services/extract-metadata.js'
import { applyPersistedImplementationMutation } from './_shared/apply-persisted-implementation-mutation.js'
import { resolveInitialPersistedDependsOn } from './resolve-initial-persisted-depends-on.js'
import { type GetActiveSchema } from './get-active-schema.js'
import { type ListWorkspaces } from './list-workspaces.js'

/** Input for the {@link UpdatePersistedSpecImplementation} use case. */
export interface UpdatePersistedSpecImplementationInput {
  /** Target spec identifier. */
  readonly specId: string
  /** Whether to add or remove an implementation link. */
  readonly action: 'add' | 'remove'
  /** Workspace-qualified or workspace-relative implementation file path. */
  readonly file: string
  /** Optional symbol names covered by the implementation link. */
  readonly symbols?: readonly string[]
}

/** Result returned by a successful {@link UpdatePersistedSpecImplementation} execution. */
export interface UpdatePersistedSpecImplementationResult {
  /** The spec ID whose implementation links were updated. */
  readonly specId: string
  /** The resulting implementation links after the update. */
  readonly implementation: readonly import('../ports/spec-repository.js').PersistedImplementationLink[]
  /** Whether persisted state was created during the update. */
  readonly created: boolean
}

/**
 * Mutates persisted implementation links for a spec, creating state when needed.
 */
export class UpdatePersistedSpecImplementation {
  /**
   * Creates a new `UpdatePersistedSpecImplementation` use case instance.
   *
   * @param specRepositories - Spec repositories keyed by workspace name
   * @param listWorkspaces - Use case listing configured workspaces
   * @param files - File reader for implementation path validation
   * @param getActiveSchema - Use case resolving the active project schema
   * @param resolveInitialPersistedDependsOnDeps - Dependencies for initial dependency resolution
   * @param resolveInitialPersistedDependsOnDeps.parsers - Artifact parser registry
   * @param resolveInitialPersistedDependsOnDeps.extractorTransforms - Metadata extractor transforms
   * @param resolveInitialPersistedDependsOnDeps.hasher - Content hasher for metadata freshness
   */
  constructor(
    private readonly specRepositories: ReadonlyMap<string, SpecRepository>,
    private readonly listWorkspaces: ListWorkspaces,
    private readonly files: FileReader,
    private readonly getActiveSchema: GetActiveSchema,
    private readonly resolveInitialPersistedDependsOnDeps: {
      readonly parsers: ArtifactParserRegistry
      readonly extractorTransforms: ExtractorTransformRegistry
      readonly hasher: ContentHasher
    },
  ) {}

  /**
   * Executes the persisted implementation update.
   *
   * @param input - Update parameters
   * @returns The resulting implementation links and whether state was created
   * @throws {InvalidInputError} If `action` is neither `'add'` nor `'remove'`
   * @throws {InvalidSpecIdError} If `specId` is empty, blank, or malformed
   * @throws {WorkspaceNotFoundError} If the workspace does not exist
   * @throws {ReadOnlyWorkspaceError} If the workspace is read-only
   * @throws {SpecNotFoundError} If the spec does not exist
   * @throws {ImplementationFileNotFoundError} If an add target file does not exist
   * @throws {ImplementationWorkspaceBoundaryError} If the file path crosses workspace boundaries
   */
  async execute(
    input: UpdatePersistedSpecImplementationInput,
  ): Promise<UpdatePersistedSpecImplementationResult> {
    if (input.action !== 'add' && input.action !== 'remove') {
      throw new InvalidInputError(
        `Invalid action "${String(input.action)}": expected "add" or "remove".`,
      )
    }

    const { workspace, capPath, specId } = parseSpecId(input.specId, {
      workspaces: this.specRepositories.keys(),
    })
    const repo = this.specRepositories.get(workspace)!
    if (repo.ownership() === 'readOnly') {
      throw ReadOnlyWorkspaceError.forSpec(specId, workspace)
    }

    const spec = await repo.get(SpecPath.parse(capPath))
    if (spec === null) {
      throw new SpecNotFoundError(specId)
    }

    const normalizedInput: UpdatePersistedSpecImplementationInput = {
      ...input,
      specId,
    }

    const codeRoot = await this._codeRoot(workspace)
    const { canonical: canonicalFile, relative } = this._normalizeFile(
      input.file,
      workspace,
      codeRoot,
    )

    if (normalizedInput.action === 'add') {
      const exists = await this.files.read(path.resolve(codeRoot, relative))
      if (exists === null) {
        throw new ImplementationFileNotFoundError(input.file)
      }
    }

    const current = await repo.readPersistedState(spec)

    if (current === null) {
      if (normalizedInput.action === 'remove') {
        return { specId, implementation: [], created: false }
      }
      return this._createAndMutate(normalizedInput, spec, repo, canonicalFile)
    }

    const implementation = applyPersistedImplementationMutation(current.implementation, {
      action: normalizedInput.action,
      file: canonicalFile,
      ...(normalizedInput.symbols !== undefined ? { symbols: normalizedInput.symbols } : {}),
    })

    const state = applyPersistedSpecStatePatch(
      { kind: 'existing', state: current },
      { implementation },
      { specId },
    )
    await repo.writePersistedState(spec, state, { expectedRevision: current.originalHash })
    return { specId, implementation, created: false }
  }

  /**
   * Creates missing persisted state and applies the implementation mutation.
   *
   * @param input - Update parameters
   * @param spec - Resolved spec entity
   * @param repo - Workspace spec repository
   * @param canonicalFile - Normalized workspace-qualified file path
   * @returns The mutation result after state creation
   */
  private async _createAndMutate(
    input: UpdatePersistedSpecImplementationInput,
    spec: import('../../domain/entities/spec.js').Spec,
    repo: SpecRepository,
    canonicalFile: string,
  ): Promise<UpdatePersistedSpecImplementationResult> {
    const schemaResult = await this.getActiveSchema.execute()
    if (schemaResult.raw) throw new InvalidInputError('schema resolution failed')
    const schemaIdentity = {
      name: schemaResult.schema.name(),
      version: schemaResult.schema.version(),
    }
    const dependsOn = await resolveInitialPersistedDependsOn(
      { specId: input.specId, schema: schemaIdentity },
      {
        specRepo: repo,
        schemaProvider: { get: () => Promise.resolve(schemaResult.schema) },
        parsers: this.resolveInitialPersistedDependsOnDeps.parsers,
        extractorTransforms: this.resolveInitialPersistedDependsOnDeps.extractorTransforms,
        hasher: this.resolveInitialPersistedDependsOnDeps.hasher,
        repositories: this.specRepositories,
      },
    )
    const implementation = applyPersistedImplementationMutation([], {
      action: 'add',
      file: canonicalFile,
      ...(input.symbols !== undefined ? { symbols: input.symbols } : {}),
    })
    const state = applyPersistedSpecStatePatch(
      { kind: 'initial', schema: schemaIdentity, dependsOn },
      { implementation },
      { specId: input.specId },
    )
    await repo.writePersistedState(spec, state, { expectedRevision: null })
    return { specId: input.specId, implementation, created: true }
  }

  /**
   * Resolves the code root directory for a workspace.
   *
   * @param workspace - Workspace name
   * @returns Absolute code root path
   * @throws {WorkspaceNotFoundError} If the workspace does not exist
   */
  private async _codeRoot(workspace: string): Promise<string> {
    const workspaces = await this.listWorkspaces.execute()
    const ws = workspaces.find((entry) => entry.name === workspace)
    if (ws === undefined) {
      throw new WorkspaceNotFoundError(workspace)
    }
    return ws.codeRoot
  }

  /**
   * Normalizes an implementation file path to workspace-qualified form and confines it to the
   * workspace code root.
   *
   * A leading `<workspace>:` qualifier is recognized only when the prefix is a valid workspace
   * name, so drive-letter paths such as `C:\x` are not treated as qualified.
   *
   * @param file - User-provided file path
   * @param workspace - Target workspace name
   * @param codeRoot - Absolute code root of the workspace
   * @returns Canonical workspace-qualified path and the forward-slash path relative to `codeRoot`
   * @throws {ImplementationWorkspaceBoundaryError} If the file path crosses workspace boundaries
   */
  private _normalizeFile(
    file: string,
    workspace: string,
    codeRoot: string,
  ): { readonly canonical: string; readonly relative: string } {
    let rawPath = file
    const colon = file.indexOf(':')
    if (colon > 0 && isValidWorkspaceName(file.slice(0, colon))) {
      if (file.slice(0, colon) !== workspace) {
        throw new ImplementationWorkspaceBoundaryError(file, workspace)
      }
      rawPath = file.slice(colon + 1)
    }
    const relative = path.relative(codeRoot, path.resolve(codeRoot, rawPath))
    if (
      relative === '' ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new ImplementationWorkspaceBoundaryError(file, workspace)
    }
    const forward = relative.split(path.sep).join('/')
    return { canonical: `${workspace}:${forward}`, relative: forward }
  }
}
