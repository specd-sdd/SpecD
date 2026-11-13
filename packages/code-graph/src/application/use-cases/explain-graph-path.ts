import { lstatSync, readFileSync, type Stats } from 'node:fs'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { type SpecdConfig, type VcsAdapter } from '@specd/core'
import { type CodeGraphHostPort } from '../ports/code-graph-host-port.js'
import { type WorkspaceIndexTarget } from '../../domain/value-objects/index-options.js'
import { type FileCategory } from '../../domain/value-objects/file-node.js'
import { type LanguageAdapter } from '../../domain/value-objects/language-adapter.js'
import { toPortableGraphPath } from '../../domain/services/split-workspace-identity.js'
import { explainFileCategory } from '../../domain/services/classify-file-category.js'
import {
  buildPathSubject,
  createPathRuleSet,
  isOutsideProject,
  type PathRuleMatch,
} from '../../domain/services/project-path-rules.js'
import { InvalidGraphWhyPathError } from '../../domain/errors/invalid-graph-why-path-error.js'
import { UnknownWorkspaceError } from '../../domain/errors/unknown-workspace-error.js'
import { buildProjectGraphConfig } from '../services/build-project-graph-config.js'
import { createFileSizeGate } from '../services/file-size-gate.js'
import { decodeTextualContent } from '../services/decode-textual-content.js'
import {
  resolveEffectiveGraphConfig,
  type EffectiveGraphConfig,
} from './_shared/resolve-effective-graph-config.js'
import {
  createDiscoveryEvaluator,
  DEFAULT_BINARY_EXTENSIONS,
  type DiscoveryDecision,
} from './discover-files.js'

/** Evaluation stage reported by {@link ExplainGraphPath}. */
export type ExplainStage =
  | 'binary-extension'
  | 'gitignore'
  | 'global-exclude'
  | 'workspace-exclude'
  | 'allowed-paths'
  | 'size-limit'
  | 'category'
  | 'adapter'

/** Result of one stage. */
export type ExplainOutcome = 'matched' | 'passed' | 'not-applicable'

/** Configuration layer a rule comes from. */
export type ExplainRuleLayer =
  | 'gitignore'
  | 'global'
  | 'spec-root'
  | 'workspace'
  | 'default'
  | 'builtin'

/** Where a rule was declared. */
export interface ExplainRuleOrigin {
  /** Layer that declares the rule. */
  readonly layer: ExplainRuleLayer
  /** Workspace the rule belongs to, when it is a workspace rule. */
  readonly workspace?: string
  /** Configuration key, e.g. `graph.excludePaths`, `workspaces.backend.graph.testPaths`. */
  readonly key?: string
  /** Project-relative file the rule was read from (`.gitignore`), or the spec root for a synthetic exclusion. */
  readonly sourceFile?: string
  /** 1-based line within `sourceFile`, or null when it could not be located. */
  readonly line?: number | null
}

/** The rule that decided a stage. */
export interface ExplainRule {
  /** Pattern text exactly as written. */
  readonly pattern: string
  /** Whether the pattern is a negation. */
  readonly negated: boolean
  /** Where the rule was declared. */
  readonly origin: ExplainRuleOrigin
  /** Set when an ancestor directory was excluded rather than the path itself; project-relative. */
  readonly viaDirectory?: string
}

/** One evaluated stage. */
export interface ExplainStep {
  /** Stage identifier. */
  readonly stage: ExplainStage
  /** Result of the stage. */
  readonly outcome: ExplainOutcome
  /** Deciding rule, when one exists. */
  readonly rule?: ExplainRule
  /** Stage-specific facts. */
  readonly detail?: {
    readonly sizeBytes?: number | null
    readonly limitBytes?: number
    readonly exempt?: boolean
    readonly category?: FileCategory
    readonly kind?: 'file' | 'document'
    readonly language?: string
    /** On `global-exclude`: true when the workspace layer holds a negation that matches the path but could not re-include it. */
    readonly workspaceNegationBlocked?: boolean
  }
}

