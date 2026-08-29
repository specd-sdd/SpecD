import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
  ExitSentinel,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
  buildCliKernelOptions: vi.fn(() => ({})),
}))

const mockExecuteSuggestSpecs = vi.fn().mockResolvedValue({
  result: 'ok',
  summary: {
    totalFilesAnalyzed: 10,
    totalSymbolsAnalyzed: 25,
    totalWorkspaces: 2,
    totalSpecsSuggested: 2,
    highConfidenceSpecsCount: 2,
    codeCoveragePercentage: 95.0,
    averageConfidence: 0.9,
    byPriority: { 'P0 (Critical)': 1, 'P1 (High)': 1, 'P2 (Medium)': 0 },
    byCategory: { APPLICATION_USE_CASE: 2 },
    uncoveredFilesCount: 0,
  },
  suggestedSpecs: [
    {
      id: 'core:create-change',
      title: 'Create Change Workflow & Use Case',
      workspace: 'core',
      category: 'APPLICATION_USE_CASE',
      priority: 'P0 (Critical)',
      confidence: 0.95,
      confidenceBreakdown: {
        callerEvidence: 25,
        architecturalClarity: 25,
        graphCouplingCohesion: 20,
        publicSurface: 13,
        testAlignmentEvidence: 15,
        total: 98,
      },
      rationale: {
        whyNeeded: 'Discovered use case capability in core',
        blastRadiusSummary: 'Referenced by 5 callers',
        architecturalRole: 'Encapsulates creation workflow',
        keyEvidence: ['Primary implementation in create-change.ts'],
      },
      primaryFiles: ['packages/core/src/application/use-cases/create-change.ts'],
      testFiles: ['packages/core/test/application/use-cases/create-change.spec.ts'],
      anchorSymbols: [
        {
          id: 'sym:1',
          name: 'CreateChange',
          kind: 'class',
          filePath: 'packages/core/src/application/use-cases/create-change.ts',
        },
      ],
      hotspots: [],
      dependsOnSpecs: [],
    },
  ],
})

vi.mock('@specd/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@specd/sdk')>()
  return {
    ...actual,
    openSuggestSpecs: vi.fn(() => ({
      execute: mockExecuteSuggestSpecs,
    })),
  }
})

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerSpecSuggest } from '../../src/commands/spec/suggest.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({
    config,
    configFilePath: null,
    kernel,
  })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { stdout, stderr, kernel }
}

describe('spec suggest CLI command', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('runs suggest command and renders human-readable report', async () => {
    const { stdout } = setup()
    const program = makeProgram()
    const specCmd = program.command('spec')
    registerSpecSuggest(specCmd)

    await program.parseAsync(['node', 'specd', 'spec', 'suggest'])

    expect(mockExecuteSuggestSpecs).toHaveBeenCalled()
    expect(stdout()).toContain('suggested specifications:')
    expect(stdout()).toContain('core:create-change')
    expect(stdout()).toContain('Create Change Workflow & Use Case')
  })

  it('outputs valid JSON when --json flag is passed', async () => {
    const { stdout } = setup()
    const program = makeProgram()
    const specCmd = program.command('spec')
    registerSpecSuggest(specCmd)

    await program.parseAsync(['node', 'specd', 'spec', 'suggest', '--json'])

    expect(mockExecuteSuggestSpecs).toHaveBeenCalled()
    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.summary.totalSpecsSuggested).toBe(2)
  })

  it('passes workspace, limit, and min-confidence options to SDK', async () => {
    setup()
    const program = makeProgram()
    const specCmd = program.command('spec')
    registerSpecSuggest(specCmd)

    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'suggest',
      '--workspace',
      'core',
      '--limit',
      '5',
      '--min-confidence',
      '0.85',
      '--ignore-current-specs',
    ])

    expect(mockExecuteSuggestSpecs).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceFilter: 'core',
        limit: 5,
        minConfidence: 0.85,
        ignoreCurrentSpecs: true,
      }),
    )
  })

  it('renders specification gaps header when existing specs are present', async () => {
    const { stdout } = setup()
    mockExecuteSuggestSpecs.mockResolvedValueOnce({
      result: 'ok',
      summary: {
        totalFilesAnalyzed: 10,
        totalSymbolsAnalyzed: 25,
        totalWorkspaces: 1,
        totalSpecsSuggested: 1,
        highConfidenceSpecsCount: 1,
        codeCoveragePercentage: 80.0,
        averageConfidence: 0.85,
        byPriority: { 'P0 (Critical)': 1 },
        byCategory: { APPLICATION_USE_CASE: 1 },
        uncoveredFilesCount: 1,
        existingSpecsCount: 5,
      },
      suggestedSpecs: [
        {
          id: 'core:edit-change',
          title: 'Edit Change',
          workspace: 'core',
          category: 'APPLICATION_USE_CASE',
          priority: 'P0 (Critical)',
          confidence: 0.85,
          confidenceBreakdown: {
            callerEvidence: 20,
            architecturalClarity: 25,
            graphCouplingCohesion: 15,
            publicSurface: 10,
            testAlignmentEvidence: 15,
            total: 85,
          },
          rationale: {
            whyNeeded: 'Discovered missing capability gap',
            blastRadiusSummary: 'Referenced by 3 callers',
            architecturalRole: 'Encapsulates edit workflow',
            keyEvidence: ['edit-change.ts'],
          },
          primaryFiles: ['packages/core/src/application/use-cases/edit-change.ts'],
          testFiles: [],
          anchorSymbols: [],
          hotspots: [],
          dependsOnSpecs: [],
        },
      ],
    })

    const program = makeProgram()
    const specCmd = program.command('spec')
    registerSpecSuggest(specCmd)

    await program.parseAsync(['node', 'specd', 'spec', 'suggest'])

    expect(stdout()).toContain('specification gaps:')
    expect(stdout()).toContain('gaps: 1 gap(s)')
    expect(stdout()).toContain('core:edit-change')
  })
})
