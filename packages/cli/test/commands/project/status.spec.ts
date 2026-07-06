import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from '../helpers.js'

vi.mock('@specd/sdk', async () => {
  const actual = await vi.importActual<typeof import('@specd/sdk')>('@specd/sdk')
  return {
    ...actual,
    openSpecdHost: vi.fn(),
    buildProjectStatusSnapshot: vi.fn(),
  }
})

vi.mock('../../../src/helpers/cli-context.js', async () => {
  const actual = await vi.importActual<typeof import('../../../src/helpers/cli-context.js')>(
    '../../../src/helpers/cli-context.js',
  )
  return {
    ...actual,
    buildCliKernelOptions: vi.fn(() => ({})),
  }
})

import { openSpecdHost, buildProjectStatusSnapshot, type GetGraphHealthResult } from '@specd/sdk'
import { registerProjectStatus } from '../../../src/commands/project/status.js'
import { type MockKernel } from '../helpers.js'

const emptySummary = {
  activeCount: 0,
  draftCount: 0,
  discardedCount: 0,
  archivedCount: 0,
  specsByWorkspace: {} as Record<string, number>,
  workspaceCount: 0,
}

function stubSnapshot(
  kernel: MockKernel,
  summary = emptySummary,
  graphHealth: GetGraphHealthResult | null = {
    lastIndexedAt: '2026-01-01',
    stale: false,
    fingerprintMismatch: false,
    fileCount: 0,
    documentCount: 0,
    symbolCount: 0,
    specCount: 0,
    relationCounts: {} as GetGraphHealthResult['relationCounts'],
    languages: [],
    lastIndexedRef: null,
    graphFingerprint: null,
    currentRef: null,
  },
) {
  kernel.project.listWorkspaces.execute.mockResolvedValue([])
  vi.mocked(buildProjectStatusSnapshot).mockResolvedValue({
    summary,
    graphHealth,
    approvals: { specEnabled: false, signoffEnabled: false },
    llmOptimizedContext: false,
  })
}

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(openSpecdHost).mockResolvedValue({
    config,
    configFilePath: null,
    kernel,
    createGraphProvider: vi.fn(),
  })
  stubSnapshot(kernel)
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('project status', () => {
  it('command name is status', async () => {
    setup()

    const program = makeProgram()
    const projectCmd = program.command('project')
    registerProjectStatus(projectCmd)

    const statusCmd = projectCmd.commands.find((c) => c.name() === 'status')
    expect(statusCmd).toBeDefined()
  })

  it('obtains change and spec counts via getProjectSummary', async () => {
    const { kernel, stdout } = setup()
    stubSnapshot(kernel, {
      activeCount: 2,
      draftCount: 1,
      discardedCount: 3,
      archivedCount: 4,
      specsByWorkspace: { default: 5, core: 7 },
      workspaceCount: 2,
    })

    const program = makeProgram()
    registerProjectStatus(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'status'])

    expect(buildProjectStatusSnapshot).toHaveBeenCalledWith(expect.objectContaining({ kernel }), {
      includeGraph: true,
      includeHotspots: false,
    })

    const out = stdout()
    expect(out).toContain('changes: 2 active, 1 drafts, 3 discarded, 4 archived')
    expect(out).toContain('specs: 12 total')
    expect(out).toContain('default: 5')
    expect(out).toContain('core: 7')
  })

  it('includes archived count in JSON output', async () => {
    const { kernel, stdout } = setup()
    stubSnapshot(kernel, {
      activeCount: 1,
      draftCount: 2,
      discardedCount: 3,
      archivedCount: 4,
      specsByWorkspace: { default: 5 },
      workspaceCount: 1,
    })

    const program = makeProgram()
    registerProjectStatus(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'status', '--format', 'json'])

    const parsed = JSON.parse(stdout()) as {
      changes: { active: number; drafts: number; discarded: number; archived: number }
    }
    expect(parsed.changes).toEqual({
      active: 1,
      drafts: 2,
      discarded: 3,
      archived: 4,
    })
  })

  it('includes archived count in TOON output', async () => {
    const { kernel, stdout } = setup()
    stubSnapshot(kernel, {
      activeCount: 0,
      draftCount: 0,
      discardedCount: 0,
      archivedCount: 9,
      specsByWorkspace: { default: 0 },
      workspaceCount: 1,
    })

    const program = makeProgram()
    registerProjectStatus(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'status', '--format', 'toon'])

    expect(stdout()).toContain('archived: 9')
  })

  describe('--context', () => {
    it('prefers optimized project context when fresh', async () => {
      const { config, kernel, stdout } = setup()
      Object.assign(config, {
        llmOptimizedContext: true,
      })
      stubSnapshot(kernel)

      kernel.project.getProjectContext.execute.mockResolvedValue({
        contextEntries: ['**Optimized Context**'],
        specs: [],
        warnings: [],
      })

      const program = makeProgram()
      registerProjectStatus(program.command('project'))
      await program.parseAsync(['node', 'specd', 'project', 'status', '--context'])

      const out = stdout()
      expect(out).toContain('context:')
      expect(out).toContain('**Optimized Context**')
    })

    it('emits warning when optimized context is missing', async () => {
      const { config, kernel, stderr } = setup()
      Object.assign(config, {
        llmOptimizedContext: true,
      })
      stubSnapshot(kernel)

      kernel.project.getProjectContext.execute.mockResolvedValue({
        contextEntries: ['Raw instructions'],
        specs: [],
        warnings: [
          {
            type: 'stale-optimization',
            message:
              'Project-level optimized context is missing. Launch specd-project-context-optimizer agent to generate it.',
          },
        ],
      })

      const program = makeProgram()
      registerProjectStatus(program.command('project'))
      await program.parseAsync(['node', 'specd', 'project', 'status', '--context'])

      expect(stderr()).toContain('warning: Project-level optimized context is missing')
      expect(stderr()).toContain('specd-project-context-optimizer')
    })

    it('displays full context in text mode', async () => {
      const { kernel, stdout } = setup()
      stubSnapshot(kernel)

      const longContext = 'Line 1\nLine 2\nLine 3\nLine 4'
      kernel.project.getProjectContext.execute.mockResolvedValue({
        contextEntries: [longContext],
        specs: [],
        warnings: [],
      })

      const program = makeProgram()
      registerProjectStatus(program.command('project'))
      await program.parseAsync(['node', 'specd', 'project', 'status', '--context'])

      const out = stdout()
      expect(out).toContain('Line 1')
      expect(out).toContain('Line 2')
      expect(out).toContain('Line 3')
      expect(out).toContain('Line 4')
    })

    it('does not pass inline CompileContextConfig on getProjectContext.execute', async () => {
      const { kernel } = setup()
      stubSnapshot(kernel)
      kernel.project.getProjectContext.execute.mockResolvedValue({
        contextEntries: [],
        specs: [],
        warnings: [],
      })

      const program = makeProgram()
      registerProjectStatus(program.command('project'))
      await program.parseAsync(['node', 'specd', 'project', 'status', '--context'])

      for (const call of kernel.project.getProjectContext.execute.mock.calls) {
        expect(call[0]).not.toHaveProperty('config')
      }
    })

    it('calls getProjectContext.execute({}) for primary context assembly', async () => {
      const { kernel } = setup()
      stubSnapshot(kernel)
      kernel.project.getProjectContext.execute.mockResolvedValue({
        contextEntries: ['Raw'],
        specs: [
          {
            specId: 'default:a',
            title: 'A',
            description: '',
            source: 'includePattern',
            mode: 'summary',
          },
        ],
        warnings: [],
      })

      const program = makeProgram()
      registerProjectStatus(program.command('project'))
      await program.parseAsync(['node', 'specd', 'project', 'status', '--context'])

      expect(kernel.project.getProjectContext.execute.mock.calls[0]![0]).toEqual({})
    })

    it('calls getProjectContext.execute({ llmOptimizedContext: false }) for raw spec catalogue when optimized context is fresh', async () => {
      const { config, kernel } = setup()
      Object.assign(config, { llmOptimizedContext: true })
      stubSnapshot(kernel)

      kernel.project.getProjectContext.execute
        .mockResolvedValueOnce({
          contextEntries: ['**Optimized**'],
          specs: [],
          warnings: [],
        })
        .mockResolvedValueOnce({
          contextEntries: [],
          specs: [
            {
              specId: 'default:auth/login',
              title: 'Login',
              description: '',
              source: 'includePattern' as const,
              mode: 'summary' as const,
            },
          ],
          warnings: [],
        })

      const program = makeProgram()
      registerProjectStatus(program.command('project'))
      await program.parseAsync(['node', 'specd', 'project', 'status', '--context'])

      expect(kernel.project.getProjectContext.execute).toHaveBeenCalledTimes(2)
      expect(kernel.project.getProjectContext.execute.mock.calls[1]![0]).toEqual({
        llmOptimizedContext: false,
      })
    })
  })

  // specs/cli/project-status — graph freshness when graph unavailable
  it('Scenario: Graph freshness shows unknown when graphHealth is null', async () => {
    const { kernel, stdout } = setup()
    stubSnapshot(kernel, emptySummary, null)

    const program = makeProgram()
    registerProjectStatus(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'status'])

    expect(stdout()).toContain('graph.freshness: never indexed (unknown)')
  })

  // specs/cli/project-status/verify.md — Extended graph stats with --graph flag
  it('Scenario: Extended graph stats with --graph flag', async () => {
    const { kernel, stdout } = setup()
    stubSnapshot(kernel, emptySummary, {
      lastIndexedAt: '2026-01-01',
      stale: false,
      fingerprintMismatch: false,
      fileCount: 42,
      documentCount: 1,
      symbolCount: 99,
      specCount: 3,
      relationCounts: {} as GetGraphHealthResult['relationCounts'],
      languages: ['typescript', 'go'],
      lastIndexedRef: 'abc',
      graphFingerprint: null,
      currentRef: 'abc',
    })

    const program = makeProgram()
    registerProjectStatus(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'status', '--graph'])

    const out = stdout()
    expect(out).toContain('graph.files: 42')
    expect(out).toContain('graph.symbols: 99')
    expect(out).toContain('graph.languages: typescript, go')
  })

  it('omits extended graph stats when --graph is set but graphHealth is null', async () => {
    const { kernel, stdout } = setup()
    stubSnapshot(kernel, emptySummary, null)

    const program = makeProgram()
    registerProjectStatus(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'status', '--graph'])

    const out = stdout()
    expect(out).not.toContain('graph.files:')
    expect(out).not.toContain('graph.symbols:')
  })
})