/** Verdict for one candidate. */
export type CandidateVerdict = 'indexable' | 'excluded' | 'not-allowed' | 'too-large'

/** Top-level verdict. */
export type ExplainVerdict = 'indexable' | 'not-indexed' | 'not-in-scope'

/** Machine-readable diagnostic codes. */
export type ExplainDiagnosticCode =
  | 'PATH_NOT_FOUND'
  | 'CODE_ROOT_OUTSIDE_PROJECT'
  | 'PATH_OUTSIDE_PROJECT'
  | 'MULTIPLE_OWNERS'

/** Evaluation of the path as one workspace (or the project-global namespace) would treat it. */
export interface ExplainCandidate {
  /** Workspace name, or null for the project-global (`root:`) evaluation. */
  readonly workspace: string | null
  /** Graph identity the indexer would give the file. */
  readonly identity: string
  /** Verdict for this candidate. */
  readonly verdict: CandidateVerdict
  /** Category the file would get; null when it would not be indexed or is a directory. */
  readonly category: FileCategory | null
  /** Whether the file is code (`file`) or text (`document`); null when unknown. */
  readonly kind: 'file' | 'document' | null
  /** The eight stages in evaluation order. */
  readonly steps: readonly ExplainStep[]
  /** Whether the store holds a node for `identity`; null when the store cannot be read. */
  readonly inGraph: boolean | null
}

/** Non-fatal observation about the explanation. */
export interface ExplainDiagnostic {
  /** Diagnostic code. */
  readonly code: ExplainDiagnosticCode
  /** Human-readable message. */
  readonly message: string
  /** Workspace the diagnostic refers to, when it is per candidate. */
  readonly workspace?: string
}

/** Structured explanation of how the indexer treats one path. */
export interface ExplainGraphPathResult {
  /** Input exactly as received. */
  readonly input: string
  /** Project-relative path (keeps the `../` form outside the project). */
  readonly projectRelativePath: string
  /** Top-level verdict. */
  readonly verdict: ExplainVerdict
  /** Names of candidates whose verdict is `indexable`; `'root'` for the project-global evaluation. */
  readonly owners: readonly string[]
  /** One evaluation per candidate, in configuration order. */
  readonly candidates: readonly ExplainCandidate[]
  /** Diagnostics. */
  readonly diagnostics: readonly ExplainDiagnostic[]
}

/** Input of {@link ExplainGraphPath.execute}. */
export interface ExplainGraphPathInput {
  /** Project-relative path, absolute path, or `workspace:path`. */
  readonly path: string
  /** Loaded project configuration. */
  readonly config: SpecdConfig
  /** Workspace targets of the project. */
  readonly workspaces: readonly WorkspaceIndexTarget[]
  /** Provider used to observe the stored graph state. */
  readonly provider: CodeGraphHostPort
  /** Registered language adapters used for the adapter stage. */
  readonly adapters?: readonly LanguageAdapter[]
}

const STAGES: readonly ExplainStage[] = [
  'binary-extension',
  'gitignore',
  'global-exclude',
  'workspace-exclude',
  'allowed-paths',
  'size-limit',
  'category',
  'adapter',
]

/** Everything the per-candidate evaluation needs, for a workspace or the project-global namespace. */
interface EvaluationTarget {
  readonly workspace: string | null
  readonly codeRoot: string
  readonly pathBase: string
  readonly respectGitignore: boolean
  readonly globalExcludePaths: readonly string[]
  readonly workspaceExcludePaths: readonly string[]
  readonly allowedPaths: readonly string[] | undefined
  readonly projectTestPaths: readonly string[]
  readonly workspaceTestPaths: readonly string[]
  readonly projectIgnorePaths: readonly string[]
  readonly workspaceIgnorePaths: readonly string[]
  readonly maxFileBytes: number
}

