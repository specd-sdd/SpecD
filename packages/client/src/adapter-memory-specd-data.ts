import type { SpecdDataPort } from './specd-data-port.js'
import type { ChangeDetailDto } from './dto/change-detail.js'
import type { ChangeStatusDto } from './dto/change-status.js'
import type { ChangeSummaryDto } from './dto/change-summary.js'
import type { ProjectDto } from './dto/project.js'
import type { ProjectStatusDto } from './dto/project-status.js'
import type { WorkspaceSpecTreeDto } from './dto/workspace-spec-tree.js'
import type { GraphIndexResultDto } from './dto/graph-index-result.js'
import type { GraphStatusDto } from './dto/graph-status.js'
import type {
  ChangeOverlapsDto,
  CreateChangeInput,
  GetChangeStatusOptions,
  GraphImpactInput,
  GraphIndexInput,
  GraphSearchInput,
  PatchChangeInput,
  SaveChangeArtifactInput,
  TransitionChangeInput,
  UpdateImplementationTrackingInput,
  UpdateSpecDependenciesInput,
} from './inputs.js'
import type { ArtifactContentDto } from './dto/artifact-content.js'
import type { ReadOnlyChangeOrigin } from './port-changes-read.js'
import type { ValidateBatchResultDto } from './dto/validate-batch-result.js'
import type { ValidateResultDto } from './dto/validate-result.js'
import type { ArtifactInstructionDto } from './dto/artifact-instruction.js'
import type { HookInstructionsDto } from './dto/hook-instructions.js'
import type { CompiledContextDto } from './dto/compiled-context.js'
import type { PreviewResultDto } from './dto/preview-result.js'
import type { SpecDetailDto } from './dto/spec-detail.js'
import type { SpecContextDto } from './dto/spec-context.js'
import type { SpecSummaryDto } from './dto/spec-summary.js'
import type { WorkspaceSpecsValidateResultDto } from './dto/workspace-specs-validate-result.js'
import type { GraphSearchResultDto } from './dto/graph-search.js'
import type { GraphImpactDto } from './dto/graph-impact.js'
import type { ChangeGraphViewDto } from './dto/change-graph-view.js'
import type { GraphSpecCoverageDto } from './dto/graph-spec-coverage.js'
import type { GraphFileRefDto } from './dto/graph-file-ref.js'
import type { GraphSymbolRefDto } from './dto/graph-symbol-ref.js'
import type {
  ImplementationReviewDto,
  UpdateImplementationTrackingResultDto,
  UpdateSpecDependenciesResultDto,
} from './dto/implementation-tracking.js'
import type { WorkspaceSummaryDto } from './dto/project.js'
import type { ChangeArtifactListItemDto } from './port-changes-read.js'
import type { AppendProjectLogInput } from './port-studio-panel.js'
import type { LogReadDto } from './dto/log-read.js'
const FIXTURE_NOW = '2026-05-25T12:00:00.000Z'

const fixtureProject: ProjectDto = {
  name: 'demo-project',
  schemaRef: '@specd/schema-std',
  workspaces: [{ name: 'default', ownership: 'readWrite' }],
  approvals: { spec: false, signoff: false },
  auth: { type: 'disabled' },
}

const fixtureChange: ChangeDetailDto = {
  name: 'demo-change',
  description: 'In-memory fixture change',
  state: 'exploring',
  specIds: ['default:demo/spec'],
  schemaName: 'specd-std',
  schemaVersion: '1.0.0',
  updatedAt: FIXTURE_NOW,
  history: [{ type: 'created', at: FIXTURE_NOW, by: 'fixture' }],
}

/**
 * In-memory {@link SpecdDataPort} for Storybook and unit tests (no network or disk I/O).
 */
export class MemorySpecdDataAdapter implements SpecdDataPort {
  private readonly _changes = new Map<string, ChangeDetailDto>([
    [fixtureChange.name, fixtureChange],
  ])
  private readonly _artifacts = new Map<string, ArtifactContentDto>()
  private readonly _logLines: string[] = []

  getProject(): Promise<ProjectDto> {
    return Promise.resolve(fixtureProject)
  }

  getProjectStatus(): Promise<ProjectStatusDto> {
    return Promise.resolve({
      activeChanges: this._changes.size,
      drafts: 0,
      discarded: 0,
      archived: 0,
      graph: { indexed: false, stale: true },
      auth: { type: 'disabled' },
    })
  }

