import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { type SpecdConfig, type VcsAdapter } from '@specd/core'
import {
  ExplainGraphPath,
  type ExplainCandidate,
  type ExplainGraphPathResult,
  type ExplainStage,
} from '../../../src/application/use-cases/explain-graph-path.js'
import { IndexCodeGraph } from '../../../src/application/use-cases/index-code-graph.js'
import { buildProjectGraphConfig } from '../../../src/application/services/build-project-graph-config.js'
import { type CodeGraphHostPort } from '../../../src/application/ports/code-graph-host-port.js'
import { emptyResolutionManifestSource } from '../../../src/application/ports/resolution-manifest-source.js'
import { emptyRepositoryRootSource } from '../../../src/application/ports/repository-root-source.js'
import { NodeWorkspaceAccessibilitySource } from '../../../src/infrastructure/fs/node-workspace-accessibility-source.js'
import { AdapterRegistry } from '../../../src/infrastructure/tree-sitter/adapter-registry.js'
import { TypeScriptLanguageAdapter } from '../../../src/infrastructure/tree-sitter/typescript-language-adapter.js'
import { type WorkspaceIndexTarget } from '../../../src/domain/value-objects/index-options.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'
import { makeMockSpecRepository } from '../../helpers/make-mock-spec-repository.js'

type GraphSection = NonNullable<SpecdConfig['graph']>
type WorkspaceGraph = NonNullable<SpecdConfig['workspaces'][number]['graph']>

/**
 * Writes files under a directory.
 * @param root - Directory that receives the files.
 * @param files - Relative path to content.
 */