/**
 * Whether a string is a Windows drive path such as `C:/x` or `C:\x`.
 * @param value - Input text.
 * @returns True for drive-letter absolute paths.
 */
function isDrivePath(value: string): boolean {
  return /^[A-Za-z]:([/\\]|$)/.test(value)
}

/**
 * Normalizes a portable relative path: forward slashes, no leading `./`.
 * @param value - Path text.
 * @returns Normalized path.
 */
function stripDot(value: string): string {
  let result = toPortableGraphPath(value)
  while (result.startsWith('./')) result = result.slice(2)
  return result === '.' ? '' : result
}

/**
 * Reads the filesystem entry for a path without following symlinks.
 * @param abs - Absolute path.
 * @returns The stats, or undefined when the entry does not exist or cannot be read.
 */
function lstatOrUndefined(abs: string): Stats | undefined {
  try {
    return lstatSync(abs, { throwIfNoEntry: false })
  } catch {
    return undefined
  }
}

/**
 * Whether an absolute path lies within a code root.
 * @param abs - Absolute path.
 * @param codeRoot - Absolute code root.
 * @returns True when the path equals or is below the code root.
 */
function isWithinCodeRoot(abs: string, codeRoot: string): boolean {
  const rel = toPortableGraphPath(relative(codeRoot, abs))
  return rel === '' || (rel !== '..' && !rel.startsWith('../'))
}

/**
 * Explains why a path is excluded from, classified in, or indexed by the code graph.
 *
 * Runs the same evaluation functions the indexer uses (discovery evaluator, size gate,
 * category classification) so the explanation cannot drift from real indexing. Reads the
 * configuration and filesystem only; the stored graph is consulted solely for `inGraph`.
 */
export class ExplainGraphPath {
  /**
   * Creates the use case.
   * @param createVcsAdapter - Resolver for the project VCS adapter.
   */
  constructor(private readonly createVcsAdapter: (projectRoot: string) => Promise<VcsAdapter>) {}