  listChanges(): Promise<readonly ChangeSummaryDto[]> {
    return Promise.resolve([...this._changes.values()].map(toSummary))
  }

  listDrafts(): Promise<readonly ChangeSummaryDto[]> {
    return Promise.resolve([])
  }

  listDiscarded(): Promise<readonly ChangeSummaryDto[]> {
    return Promise.resolve([])
  }

  listArchived(): Promise<readonly ChangeSummaryDto[]> {
    return Promise.resolve([])
  }

  detectOverlaps(): Promise<ChangeOverlapsDto> {
    return Promise.resolve({ hasOverlap: false, entries: [] })
  }

  createChange(input: CreateChangeInput): Promise<ChangeDetailDto> {
    const change: ChangeDetailDto = {
      ...fixtureChange,
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      specIds: input.specIds ?? [],
      history: [{ type: 'created', at: FIXTURE_NOW, by: 'fixture' }],
    }
    this._changes.set(change.name, change)
    return Promise.resolve(change)
  }

  getChange(name: string): Promise<ChangeDetailDto> {
    const change = this._changes.get(name)
    if (change === undefined) {
      return Promise.reject(new Error(`Change not found: ${name}`))
    }
    return Promise.resolve(change)
  }

  getDraft(name: string): Promise<ChangeDetailDto> {
    return this.getChange(name)
  }

  getDiscarded(name: string): Promise<ChangeDetailDto> {
    return this.getChange(name)
  }

  getChangeStatus(name: string, options?: GetChangeStatusOptions): Promise<ChangeStatusDto> {
    const change = this._changes.get(name)
    if (change === undefined) {
      return Promise.reject(new Error(`Change not found: ${name}`))
    }
    const updatedAt = change.updatedAt ?? FIXTURE_NOW
    if (options?.ifModifiedSince === updatedAt) {
      return Promise.resolve({
        name: change.name,
        state: change.state,
        updatedAt,
        unchanged: true,
      })
    }
    return Promise.resolve({
      name: change.name,
      state: change.state,
      updatedAt,
      artifacts: [],
      blockers: [],
      nextAction: {
        targetStep: 'exploring',
        actionType: 'continue',
        reason: 'Continue exploring',
        command: null,
      },
    })
  }

  getDraftStatus(name: string, options?: GetChangeStatusOptions): Promise<ChangeStatusDto> {
    return this.getChangeStatus(name, options)
  }

  getDiscardedStatus(name: string, options?: GetChangeStatusOptions): Promise<ChangeStatusDto> {
    return this.getChangeStatus(name, options)
  }

  listChangeArtifacts(): Promise<readonly ChangeArtifactListItemDto[]> {
    return Promise.resolve([])
  }

  listDraftArtifacts(): Promise<readonly ChangeArtifactListItemDto[]> {
    return this.listChangeArtifacts()
  }

  listDiscardedArtifacts(): Promise<readonly ChangeArtifactListItemDto[]> {
    return this.listChangeArtifacts()
  }

  getChangeArtifact(name: string, filename: string): Promise<ArtifactContentDto> {
    const key = `${name}:${filename}`
    const existing = this._artifacts.get(key)
    if (existing !== undefined) {
      return Promise.resolve(existing)
    }
    return Promise.resolve({
      filename,
      content: `# ${filename}\n\nFixture content.\n`,
      originalHash: 'sha256:fixture',
    })
  }

  getReadOnlyChangeArtifact(
    name: string,
    filename: string,
    readOnlyOrigin: ReadOnlyChangeOrigin,
  ): Promise<ArtifactContentDto> {
    const originKey = `${readOnlyOrigin}:${name}:${filename}`
    const existing = this._artifacts.get(originKey) ?? this._artifacts.get(`${name}:${filename}`)
    if (existing !== undefined) {
      return Promise.resolve(existing)
    }
    return Promise.resolve({
      filename,
      content: `# ${filename}\n\nFixture content (${readOnlyOrigin}).\n`,
      originalHash: 'sha256:fixture',
    })
  }

  getDraftArtifact(name: string, filename: string): Promise<ArtifactContentDto> {
    return this.getReadOnlyChangeArtifact(name, filename, 'draft')
  }

  getDiscardedArtifact(name: string, filename: string): Promise<ArtifactContentDto> {
    return this.getReadOnlyChangeArtifact(name, filename, 'discarded')
  }

  getChangeContext(): Promise<CompiledContextDto> {
    return Promise.resolve({ content: '# Fixture context\n', format: 'markdown' })
  }