function write(root: string, files: Record<string, string | Buffer>): void {
  for (const [relative, content] of Object.entries(files)) {
    const target = join(root, relative)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
}

/**
 * Finds one step of a candidate.
 * @param candidate - Candidate to search.
 * @param stage - Stage to find.
 * @returns The step.
 */
function step(candidate: ExplainCandidate, stage: ExplainStage): ExplainCandidate['steps'][number] {
  const found = candidate.steps.find((s) => s.stage === stage)
  if (found === undefined) throw new Error(`missing stage ${stage}`)
  return found
}

describe('ExplainGraphPath', () => {
  let tempDir: string
  const noVcs = async (): Promise<VcsAdapter> => ({ rootDir: () => null }) as unknown as VcsAdapter
  const rootedVcs = async (): Promise<VcsAdapter> =>
    ({ rootDir: () => tempDir }) as unknown as VcsAdapter

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-explain-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  /**
   * Builds a workspace target.
   * @param name - Workspace name.
   * @param codeRoot - Code root below the temp project.
   * @param specsPath - Optional spec root below the temp project.
   * @returns The target.
   */
  function workspace(name: string, codeRoot: string, specsPath?: string): WorkspaceIndexTarget {
    const specRepo = makeMockSpecRepository()
    if (specsPath !== undefined) {
      Object.defineProperty(specRepo, 'specsPath', { get: () => join(tempDir, specsPath) })
    }
    return {
      name,
      prefix: null,
      codeRoot: join(tempDir, codeRoot),
      specRepo,
      ownership: 'owned',
      isExternal: false,
    }
  }

  /**
   * Builds a configuration double carrying only the fields graph code reads.
   * @param workspaces - Workspace targets.
   * @param graph - Project graph section.
   * @param workspaceGraphs - Per-workspace graph sections.
   * @returns The configuration.
   */
  function configOf(
    workspaces: readonly WorkspaceIndexTarget[],
    graph?: GraphSection,
    workspaceGraphs: Record<string, WorkspaceGraph> = {},
  ): SpecdConfig {
    return {
      projectRoot: tempDir,
      ...(graph !== undefined ? { graph } : {}),
      workspaces: workspaces.map((ws) => ({
        name: ws.name,
        codeRoot: ws.codeRoot,
        ...(workspaceGraphs[ws.name] !== undefined ? { graph: workspaceGraphs[ws.name] } : {}),
      })),
    } as unknown as SpecdConfig
  }

  /**
   * Runs the use case.
   * @param path - Path input.
   * @param workspaces - Workspace targets.
   * @param config - Configuration.
   * @param provider - Optional provider double.
   * @param vcs - VCS resolver.
   * @returns The result.
   */
  function explain(
    path: string,
    workspaces: readonly WorkspaceIndexTarget[],
    config: SpecdConfig,
    provider: Partial<CodeGraphHostPort> = {},
    vcs = noVcs,
  ): Promise<ExplainGraphPathResult> {
    return new ExplainGraphPath(vcs).execute({
      path,
      config,
      workspaces,
      provider: provider as CodeGraphHostPort,
      adapters: [new TypeScriptLanguageAdapter()],
    })
  }

  describe('input forms', () => {
    it('Given a project-relative path, then it is explained as is', async () => {
      write(tempDir, { 'app/src/a.ts': 'export const a = 1\n' })
      const ws = [workspace('backend', 'app')]
      const result = await explain('app/src/a.ts', ws, configOf(ws))
      expect(result.projectRelativePath).toBe('app/src/a.ts')
      expect(result.verdict).toBe('indexable')
      expect(result.owners).toEqual(['backend'])
      expect(result.candidates[0]?.identity).toBe('backend:src/a.ts')
    })

    it('Given an absolute path inside the project, then it is converted to project-relative', async () => {
      write(tempDir, { 'app/src/a.ts': 'export const a = 1\n' })
      const ws = [workspace('backend', 'app')]
      const result = await explain(join(tempDir, 'app/src/a.ts'), ws, configOf(ws))
      expect(result.projectRelativePath).toBe('app/src/a.ts')
      expect(result.input).toBe(join(tempDir, 'app/src/a.ts'))
    })

    it('Given an absolute path outside the project, then PATH_OUTSIDE_PROJECT is reported', async () => {
      const ws = [workspace('backend', 'app')]
      const result = await explain(join(tmpdir(), 'elsewhere-file.ts'), ws, configOf(ws))
      expect(result.verdict).toBe('not-in-scope')
      expect(result.diagnostics.map((d) => d.code)).toContain('PATH_OUTSIDE_PROJECT')
    })

    it('Given workspace:path, then the candidate is pinned to that workspace', async () => {
      write(tempDir, { 'app/src/a.ts': 'export const a = 1\n' })
      const ws = [workspace('default', ''), workspace('backend', 'app')]
      const result = await explain('backend:src/a.ts', ws, configOf(ws))
      expect(result.candidates.map((c) => c.workspace)).toEqual(['backend'])
      expect(result.projectRelativePath).toBe('app/src/a.ts')
    })

    it('Given an unknown workspace, then UNKNOWN_WORKSPACE is thrown', async () => {
      const ws = [workspace('backend', 'app')]
      await expect(explain('nope:src/a.ts', ws, configOf(ws))).rejects.toMatchObject({
        code: 'UNKNOWN_WORKSPACE',
      })
    })

    it('Given a drive-letter path, then it is not parsed as a workspace path', async () => {
      const ws = [workspace('c', 'app')]
      const result = await explain('C:/project/src/a.ts', ws, configOf(ws)).catch((e: unknown) => e)
      // An unknown-workspace error would mean the drive letter was read as workspace `C`.
      expect((result as { code?: string }).code).not.toBe('UNKNOWN_WORKSPACE')
    })

    it('Given a relative input with backslashes, then they are treated as separators', async () => {
      write(tempDir, { 'app/src/a.ts': 'export const a = 1\n' })
      const ws = [workspace('backend', 'app')]
      const result = await explain('app\\src\\a.ts', ws, configOf(ws))
      expect(result.projectRelativePath).toBe('app/src/a.ts')
      expect(result.verdict).toBe('indexable')
    })

    it('Given a workspace-qualified input with backslashes, then they are treated as separators', async () => {
      write(tempDir, { 'app/src/a.ts': 'export const a = 1\n' })
      const ws = [workspace('backend', 'app')]
      const result = await explain('backend:src\\a.ts', ws, configOf(ws))
      expect(result.candidates[0]?.identity).toBe('backend:src/a.ts')
    })

    it('Given a Windows drive path on any host, then it is absolute and outside the project', async () => {
      const ws = [workspace('backend', 'app')]
      const result = await explain('C:\\other\\a.ts', ws, configOf(ws))
      expect(result.projectRelativePath).toBe('C:/other/a.ts')
      expect(result.verdict).toBe('not-in-scope')
      expect(result.diagnostics.map((d) => d.code)).toContain('PATH_OUTSIDE_PROJECT')
    })

    it('Given an empty input, then INVALID_GRAPH_WHY_PATH is thrown', async () => {
      const ws = [workspace('backend', 'app')]
      await expect(explain('  ', ws, configOf(ws))).rejects.toMatchObject({
        code: 'INVALID_GRAPH_WHY_PATH',
      })
    })

    it('Given a pinned path that escapes its code root, then INVALID_GRAPH_WHY_PATH is thrown', async () => {
      const ws = [workspace('backend', 'app')]
      await expect(explain('backend:../x.ts', ws, configOf(ws))).rejects.toMatchObject({
        code: 'INVALID_GRAPH_WHY_PATH',
      })
    })

    it('Given a path equal to a code root, then it is explained without evaluating patterns', async () => {
      mkdirSync(join(tempDir, 'app'), { recursive: true })
      const ws = [workspace('backend', 'app')]
      const result = await explain('app', ws, configOf(ws))
      expect(result.candidates).toHaveLength(1)
      expect(result.candidates[0]?.steps.every((s) => s.outcome === 'not-applicable')).toBe(true)
    })

    it('Given a missing file, then PATH_NOT_FOUND is reported and size and adapter do not apply', async () => {
      mkdirSync(join(tempDir, 'app'), { recursive: true })
      const ws = [workspace('backend', 'app')]
      const result = await explain('app/missing.ts', ws, configOf(ws))
      expect(result.diagnostics.map((d) => d.code)).toContain('PATH_NOT_FOUND')
      const candidate = result.candidates[0]!
      expect(step(candidate, 'size-limit').outcome).toBe('not-applicable')
      expect(step(candidate, 'adapter').outcome).toBe('not-applicable')
      expect(step(candidate, 'category').outcome).not.toBe('not-applicable')
    })

    it('Given any input, then nothing is written to the project', async () => {
      write(tempDir, { 'app/src/a.ts': 'export const a = 1\n' })
      const calls: string[] = []
      const provider: Partial<CodeGraphHostPort> = {
        getFile: async (path) => {
          calls.push(`getFile:${path}`)
          return undefined
        },
      }
      const ws = [workspace('backend', 'app')]
      await explain('app/src/a.ts', ws, configOf(ws), provider)
      expect(calls.every((call) => call.startsWith('getFile:'))).toBe(true)
    })
  })

  describe('candidates and owners', () => {
    it('Given one containing workspace, then it is the single owner', async () => {
      write(tempDir, { 'app/src/a.ts': 'export const a = 1\n' })
      const ws = [workspace('backend', 'app')]
      const result = await explain('app/src/a.ts', ws, configOf(ws))
      expect(result.owners).toEqual(['backend'])
      expect(result.diagnostics.map((d) => d.code)).not.toContain('MULTIPLE_OWNERS')
    })

    it('Given nested workspaces without partitioning, then both own the file and no preference is shown', async () => {
      write(tempDir, { 'app/webroot/a.ts': 'export const a = 1\n' })
      const ws = [workspace('backend', 'app'), workspace('backoffice', 'app/webroot')]
      const result = await explain('app/webroot/a.ts', ws, configOf(ws))
      expect(result.owners).toEqual(['backend', 'backoffice'])
      expect(result.candidates.map((c) => c.workspace)).toEqual(['backend', 'backoffice'])
      expect(result.diagnostics.map((d) => d.code)).toContain('MULTIPLE_OWNERS')
    })

    it('Given partitioning excludes, then only one workspace owns the file', async () => {
      write(tempDir, { 'app/webroot/a.ts': 'export const a = 1\n' })
      const ws = [workspace('backend', 'app'), workspace('backoffice', 'app/webroot')]
      const result = await explain(
        'app/webroot/a.ts',
        ws,
        configOf(ws, undefined, { backend: { excludePaths: ['app/webroot/'] } }),
      )
      expect(result.owners).toEqual(['backoffice'])
      expect(result.verdict).toBe('indexable')
    })

    it('Given a path excluded by every candidate, then the verdict is not-indexed', async () => {
      write(tempDir, { 'app/tmp/a.ts': 'export const a = 1\n' })
      const ws = [workspace('backend', 'app')]
      const result = await explain('app/tmp/a.ts', ws, configOf(ws, { excludePaths: ['app/tmp/'] }))
      expect(result.verdict).toBe('not-indexed')
      expect(result.owners).toEqual([])
    })

    it('Given a path covered by includePaths and no workspace, then the project-global candidate is used', async () => {
      write(tempDir, { 'docs/readme.md': '# hi\n' })
      const ws = [workspace('backend', 'app')]
      const result = await explain(
        'docs/readme.md',
        ws,
        configOf(ws, { includePaths: ['docs/**'] }),
      )
      expect(result.owners).toEqual(['root'])
      expect(result.candidates[0]).toMatchObject({
        workspace: null,
        identity: 'root:docs/readme.md',
      })
    })

    it('Given an includePaths match that a global exclusion removes, then the root evaluation is reported as not-indexed', async () => {
      write(tempDir, { 'docs/secret/readme.md': '# hi\n' })
      const ws = [workspace('backend', 'app')]
      const result = await explain(
        'docs/secret/readme.md',
        ws,
        configOf(ws, { includePaths: ['docs/**'], excludePaths: ['docs/secret/'] }),
      )
      expect(result.verdict).toBe('not-indexed')
      expect(result.owners).toEqual([])
      expect(result.candidates[0]).toMatchObject({ workspace: null, verdict: 'excluded' })
      expect(step(result.candidates[0]!, 'global-exclude').rule?.pattern).toBe('docs/secret/')
    })

    it('Given a path outside every workspace and includePaths, then it is not in scope', async () => {
      write(tempDir, { 'docs/readme.md': '# hi\n' })
      const ws = [workspace('backend', 'app')]
      const result = await explain('docs/readme.md', ws, configOf(ws))
      expect(result.verdict).toBe('not-in-scope')
      expect(result.candidates).toEqual([])
    })

    it('Given a code root outside the project, then CODE_ROOT_OUTSIDE_PROJECT is reported', async () => {
      const outside = mkdtempSync(join(tmpdir(), 'specd-explain-outside-'))
      try {
        write(outside, { 'a.ts': 'export const a = 1\n' })
        const ws: WorkspaceIndexTarget[] = [
          { ...workspace('shared', 'x'), codeRoot: outside } as WorkspaceIndexTarget,
        ]
        const result = await explain(`shared:a.ts`, ws, configOf(ws))
        expect(result.diagnostics.map((d) => d.code)).toContain('CODE_ROOT_OUTSIDE_PROJECT')
      } finally {
        rmSync(outside, { recursive: true, force: true })
      }
    })
  })

  describe('steps and verdicts', () => {
    it('Given an indexable file, then eight stages are reported in indexer order', async () => {
      write(tempDir, { 'app/src/a.ts': 'export const a = 1\n' })
      const ws = [workspace('backend', 'app')]
      const result = await explain('app/src/a.ts', ws, configOf(ws))
      expect(result.candidates[0]?.steps.map((s) => s.stage)).toEqual([
        'binary-extension',
        'gitignore',
        'global-exclude',
        'workspace-exclude',
        'allowed-paths',
        'size-limit',
        'category',
        'adapter',
      ])
      const candidate = result.candidates[0]!
      expect(candidate.kind).toBe('file')
      expect(candidate.category).toBe('source')
      expect(step(candidate, 'adapter').detail?.language).toBe('typescript')
    })

    it('Given an exclusion, then evaluation stops and later stages are not-applicable', async () => {
      write(tempDir, { 'app/tmp/a.ts': 'export const a = 1\n' })
      const ws = [workspace('backend', 'app')]
      const result = await explain('app/tmp/a.ts', ws, configOf(ws, { excludePaths: ['app/tmp/'] }))
      const candidate = result.candidates[0]!
      expect(candidate.verdict).toBe('excluded')
      expect(step(candidate, 'global-exclude')).toMatchObject({
        outcome: 'matched',
        rule: {
          pattern: 'app/tmp/',
          negated: false,
          origin: { layer: 'global', key: 'graph.excludePaths' },
          viaDirectory: 'app/tmp',
        },
      })
      expect(step(candidate, 'workspace-exclude').outcome).toBe('not-applicable')
      expect(step(candidate, 'size-limit').outcome).toBe('not-applicable')
      expect(candidate.category).toBeNull()
    })

    it('Given a gitignore match, then the origin carries the .gitignore file and line', async () => {
      write(tempDir, { 'app/.gitignore': '# c\nbuild.log\n', 'app/build.log': 'x' })
      const ws = [workspace('backend', 'app')]
      const result = await explain('app/build.log', ws, configOf(ws), {}, rootedVcs)
      const gitignore = step(result.candidates[0]!, 'gitignore')
      expect(gitignore.outcome).toBe('matched')
      expect(gitignore.rule?.origin).toMatchObject({
        layer: 'gitignore',
        sourceFile: 'app/.gitignore',
        line: 2,
      })
    })

    it('Given respectGitignore false, then the gitignore stage is not-applicable', async () => {
      write(tempDir, { 'app/.gitignore': 'build.log\n', 'app/build.log': 'x' })
      const ws = [workspace('backend', 'app')]
      const result = await explain(
        'app/build.log',
        ws,
        configOf(ws, undefined, { backend: { respectGitignore: false } }),
        {},
        rootedVcs,
      )
      expect(step(result.candidates[0]!, 'gitignore').outcome).toBe('not-applicable')
    })

    it('Given a spec-root exclusion, then the origin layer is spec-root', async () => {
      write(tempDir, { 'app/specs/note.ts': 'export const n = 1\n' })
      const ws = [workspace('backend', 'app', 'app/specs')]
      const result = await explain('app/specs/note.ts', ws, configOf(ws))
      expect(step(result.candidates[0]!, 'global-exclude').rule?.origin).toMatchObject({
        layer: 'spec-root',
        sourceFile: 'app/specs',
      })
    })

    it('Given a built-in default exclusion, then the origin layer is default', async () => {
      write(tempDir, { 'app/node_modules/x/index.ts': 'export const n = 1\n' })
      const ws = [workspace('backend', 'app')]
      const result = await explain('app/node_modules/x/index.ts', ws, configOf(ws))
      expect(step(result.candidates[0]!, 'global-exclude').rule?.origin).toMatchObject({
        layer: 'default',
        key: 'graph.excludePaths',
      })
    })

    it('Given a workspace exclusion, then the origin names the workspace and key', async () => {
      write(tempDir, { 'app/gen/a.ts': 'export const a = 1\n' })
      const ws = [workspace('backend', 'app')]
      const result = await explain(
        'app/gen/a.ts',
        ws,
        configOf(ws, undefined, { backend: { excludePaths: ['app/gen/'] } }),
      )
      expect(step(result.candidates[0]!, 'workspace-exclude').rule?.origin).toEqual({
        layer: 'workspace',
        workspace: 'backend',
        key: 'workspaces.backend.graph.excludePaths',
      })
    })

    it('Given a global exclusion and a workspace negation, then the negation is reported as blocked', async () => {
      write(tempDir, { 'app/vendors/iccms/a.ts': 'export const a = 1\n' })
      const ws = [workspace('backend', 'app')]
      const result = await explain(
        'app/vendors/iccms/a.ts',
        ws,
        configOf(
          ws,
          { excludePaths: ['app/vendors/*'] },
          {
            backend: { excludePaths: ['!app/vendors/iccms'] },
          },
        ),
      )
      const candidate = result.candidates[0]!
      expect(candidate.verdict).toBe('excluded')
      expect(step(candidate, 'global-exclude').detail?.workspaceNegationBlocked).toBe(true)
    })

    it('Given a workspace list with a negation, then the deciding rule is reported as a negation', async () => {
      write(tempDir, { 'app/gen/keep.ts': 'export const k = 1\n', 'app/gen/other.ts': 'x' })
      const ws = [workspace('backend', 'app')]
      const config = configOf(ws, undefined, {
        backend: { excludePaths: ['app/gen/**', '!app/gen/keep.ts'] },
      })
      const kept = await explain('app/gen/keep.ts', ws, config)
      expect(kept.candidates[0]?.verdict).toBe('indexable')
      expect(step(kept.candidates[0]!, 'workspace-exclude')).toMatchObject({
        outcome: 'matched',
        rule: { pattern: '!app/gen/keep.ts', negated: true },
      })
      const dropped = await explain('app/gen/other.ts', ws, config)
      expect(dropped.candidates[0]?.verdict).toBe('excluded')
    })

    it('Given a global negation that includes a path, then the path is indexable with the negation reported', async () => {
      write(tempDir, { 'app/vendors/iccms/a.ts': 'export const a = 1\n' })
      const ws = [workspace('backend', 'app')]
      const result = await explain(
        'app/vendors/iccms/a.ts',
        ws,
        configOf(ws, {
          excludePaths: ['app/vendors/*', '!app/vendors/iccms', '!app/vendors/iccms/**'],
        }),
      )
      expect(result.candidates[0]?.verdict).toBe('indexable')
      expect(step(result.candidates[0]!, 'global-exclude').rule?.negated).toBe(true)
    })

    it('Given allowedPaths that do not match, then the verdict is not-allowed', async () => {
      write(tempDir, { 'app/src/a.ts': 'export const a = 1\n' })
      const ws = [workspace('backend', 'app')]
      const result = await explain(
        'app/src/a.ts',
        ws,
        configOf(ws, undefined, { backend: { allowedPaths: ['app/lib/**'] } }),
      )
      const candidate = result.candidates[0]!
      expect(candidate.verdict).toBe('not-allowed')
      expect(step(candidate, 'allowed-paths').outcome).toBe('matched')
      expect(step(candidate, 'allowed-paths').rule).toBeUndefined()
    })

    it('Given an oversized file, then the size gate marks it too-large, and an exemption passes it', async () => {
      write(tempDir, { 'app/gen/big.ts': 'export const b = 1\n'.padEnd(300 * 1024, ' ') })
      const ws = [workspace('backend', 'app')]
      const tooLarge = await explain('app/gen/big.ts', ws, configOf(ws))
      expect(tooLarge.candidates[0]?.verdict).toBe('too-large')
      expect(step(tooLarge.candidates[0]!, 'size-limit').detail).toMatchObject({
        exempt: false,
        limitBytes: 262144,
      })

      const exempt = await explain(
        'app/gen/big.ts',
        ws,
        configOf(ws, undefined, { backend: { largeFilePaths: ['app/gen/**'] } }),
      )
      expect(exempt.candidates[0]?.verdict).toBe('indexable')
      expect(step(exempt.candidates[0]!, 'size-limit')).toMatchObject({
        outcome: 'matched',
        rule: {
          pattern: 'app/gen/**',
          origin: { layer: 'workspace', key: 'workspaces.backend.graph.largeFilePaths' },
        },
      })
    })

    it('Given a category rule, then the level and key are reported', async () => {
      write(tempDir, { 'app/fixtures/a.ts': 'export const a = 1\n' })
      const ws = [workspace('backend', 'app')]
      const result = await explain(
        'app/fixtures/a.ts',
        ws,
        configOf(ws, { ignorePaths: ['app/fixtures/**'] }),
      )
      expect(result.candidates[0]?.category).toBe('ignored')
      expect(step(result.candidates[0]!, 'category').rule).toMatchObject({
        pattern: 'app/fixtures/**',
        origin: { layer: 'global', key: 'graph.ignorePaths' },
      })
    })

    it('Given default test patterns, then the category origin layer is default', async () => {
      write(tempDir, { 'app/src/a.spec.ts': 'export const a = 1\n' })
      const ws = [workspace('backend', 'app')]
      const result = await explain('app/src/a.spec.ts', ws, configOf(ws))
      expect(result.candidates[0]?.category).toBe('test')
      expect(step(result.candidates[0]!, 'category').rule?.origin.layer).toBe('default')
    })

    it('Given a binary extension or a symlink, then a built-in rule excludes it', async () => {
      write(tempDir, { 'app/logo.png': 'x', 'app/src/a.ts': 'export const a = 1\n' })
      symlinkSync(join(tempDir, 'app/src/a.ts'), join(tempDir, 'app/link.ts'))
      const ws = [workspace('backend', 'app')]
      const png = await explain('app/logo.png', ws, configOf(ws))
      expect(step(png.candidates[0]!, 'binary-extension').rule).toMatchObject({
        pattern: '.png',
        origin: { layer: 'builtin' },
      })
      const link = await explain('app/link.ts', ws, configOf(ws))
      expect(link.candidates[0]?.verdict).toBe('excluded')
      expect(step(link.candidates[0]!, 'binary-extension').rule?.pattern).toBe('symlink')
    })

    it('Given a file without an adapter whose content is binary, then it is excluded as non-text content', async () => {
      write(tempDir, { 'app/blob.dat': Buffer.from([0, 159, 146, 150, 0, 1, 2, 255]) })
      const ws = [workspace('backend', 'app')]
      const result = await explain('app/blob.dat', ws, configOf(ws))
      const candidate = result.candidates[0]!
      expect(candidate.verdict).toBe('excluded')
      expect(step(candidate, 'adapter')).toMatchObject({
        outcome: 'matched',
        rule: { pattern: 'non-text-content', origin: { layer: 'builtin' } },
      })
      expect(result.verdict).toBe('not-indexed')
    })

    it('Given a repository .gitignore reached through a symlinked code root, then the source file is project-relative', async () => {
      write(tempDir, { '.gitignore': '# c\n*.log\n', 'app/a.log': 'x' })
      const link = `${tempDir}-applink`
      symlinkSync(join(tempDir, 'app'), link)
      try {
        const ws = [{ ...workspace('backend', 'app'), codeRoot: link } as WorkspaceIndexTarget]
        const result = await explain('backend:a.log', ws, configOf(ws), {}, rootedVcs)
        expect(step(result.candidates[0]!, 'gitignore').rule?.origin).toMatchObject({
          layer: 'gitignore',
          sourceFile: '.gitignore',
          line: 2,
        })
      } finally {
        rmSync(link, { force: true })
      }
    })

    it('Given an intermediate .gitignore, then explain names it relative to the project root', async () => {
      write(tempDir, { 'packages/.gitignore': '*.gen.ts\n', 'packages/core/a.gen.ts': 'x' })
      const ws = [workspace('core', 'packages/core')]
      const result = await explain('packages/core/a.gen.ts', ws, configOf(ws), {}, rootedVcs)
      expect(step(result.candidates[0]!, 'gitignore').rule?.origin).toMatchObject({
        layer: 'gitignore',
        sourceFile: 'packages/.gitignore',
        line: 1,
      })
    })

    it('Given a directory that matches includePaths as a directory pattern, then the root evaluation is reported', async () => {
      mkdirSync(join(tempDir, 'docs/guide'), { recursive: true })
      const ws = [workspace('backend', 'app')]
      const result = await explain(
        'docs/guide',
        ws,
        configOf(ws, { includePaths: ['docs/guide/'] }),
      )
      expect(result.candidates[0]).toMatchObject({ workspace: null, identity: 'root:docs/guide' })
    })

    it('Given a text file without a language adapter, then it is a document', async () => {
      write(tempDir, { 'app/notes.txt': 'hello\n' })
      const ws = [workspace('backend', 'app')]
      const result = await explain('app/notes.txt', ws, configOf(ws))
      expect(result.candidates[0]?.kind).toBe('document')
      expect(step(result.candidates[0]!, 'adapter').detail?.kind).toBe('document')
    })

    it('Given a directory input, then size, category and adapter do not apply', async () => {
      mkdirSync(join(tempDir, 'app/src'), { recursive: true })
      const ws = [workspace('backend', 'app')]
      const result = await explain('app/src', ws, configOf(ws))
      const candidate = result.candidates[0]!
      expect(candidate.kind).toBeNull()
      expect(candidate.category).toBeNull()
      expect(step(candidate, 'size-limit').outcome).toBe('not-applicable')
      expect(step(candidate, 'adapter').outcome).toBe('not-applicable')
    })
  })

  describe('observed graph state', () => {
    const setup = (): WorkspaceIndexTarget[] => {
      write(tempDir, { 'app/src/a.ts': 'export const a = 1\n' })
      return [workspace('backend', 'app')]
    }

    it('Given the node is in the store, then inGraph is true', async () => {
      const ws = setup()
      const result = await explain('app/src/a.ts', ws, configOf(ws), {
        getFile: async () => ({}) as never,
      })
      expect(result.candidates[0]?.inGraph).toBe(true)
    })

    it('Given the node is not stored, then inGraph is false', async () => {
      const ws = setup()
      const result = await explain('app/src/a.ts', ws, configOf(ws), {
        getFile: async () => undefined,
      })
      expect(result.candidates[0]?.inGraph).toBe(false)
    })

    it('Given the store cannot be read, then inGraph is null and the use case does not throw', async () => {
      const ws = setup()
      const throwing = await explain('app/src/a.ts', ws, configOf(ws), {
        getFile: async () => {
          throw new Error('closed')
        },
      })
      expect(throwing.candidates[0]?.inGraph).toBeNull()
      const missing = await explain('app/src/a.ts', ws, configOf(ws), {})
      expect(missing.candidates[0]?.inGraph).toBeNull()
    })

    it('Given an excluded path, then both file and document lookups are tried', async () => {
      write(tempDir, { 'app/tmp/a.ts': 'export const a = 1\n' })
      const ws = [workspace('backend', 'app')]
      const asked: string[] = []
      await explain('app/tmp/a.ts', ws, configOf(ws, { excludePaths: ['app/tmp/'] }), {
        getFile: async () => {
          asked.push('file')
          return undefined
        },
        getDocument: async () => {
          asked.push('document')
          return undefined
        },
      })
      expect(asked.sort()).toEqual(['document', 'file'])
    })
  })

  describe('equivalence with indexing', () => {
    it('Given a fixture with exclusions, allowedPaths, an oversized file and categories, then indexable matches indexed', async () => {
      write(tempDir, {
        'app/src/a.ts': 'export const a = 1\n',
        'app/src/a.spec.ts': 'export const t = 1\n',
        'app/vendors/other/x.ts': 'export const x = 1\n',
        'app/vendors/iccms/y.ts': 'export const y = 1\n',
        'app/tmp/c.ts': 'export const c = 1\n',
        'app/fixtures/f.ts': 'export const f = 1\n',
        'app/big/b.ts': 'export const b = 1\n'.padEnd(300 * 1024, ' '),
        'app/notes.txt': 'hello\n',
        'app/webroot/w.ts': 'export const w = 1\n',
        'other/z.ts': 'export const z = 1\n',
      })
      const graph: GraphSection = {
        excludePaths: [
          'node_modules/',
          'app/vendors/*',
          '!app/vendors/iccms',
          '!app/vendors/iccms/**',
          'app/tmp/',
        ],
        ignorePaths: ['app/fixtures/**'],
      }
      const ws = [workspace('backend', 'app'), workspace('backoffice', 'app/webroot')]
      const config = configOf(ws, graph, {
        backend: { excludePaths: ['app/webroot/'], allowedPaths: ['app/**'] },
      })

      const store = new InMemoryGraphStore(tempDir)
      await store.open()
      const registry = new AdapterRegistry()
      registry.register(new TypeScriptLanguageAdapter())
      await new IndexCodeGraph(
        store,
        registry,
        emptyResolutionManifestSource,
        emptyRepositoryRootSource,
        new NodeWorkspaceAccessibilitySource(),
      ).execute({
        projectRoot: tempDir,
        vcsRoot: null,
        workspaces: ws,
        graphConfig: buildProjectGraphConfig(config),
      })
      const indexed = new Map<string, string>()
      for (const file of await store.getAllFiles()) indexed.set(file.path, file.category)
      for (const document of await store.getAllDocuments()) indexed.set(document.path, 'document')

      const everyFile = [
        'app/src/a.ts',
        'app/src/a.spec.ts',
        'app/vendors/other/x.ts',
        'app/vendors/iccms/y.ts',
        'app/tmp/c.ts',
        'app/fixtures/f.ts',
        'app/big/b.ts',
        'app/notes.txt',
        'app/webroot/w.ts',
        'other/z.ts',
      ]
      for (const file of everyFile) {
        const result = await explain(file, ws, config)
        for (const candidate of result.candidates) {
          const wasIndexed = indexed.has(candidate.identity)
          expect(candidate.verdict === 'indexable', `${candidate.identity} indexable`).toBe(
            wasIndexed,
          )
          if (wasIndexed && candidate.kind === 'file') {
            expect(candidate.category, `${candidate.identity} category`).toBe(
              indexed.get(candidate.identity),
            )
          }
        }
      }
    })
  })
})