  /**
   * Explains one path.
   * @param input - Path, configuration, workspaces and provider.
   * @returns The structured explanation.
   * @throws {InvalidGraphWhyPathError} When the input is empty or a pinned path escapes its code root.
   * @throws {UnknownWorkspaceError} When a `workspace:path` input names an unconfigured workspace.
   */
  async execute(input: ExplainGraphPathInput): Promise<ExplainGraphPathResult> {
    const raw = input.path
    if (raw.trim() === '') throw new InvalidGraphWhyPathError(raw)
    const projectRoot = input.config.projectRoot

    // 1. Normalize input
    let abs: string
    let pinned: WorkspaceIndexTarget | undefined
    const colon = raw.indexOf(':')
    const slash = raw.indexOf('/')
    // A Windows drive path is absolute on every host. On POSIX it can never lie inside the
    // project; on Windows it may share a volume with a temp project root and must still keep
    // its absolute portable spelling when outside the project (not a deep `../` walk).
    const drivePathInput = isDrivePath(raw)
    const foreignDrivePath = drivePathInput && process.platform !== 'win32'
    if (foreignDrivePath) {
      abs = toPortableGraphPath(raw)
    } else if (isAbsolute(raw) || drivePathInput) {
      abs = resolve(raw)
    } else if (colon > 0 && (slash === -1 || colon < slash)) {
      const name = raw.slice(0, colon)
      pinned = input.workspaces.find((workspace) => workspace.name === name)
      if (pinned === undefined) throw new UnknownWorkspaceError(name, raw)
      abs = join(
        pinned.codeRoot,
        raw
          .slice(colon + 1)
          .replaceAll('\\', '/')
          .replace(/^\/+/, ''),
      )
      if (!isWithinCodeRoot(abs, pinned.codeRoot)) throw new InvalidGraphWhyPathError(raw)
    } else {
      abs = resolve(projectRoot, raw.replaceAll('\\', '/'))
    }

    // 2. Project-relative path
    const relativeToProject = stripDot(relative(projectRoot, abs))
    const projectRelativePath =
      foreignDrivePath || (drivePathInput && isOutsideProject(relativeToProject))
        ? toPortableGraphPath(abs)
        : relativeToProject

    // 3. VCS root
    let vcsRoot: string | null = null
    try {
      vcsRoot = (await this.createVcsAdapter(projectRoot)).rootDir()
    } catch {
      vcsRoot = null
    }

    // 4. Effective configuration
    const graphConfig = buildProjectGraphConfig(input.config)
    const effective = resolveEffectiveGraphConfig(projectRoot, input.workspaces, graphConfig)

    // 5. Candidates
    const targets: EvaluationTarget[] = []
    const candidateWorkspaces =
      pinned !== undefined
        ? [pinned]
        : foreignDrivePath || (drivePathInput && isOutsideProject(relativeToProject))
          ? []
          : input.workspaces.filter((workspace) => isWithinCodeRoot(abs, workspace.codeRoot))
    for (const workspace of candidateWorkspaces) {
      const w = effective.workspaces.get(workspace.name)
      if (w === undefined) continue
      targets.push({
        workspace: workspace.name,
        codeRoot: workspace.codeRoot,
        pathBase: w.pathBase,
        respectGitignore: w.respectGitignore,
        globalExcludePaths: w.globalExcludePaths,
        workspaceExcludePaths: w.workspaceExcludePaths,
        allowedPaths: w.allowedPaths,
        projectTestPaths: w.projectTestPaths,
        workspaceTestPaths: w.workspaceTestPaths,
        projectIgnorePaths: w.projectIgnorePaths,
        workspaceIgnorePaths: w.workspaceIgnorePaths,
        maxFileBytes: w.maxFileBytes,
      })
    }

    const diagnostics: ExplainDiagnostic[] = []
    const context: EvaluationContext = {
      abs,
      projectRelativePath,
      vcsRoot,
      effective,
      input,
      sizeGate: createFileSizeGate(effective),
      notFound: lstatOrUndefined(abs) === undefined,
    }
    const candidates: ExplainCandidate[] = []
    for (const target of targets) {
      candidates.push(await this.evaluateCandidate(context, target))
    }

    // 7. Project-global fallback
    if (
      candidates.length === 0 &&
      !isOutsideProject(projectRelativePath) &&
      effective.includePaths.length > 0 &&
      createPathRuleSet(effective.includePaths, '').test(
        projectRelativePath,
        lstatOrUndefined(abs)?.isDirectory() === true,
      ).ignored
    ) {
      const rootCandidate = await this.evaluateCandidate(context, {
        workspace: null,
        codeRoot: projectRoot,
        pathBase: '',
        respectGitignore: true,
        globalExcludePaths: effective.rootExcludePaths,
        workspaceExcludePaths: [],
        allowedPaths: effective.includePaths,
        projectTestPaths: graphConfig.testPaths ?? [],
        workspaceTestPaths: [],
        projectIgnorePaths: graphConfig.ignorePaths ?? [],
        workspaceIgnorePaths: [],
        maxFileBytes: effective.rootMaxFileBytes,
      })
      candidates.push(rootCandidate)
    }

    if (candidates.length === 0 && isOutsideProject(projectRelativePath)) {
      diagnostics.push({
        code: 'PATH_OUTSIDE_PROJECT',
        message: `Path is outside the project root: ${projectRelativePath}`,
      })
    }
    if (context.notFound) {
      diagnostics.push({
        code: 'PATH_NOT_FOUND',
        message: `Path does not exist on disk: ${projectRelativePath}`,
      })
    }
    for (const target of targets) {
      if (target.workspace !== null && isOutsideProject(target.pathBase)) {
        diagnostics.push({
          code: 'CODE_ROOT_OUTSIDE_PROJECT',
          message: `Workspace ${target.workspace} has its code root outside the project root; root-anchored patterns cannot match its files`,
          workspace: target.workspace,
        })
      }
    }

    // 8. Aggregate
    const owners = candidates
      .filter((candidate) => candidate.verdict === 'indexable')
      .map((candidate) => candidate.workspace ?? 'root')
    if (owners.length > 1) {
      diagnostics.push({
        code: 'MULTIPLE_OWNERS',
        message: `The same file is indexed by workspaces ${owners.join(', ')}`,
      })
    }
    const verdict: ExplainVerdict =
      owners.length > 0 ? 'indexable' : candidates.length > 0 ? 'not-indexed' : 'not-in-scope'

    return { input: raw, projectRelativePath, verdict, owners, candidates, diagnostics }
  }