  previewChange(_name: string, query: { specId: string }): Promise<PreviewResultDto> {
    return this.previewChangeDraft(_name, { specId: query.specId })
  }

  previewChangeDraft(
    _name: string,
    input: { specId: string; artifactOverrides?: Readonly<Record<string, string>> },
  ): Promise<PreviewResultDto> {
    const override = input.artifactOverrides ? Object.values(input.artifactOverrides)[0] : undefined
    return Promise.resolve({
      specId: input.specId,
      files: [
        {
          filename: 'spec.md',
          base: '# Base\n',
          merged: override ?? '# Fixture preview\n',
        },
      ],
    })
  }

  outlineChangeArtifact(
    _name: string,
    filename: string,
    input: { content?: string } = {},
  ): Promise<readonly Record<string, unknown>[]> {
    return Promise.resolve([
      {
        filename,
        outline: [{ label: 'Fixture', type: 'section', depth: 0 }],
        ...(input.content !== undefined ? { draft: true } : {}),
      },
    ])
  }

  getHookInstructions(): Promise<HookInstructionsDto> {
    return Promise.resolve({ phase: 'pre', instructions: [] })
  }

  getArtifactInstruction(): Promise<ArtifactInstructionDto> {
    return Promise.resolve({
      artifactId: 'specs',
      rulesPre: [],
      instruction: null,
      template: null,
      delta: null,
      rulesPost: [],
    })
  }

  getImplementationReview(name: string): Promise<ImplementationReviewDto> {
    const change = this._changes.get(name)
    return Promise.resolve({
      specIds: change?.specIds ?? [],
      implementationTracking: {
        trackedFiles: [
          {
            file: 'packages/ui/src/change/ChangeTabPanels.tsx',
            state: 'open',
          },
          {
            file: 'packages/core/src/application/use-cases/compile-context.ts',
            state: 'resolved',
          },
        ],
        links: [
          {
            specId: 'ui:change-tab-impact',
            file: 'packages/ui/src/change/ChangeTabPanels.tsx',
            fileLinkExplicit: true,
            symbols: ['ChangeImpactTab'],
          },
        ],
      },
    })
  }

  saveChangeArtifact(
    name: string,
    filename: string,
    input: SaveChangeArtifactInput,
  ): Promise<ArtifactContentDto> {
    const artifact: ArtifactContentDto = {
      filename,
      content: input.content,
      originalHash: `sha256:${input.content.length}`,
    }
    this._artifacts.set(`${name}:${filename}`, artifact)
    return Promise.resolve(artifact)
  }

  validateChange(): Promise<ValidateResultDto> {
    return Promise.resolve({ passed: true, failures: [], warnings: [], files: [] })
  }

  validateChangeAll(): Promise<ValidateBatchResultDto> {
    return Promise.resolve({ passed: true, total: 0, results: [] })
  }

  transitionChange(name: string, input: TransitionChangeInput): Promise<ChangeDetailDto> {
    const change = this._changes.get(name)
    if (change === undefined) {
      return Promise.reject(new Error(`Change not found: ${name}`))
    }
    const next = { ...change, state: input.targetState }
    this._changes.set(name, next)
    return Promise.resolve(next)
  }