  /**
   * Evaluates the path for one workspace or the project-global namespace.
   * @param context - Shared evaluation state.
   * @param target - Settings of the candidate.
   * @returns The candidate evaluation.
   */
  private async evaluateCandidate(
    context: EvaluationContext,
    target: EvaluationTarget,
  ): Promise<ExplainCandidate> {
    const { abs, effective, input } = context
    const rel = stripDot(relative(target.codeRoot, abs))
    const identity = `${target.workspace ?? 'root'}:${rel}`
    const steps = new Map<ExplainStage, ExplainStep>(
      STAGES.map((stage) => [stage, { stage, outcome: 'not-applicable' }]),
    )
    const set = (step: ExplainStep): void => {
      steps.set(step.stage, step)
    }
    const ordered = (): ExplainStep[] => STAGES.map((stage) => steps.get(stage)!)

    const stat = lstatOrUndefined(abs)
    const isDirectory = stat?.isDirectory() === true

    let verdict: CandidateVerdict = 'indexable'
    let category: FileCategory | null = null
    let kind: 'file' | 'document' | null = null

    if (rel === '') {
      // The path is the discovery root itself: nothing to match patterns against.
      return {
        workspace: target.workspace,
        identity,
        verdict,
        category,
        kind,
        steps: ordered(),
        inGraph: await this.observeInGraph(input.provider, identity, true, null),
      }
    }

    const finish = async (): Promise<ExplainCandidate> => ({
      workspace: target.workspace,
      identity,
      verdict,
      category,
      kind,
      steps: ordered(),
      inGraph: await this.observeInGraph(input.provider, identity, verdict === 'indexable', kind),
    })

    // b. Built-in non-discoverable entries
    const ext = extname(rel).toLowerCase()
    if (stat?.isSymbolicLink() === true) {
      set({
        stage: 'binary-extension',
        outcome: 'matched',
        rule: { pattern: 'symlink', negated: false, origin: { layer: 'builtin' } },
      })
      verdict = 'excluded'
      return finish()
    }
    if (!isDirectory && DEFAULT_BINARY_EXTENSIONS.has(ext)) {
      set({
        stage: 'binary-extension',
        outcome: 'matched',
        rule: { pattern: ext, negated: false, origin: { layer: 'builtin' } },
      })
      verdict = 'excluded'
      return finish()
    }
    if (!isDirectory) set({ stage: 'binary-extension', outcome: 'passed' })

    // c-d. Discovery stages
    const evaluator = createDiscoveryEvaluator(target.codeRoot, {
      respectGitignore: target.respectGitignore,
      vcsRoot: context.vcsRoot,
      projectRoot: input.config.projectRoot,
      excludePaths: target.globalExcludePaths,
      workspaceExcludePaths: target.workspaceExcludePaths,
      pathBase: target.pathBase,
      ...(target.allowedPaths !== undefined && target.allowedPaths.length > 0
        ? { allowedPaths: target.allowedPaths }
        : {}),
    })
    const decision = evaluator.evaluatePath(rel, isDirectory)
    const hasAllowed = target.allowedPaths !== undefined && target.allowedPaths.length > 0
    const discoveryStages: ExplainStage[] = [
      'gitignore',
      'global-exclude',
      'workspace-exclude',
      'allowed-paths',
    ]
    const decidingIndex =
      decision.kind === 'excluded' ? discoveryStages.indexOf(decision.stage) : Infinity
    discoveryStages.forEach((stage, index) => {
      if (stage === 'gitignore' && !target.respectGitignore) return
      if (stage === 'allowed-paths' && !hasAllowed) return
      if (stage === 'workspace-exclude' && target.workspace === null) return
      if (index < decidingIndex) set({ stage, outcome: 'passed' })
    })
    if (decision.kind === 'excluded') {
      set(this.buildMatchedDiscoveryStep(context, target, rel, isDirectory, decision))
      verdict = decision.stage === 'allowed-paths' ? 'not-allowed' : 'excluded'
      return finish()
    }

    // A negation that re-includes the path is reported as the deciding rule of its layer.
    const subject = buildPathSubject(target.pathBase, rel)
    const globalResult = createPathRuleSet(target.globalExcludePaths, target.pathBase).test(
      subject,
      isDirectory,
    )
    if (globalResult.unignored && globalResult.rule !== null) {
      set({
        stage: 'global-exclude',
        outcome: 'matched',
        rule: {
          pattern: globalResult.rule.pattern,
          negated: true,
          origin: this.attributeExcludeRule(context, globalResult.rule),
        },
      })
    }
    const workspaceResult = createPathRuleSet(target.workspaceExcludePaths, target.pathBase).test(
      subject,
      isDirectory,
    )
    if (workspaceResult.unignored && workspaceResult.rule !== null && target.workspace !== null) {
      set({
        stage: 'workspace-exclude',
        outcome: 'matched',
        rule: {
          pattern: workspaceResult.rule.pattern,
          negated: true,
          origin: {
            layer: 'workspace',
            workspace: target.workspace,
            key: `workspaces.${target.workspace}.graph.excludePaths`,
          },
        },
      })
    }

    // e. Size
    if (stat !== undefined && !isDirectory) {
      const sizeDecision = context.sizeGate.decide({
        workspaceName: target.workspace ?? 'root',
        relativeToCodeRoot: rel,
        projectRelativePath: context.projectRelativePath,
        absolutePath: abs,
      })
      if (sizeDecision.kind === 'skip') {
        set({
          stage: 'size-limit',
          outcome: 'matched',
          detail: {
            sizeBytes: sizeDecision.sizeBytes,
            limitBytes: sizeDecision.limitBytes,
            exempt: false,
          },
        })
        verdict = 'too-large'
        return finish()
      }
      if (sizeDecision.kind === 'exempt') {
        const rule = sizeDecision.exemptionRule
        set({
          stage: 'size-limit',
          outcome: 'matched',
          ...(rule !== undefined
            ? {
                rule: {
                  ...rule,
                  origin: this.largeFileOrigin(effective, target, rule),
                },
              }
            : {}),
          detail: {
            sizeBytes: sizeDecision.sizeBytes,
            limitBytes: target.maxFileBytes,
            exempt: true,
          },
        })
      } else {
        set({
          stage: 'size-limit',
          outcome: 'passed',
          detail: {
            sizeBytes: sizeDecision.sizeBytes,
            limitBytes: target.maxFileBytes,
            exempt: false,
          },
        })
      }
    }

    // f. Category
    if (!isDirectory) {
      const explanation = explainFileCategory(
        buildPathSubject(target.pathBase, rel),
        target.pathBase,
        [
          { level: 'project', key: 'graph.ignorePaths', patterns: target.projectIgnorePaths },
          { level: 'workspace', key: 'graph.ignorePaths', patterns: target.workspaceIgnorePaths },
        ],
        [
          { level: 'project', key: 'graph.testPaths', patterns: target.projectTestPaths },
          { level: 'workspace', key: 'graph.testPaths', patterns: target.workspaceTestPaths },
        ],
      )
      category = explanation.category
      if (explanation.rule !== null) {
        const declared =
          explanation.rule.key === 'graph.testPaths'
            ? input.config.graph?.testPaths
            : input.config.graph?.ignorePaths
        const origin: ExplainRuleOrigin =
          explanation.rule.level === 'workspace' && target.workspace !== null
            ? {
                layer: 'workspace',
                workspace: target.workspace,
                key: `workspaces.${target.workspace}.${explanation.rule.key}`,
              }
            : { layer: declared === undefined ? 'default' : 'global', key: explanation.rule.key }
        set({
          stage: 'category',
          outcome: 'matched',
          rule: {
            pattern: explanation.rule.pattern,
            negated: explanation.rule.negated,
            origin,
          },
          detail: { category },
        })
      } else {
        set({ stage: 'category', outcome: 'passed', detail: { category } })
      }
    }

    // g. Adapter
    if (stat !== undefined && !isDirectory) {
      const extWithDot = rel.slice(rel.lastIndexOf('.'))
      let language: string | undefined
      for (const adapter of input.adapters ?? []) {
        const found = adapter.extensions()[extWithDot]
        if (found !== undefined) {
          language = found
          break
        }
      }
      if (language === undefined && !this.isTextualFile(abs)) {
        // The indexer records `non-text-content` coverage and indexes nothing for such a file.
        set({
          stage: 'adapter',
          outcome: 'matched',
          rule: {
            pattern: 'non-text-content',
            negated: false,
            origin: { layer: 'builtin' },
          },
        })
        verdict = 'excluded'
        category = null
        return finish()
      }
      kind = language !== undefined ? 'file' : 'document'
      set({
        stage: 'adapter',
        outcome: 'passed',
        detail: { kind, ...(language !== undefined ? { language } : {}) },
      })
    }

    return finish()
  }

  /**
   * Builds the `matched` step for the discovery stage that excluded the path.
   * @param context - Shared evaluation state.
   * @param target - Candidate settings.
   * @param rel - Code-root-relative path.
   * @param isDirectory - Whether the path is a directory.
   * @param decision - The excluding decision.
   * @returns The step.
   */
  private buildMatchedDiscoveryStep(
    context: EvaluationContext,
    target: EvaluationTarget,
    rel: string,
    isDirectory: boolean,
    decision: Extract<DiscoveryDecision, { kind: 'excluded' }>,
  ): ExplainStep {
    const via = decision.viaDirectory
    const viaPart = via !== undefined ? { viaDirectory: via } : {}
    const rule = decision.rule
    if (decision.stage === 'allowed-paths' || rule === null) {
      return { stage: decision.stage, outcome: 'matched' }
    }
    if (decision.stage === 'gitignore') {
      return {
        stage: 'gitignore',
        outcome: 'matched',
        rule: {
          pattern: rule.pattern,
          negated: rule.negated,
          origin: {
            layer: 'gitignore',
            ...(decision.gitignoreSource !== undefined
              ? { sourceFile: decision.gitignoreSource.file, line: decision.gitignoreSource.line }
              : {}),
          },
          ...viaPart,
        },
      }
    }
    if (decision.stage === 'workspace-exclude') {
      return {
        stage: 'workspace-exclude',
        outcome: 'matched',
        rule: {
          pattern: rule.pattern,
          negated: rule.negated,
          origin: {
            layer: 'workspace',
            ...(target.workspace !== null ? { workspace: target.workspace } : {}),
            key: `workspaces.${target.workspace ?? ''}.graph.excludePaths`,
          },
          ...viaPart,
        },
      }
    }
    // global-exclude
    const subject = via ?? buildPathSubject(target.pathBase, rel)
    const blocked = createPathRuleSet(target.workspaceExcludePaths, target.pathBase).test(
      subject,
      via !== undefined ? true : isDirectory,
    ).unignored
    return {
      stage: 'global-exclude',
      outcome: 'matched',
      rule: {
        pattern: rule.pattern,
        negated: rule.negated,
        origin: this.attributeExcludeRule(context, rule),
        ...viaPart,
      },
      detail: { workspaceNegationBlocked: blocked },
    }
  }