  patchChange(name: string, input: PatchChangeInput): Promise<ChangeDetailDto> {
    const change = this._changes.get(name)
    if (change === undefined) {
      return Promise.reject(new Error(`Change not found: ${name}`))
    }
    let specIds = [...change.specIds]
    if (input.removeSpecIds?.length) {
      const remove = new Set(input.removeSpecIds)
      specIds = specIds.filter((id) => !remove.has(id))
    }
    if (input.addSpecIds?.length) {
      const set = new Set(specIds)
      for (const id of input.addSpecIds) set.add(id)
      specIds = [...set]
    }
    const next: ChangeDetailDto = {
      ...change,
      specIds,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.invalidationPolicy !== undefined
        ? { invalidationPolicy: input.invalidationPolicy }
        : {}),
    }
    this._changes.set(name, next)
    return Promise.resolve(next)
  }

  draftChange(name: string): Promise<ChangeDetailDto> {
    return this.getChange(name)
  }

  restoreChange(name: string): Promise<ChangeDetailDto> {
    return this.getChange(name)
  }

  discardChange(name: string): Promise<ChangeDetailDto> {
    return this.getChange(name)
  }

  archiveChange(name: string): Promise<ChangeDetailDto> {
    return this.getChange(name)
  }

  approveSpec(name: string): Promise<ChangeDetailDto> {
    return this.getChange(name)
  }

  approveSignoff(name: string): Promise<ChangeDetailDto> {
    return this.getChange(name)
  }

  invalidateChange(name: string): Promise<ChangeDetailDto> {
    return this.getChange(name)
  }

  skipArtifact(name: string): Promise<ChangeDetailDto> {
    return this.getChange(name)
  }

  updateSpecDependencies(
    name: string,
    body: UpdateSpecDependenciesInput,
  ): Promise<UpdateSpecDependenciesResultDto> {
    const change = this._changes.get(name)
    if (change === undefined) {
      return Promise.reject(new Error(`Change not found: ${name}`))
    }
    const nextDeps = { ...change.specDependsOn }
    const current = [...(nextDeps[body.specId] ?? [])]
    let dependsOn = current
    if (body.set !== undefined) {
      dependsOn = [...body.set]
    } else {
      if (body.remove !== undefined) {
        dependsOn = dependsOn.filter((entry) => !body.remove?.includes(entry))
      }
      if (body.add !== undefined) {
        for (const entry of body.add) {
          if (!dependsOn.includes(entry)) {
            dependsOn.push(entry)
          }
        }
      }
    }
    nextDeps[body.specId] = dependsOn
    this._changes.set(name, { ...change, specDependsOn: nextDeps })
    return Promise.resolve({ specId: body.specId, dependsOn })
  }

  updateImplementationTracking(
    name: string,
    body: UpdateImplementationTrackingInput,
  ): Promise<UpdateImplementationTrackingResultDto> {
    const change = this._changes.get(name)
    if (change === undefined) {
      return Promise.reject(new Error(`Change not found: ${name}`))
    }
    return Promise.resolve({
      implementationTracking: {
        trackedFiles: [
          {
            file: body.file,
            state:
              body.action === 'ignore'
                ? 'ignored'
                : body.action === 'resolve'
                  ? 'resolved'
                  : 'open',
          },
        ],
        links:
          body.specId !== undefined
            ? [
                {
                  specId: body.specId,
                  file: body.file,
                  fileLinkExplicit: body.symbols === undefined || body.symbols.length === 0,
                  ...(body.symbols !== undefined ? { symbols: body.symbols } : {}),
                },
              ]
            : [],
      },
    })
  }

  getArchivedChange(name: string): Promise<ChangeDetailDto> {
    return this.getChange(name)
  }

  listWorkspaces(): Promise<readonly WorkspaceSummaryDto[]> {
    return Promise.resolve(fixtureProject.workspaces)
  }

  listSpecs(workspace: string): Promise<WorkspaceSpecTreeDto> {
    return Promise.resolve({
      workspace,
      specs: [{ specId: `${workspace}:demo/spec`, path: 'demo/spec', title: 'Demo spec' }],
    })
  }

  getSpec(workspace: string, specPath: string): Promise<SpecDetailDto> {
    return Promise.resolve({
      specId: `${workspace}:${specPath}`,
      workspace,
      path: specPath,
      title: 'Demo spec',
      artifacts: [{ filename: 'spec.md' }],
      linkedChanges: [],
    })
  }

  getSpecOutline(): Promise<readonly Record<string, unknown>[]> {
    return Promise.resolve([{ filename: 'spec.md', outline: [] }])
  }

  outlineSpecDraft(
    _workspace: string,
    _specPath: string,
    input: { filename: string; content: string },
  ): Promise<readonly Record<string, unknown>[]> {
    return Promise.resolve([
      { filename: input.filename, outline: [{ label: 'Draft', type: 'section', depth: 0 }] },
    ])
  }

  getSpecContext(workspace: string, specPath: string): Promise<SpecContextDto> {
    return Promise.resolve({
      entries: [
        {
          spec: `${workspace}:${specPath}`,
          source: 'root',
          mode: 'summary',
          title: 'Demo spec',
          description: 'Fixture structured spec context',
          stale: false,
        },
      ],
      warnings: [],
    })
  }

  getSpecArtifact(
    _workspace: string,
    _specPath: string,
    filename: string,
  ): Promise<ArtifactContentDto> {
    return Promise.resolve({
      filename,
      content: `# ${filename}\n`,
      originalHash: 'sha256:fixture',
    })
  }

  validateSpecs(workspace: string, specPath?: string): Promise<WorkspaceSpecsValidateResultDto> {
    void workspace
    void specPath
    return Promise.resolve({
      passed: true,
      totalSpecs: 0,
      passedCount: 0,
      failedCount: 0,
      entries: [],
    })
  }

  searchSpecs(query: {
    readonly q: string
    readonly workspace?: string
    readonly signal?: AbortSignal
  }): Promise<readonly SpecSummaryDto[]> {
    void query
    return Promise.resolve([])
  }

  getGraphStatus(): Promise<GraphStatusDto> {
    return Promise.resolve({
      lastIndexedAt: null,
      lastIndexedRef: null,
      fileCount: 0,
      documentCount: 0,
      symbolCount: 0,
      specCount: 0,
      graphFingerprint: null,
      stale: true,
    })
  }

  indexGraph(input: GraphIndexInput = {}): Promise<GraphIndexResultDto> {
    return Promise.resolve({
      filesDiscovered: 0,
      filesIndexed: 0,
      documentsIndexed: 0,
      filesRemoved: 0,
      filesSkipped: 0,
      specsDiscovered: 0,
      specsIndexed: 0,
      errors: [],
      duration: 0,
      workspaces: fixtureProject.workspaces.map((workspace) => ({
        name: workspace.name,
        filesDiscovered: 0,
        filesIndexed: 0,
        filesSkipped: 0,
        filesRemoved: 0,
        specsDiscovered: 0,
        specsIndexed: 0,
      })),
      vcsRef: null,
      graphFingerprint: 'fixture-graph',
      fullRebuildReason: input.force === true ? 'Explicit force reindex requested' : null,
    })
  }

  searchGraph(query: GraphSearchInput): Promise<GraphSearchResultDto> {
    void query
    return Promise.resolve({ symbols: [], specs: [], documents: [] })
  }

  getImpact(query: GraphImpactInput): Promise<GraphImpactDto> {
    void query
    return Promise.resolve({
      target: 'fixture',
      direction: 'dependents',
      riskLevel: 'LOW',
      directDepsCount: 0,
      indirectDepsCount: 0,
      transitiveDepsCount: 0,
      affectedFilesCount: 0,
      affectedProcesses: [],
      specs: [],
      symbols: [],
      files: [],
    })
  }

  getHotspots(): Promise<readonly Record<string, unknown>[]> {
    return Promise.resolve([])
  }

  getSpecGraphView(): Promise<GraphSpecCoverageDto> {
    return Promise.resolve({ specId: 'default:demo/spec', files: [], symbols: [] })
  }

  getChangeGraphView(name: string): Promise<ChangeGraphViewDto> {
    const change = this._changes.get(name)
    const specIds = change?.specIds ?? []
    return Promise.resolve({
      changeName: name,
      specIds,
      specs: specIds.map((specId) => ({
        specId,
        coveredFiles: [] as readonly GraphFileRefDto[],
        coveredSymbols: [] as readonly GraphSymbolRefDto[],
      })),
    })
  }

  readProjectLogs(options?: {
    readonly limit?: number
    readonly prettier?: boolean
  }): Promise<LogReadDto> {
    const limit = options?.limit ?? 500
    const lines = this._logLines.slice(-limit).reverse()
    if (options?.prettier) {
      return Promise.resolve({ lines })
    }
    return Promise.resolve({
      entries: lines.map((message, i) => ({
        timestamp: FIXTURE_NOW,
        level: 'debug',
        message,
        context: { index: i },
      })),
    })
  }

  appendProjectLog(input: AppendProjectLogInput): Promise<void> {
    const level = input.level ?? 'debug'
    this._logLines.push(`${level}: ${input.message}`)
    if (this._logLines.length > 500) {
      this._logLines.shift()
    }
    return Promise.resolve()
  }
}

function toSummary(change: ChangeDetailDto): ChangeSummaryDto {
  return {
    name: change.name,
    state: change.state,
    specIds: [...change.specIds],
    blockerCount: 0,
    ...(change.description !== undefined ? { description: change.description } : {}),
    ...(change.updatedAt !== undefined ? { updatedAt: change.updatedAt } : {}),
  }
}

/**
 * Factory for {@link MemorySpecdDataAdapter}.
 *
 * @returns In-memory {@link SpecdDataPort}.
 */
export function createMemorySpecdDataAdapter(): SpecdDataPort {
  return new MemorySpecdDataAdapter()
}