  /**
   * Attributes the deciding global-layer pattern to spec-root, project config or defaults.
   * @param context - Shared evaluation state.
   * @param rule - The deciding rule.
   * @returns The rule origin.
   */
  private attributeExcludeRule(context: EvaluationContext, rule: PathRuleMatch): ExplainRuleOrigin {
    const synthetic = context.effective.syntheticSpecExcludePaths
    const projectList = context.effective.globalExcludePaths
    const declared = context.input.config.graph?.excludePaths !== undefined
    const combined = [...projectList, ...synthetic]
    const lastIndex = combined.lastIndexOf(rule.pattern)
    if (lastIndex >= projectList.length) {
      return { layer: 'spec-root', sourceFile: rule.pattern.replace(/\/$/, '') }
    }
    return { layer: declared ? 'global' : 'default', key: 'graph.excludePaths' }
  }

  /**
   * Attributes a size-exemption pattern to the project or workspace list.
   * @param effective - Effective graph configuration.
   * @param target - Candidate settings.
   * @param rule - Exemption rule.
   * @returns The rule origin.
   */
  private largeFileOrigin(
    effective: EffectiveGraphConfig,
    target: EvaluationTarget,
    rule: PathRuleMatch,
  ): ExplainRuleOrigin {
    if (target.workspace === null || effective.rootLargeFilePaths.includes(rule.pattern)) {
      return { layer: 'global', key: 'graph.largeFilePaths' }
    }
    return {
      layer: 'workspace',
      workspace: target.workspace,
      key: `workspaces.${target.workspace}.graph.largeFilePaths`,
    }
  }

  /**
   * Whether a file has textual content, using the indexer's own detection.
   * @param abs - Absolute file path.
   * @returns True when the content decodes as text (or cannot be read, which the indexer reports separately).
   */
  private isTextualFile(abs: string): boolean {
    try {
      return decodeTextualContent(readFileSync(abs)) !== null
    } catch {
      return true
    }
  }

  /**
   * Observes whether the store holds a node for the identity.
   * @param provider - Provider used for lookups.
   * @param identity - Graph identity.
   * @param indexable - Whether the candidate would be indexed.
   * @param kind - Known resource kind, or null.
   * @returns True/false, or null when the store cannot be read.
   */
  private async observeInGraph(
    provider: CodeGraphHostPort,
    identity: string,
    indexable: boolean,
    kind: 'file' | 'document' | null,
  ): Promise<boolean | null> {
    const checks: Array<(() => Promise<unknown>) | undefined> = []
    const wantFile = !indexable || kind !== 'document'
    const wantDocument = !indexable || kind !== 'file'
    if (wantFile) checks.push(provider.getFile?.bind(provider, identity))
    if (wantDocument) checks.push(provider.getDocument?.bind(provider, identity))
    let unknown = false
    for (const check of checks) {
      if (check === undefined) {
        unknown = true
        continue
      }
      try {
        if ((await check()) !== undefined) return true
      } catch {
        unknown = true
      }
    }
    return unknown ? null : false
  }
}

/** Shared per-execution state for candidate evaluation. */
interface EvaluationContext {
  readonly abs: string
  readonly projectRelativePath: string
  readonly vcsRoot: string | null
  readonly effective: EffectiveGraphConfig
  readonly input: ExplainGraphPathInput
  readonly sizeGate: ReturnType<typeof createFileSizeGate>
  readonly notFound: boolean
}
