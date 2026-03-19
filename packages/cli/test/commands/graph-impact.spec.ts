import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

vi.mock('../../src/commands/graph/with-provider.js', () => ({
  withProvider: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { withProvider } from '../../src/commands/graph/with-provider.js'
import { registerGraphImpact } from '../../src/commands/graph/impact.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({ config, kernel })

  const mockProvider = {
    analyzeImpact: vi.fn(),
    analyzeFileImpact: vi.fn(),
    detectChanges: vi.fn(),
    findSymbols: vi.fn(),
  }
  vi.mocked(withProvider).mockImplementation(async (_config, _format, fn) => {
    await fn(mockProvider as never)
  })

  const getStdout = captureStdout()
  const getStderr = captureStderr()
  mockProcessExit()
  return { config, kernel, mockProvider, getStdout, getStderr }
}

function makeImpactProgram() {
  const program = makeProgram()
  const graph = program.command('graph')
  registerGraphImpact(graph)
  return program
}

afterEach(() => vi.restoreAllMocks())

describe('graph impact', () => {
  describe('--depth option', () => {
    it('passes default depth 3 to analyzeFileImpact', async () => {
      const { mockProvider } = setup()
      mockProvider.analyzeFileImpact.mockResolvedValue({
        target: 'src/auth.ts',
        directDependents: 0,
        indirectDependents: 0,
        transitiveDependents: 0,
        riskLevel: 'LOW',
        affectedFiles: [],
        affectedSymbols: [],
        affectedProcesses: [],
        symbols: [],
      })

      const program = makeImpactProgram()
      await program.parseAsync(['node', 'specd', 'graph', 'impact', '--file', 'src/auth.ts'])

      expect(mockProvider.analyzeFileImpact).toHaveBeenCalledWith('src/auth.ts', 'upstream', 3)
    })

    it('passes custom depth to analyzeFileImpact', async () => {
      const { mockProvider } = setup()
      mockProvider.analyzeFileImpact.mockResolvedValue({
        target: 'src/auth.ts',
        directDependents: 0,
        indirectDependents: 0,
        transitiveDependents: 0,
        riskLevel: 'LOW',
        affectedFiles: [],
        affectedSymbols: [],
        affectedProcesses: [],
        symbols: [],
      })

      const program = makeImpactProgram()
      await program.parseAsync([
        'node',
        'specd',
        'graph',
        'impact',
        '--file',
        'src/auth.ts',
        '--depth',
        '5',
      ])

      expect(mockProvider.analyzeFileImpact).toHaveBeenCalledWith('src/auth.ts', 'upstream', 5)
    })

    it('passes depth to analyzeImpact for --symbol', async () => {
      const { mockProvider } = setup()
      const sym = {
        id: 'src/auth.ts:function:validate:10:0',
        name: 'validate',
        kind: 'function',
        filePath: 'src/auth.ts',
        line: 10,
        column: 0,
      }
      mockProvider.findSymbols.mockResolvedValue([sym])
      mockProvider.analyzeImpact.mockResolvedValue({
        target: sym.id,
        directDependents: 0,
        indirectDependents: 0,
        transitiveDependents: 0,
        riskLevel: 'LOW',
        affectedFiles: [],
        affectedSymbols: [],
        affectedProcesses: [],
      })

      const program = makeImpactProgram()
      await program.parseAsync([
        'node',
        'specd',
        'graph',
        'impact',
        '--symbol',
        'validate',
        '--depth',
        '7',
      ])

      expect(mockProvider.analyzeImpact).toHaveBeenCalledWith(sym.id, 'upstream', 7)
    })

    it('passes depth to detectChanges for --changes', async () => {
      const { mockProvider } = setup()
      mockProvider.detectChanges.mockResolvedValue({
        changedFiles: ['src/auth.ts'],
        changedSymbols: [],
        affectedSymbols: [],
        affectedFiles: [],
        riskLevel: 'LOW',
        summary: 'No symbols found in 1 changed file(s).',
      })

      const program = makeImpactProgram()
      await program.parseAsync([
        'node',
        'specd',
        'graph',
        'impact',
        '--changes',
        'src/auth.ts',
        '--depth',
        '4',
      ])

      expect(mockProvider.detectChanges).toHaveBeenCalledWith(['src/auth.ts'], 4)
    })
  })

  describe('text output depth indicators', () => {
    it('shows (depth=N) in header when non-default', async () => {
      const { mockProvider, getStdout } = setup()
      mockProvider.analyzeFileImpact.mockResolvedValue({
        target: 'src/auth.ts',
        directDependents: 1,
        indirectDependents: 0,
        transitiveDependents: 0,
        riskLevel: 'LOW',
        affectedFiles: ['src/login.ts'],
        affectedSymbols: [
          { id: 'sym1', name: 'handleLogin', filePath: 'src/login.ts', line: 12, depth: 1 },
        ],
        affectedProcesses: [],
        symbols: [],
      })

      const program = makeImpactProgram()
      await program.parseAsync([
        'node',
        'specd',
        'graph',
        'impact',
        '--file',
        'src/auth.ts',
        '--depth',
        '5',
      ])

      const out = getStdout()
      expect(out).toContain('(depth=5)')
      expect(out).toContain('handleLogin:12 (d=1)')
    })

    it('does not show depth in header when default', async () => {
      const { mockProvider, getStdout } = setup()
      mockProvider.analyzeFileImpact.mockResolvedValue({
        target: 'src/auth.ts',
        directDependents: 0,
        indirectDependents: 0,
        transitiveDependents: 0,
        riskLevel: 'LOW',
        affectedFiles: [],
        affectedSymbols: [],
        affectedProcesses: [],
        symbols: [],
      })

      const program = makeImpactProgram()
      await program.parseAsync(['node', 'specd', 'graph', 'impact', '--file', 'src/auth.ts'])

      const out = getStdout()
      expect(out).toContain('Impact analysis for src/auth.ts')
      expect(out).not.toContain('depth=')
    })
  })

  describe('selector validation', () => {
    it('rejects when no selector is provided', async () => {
      const { getStderr } = setup()

      const program = makeImpactProgram()
      try {
        await program.parseAsync(['node', 'specd', 'graph', 'impact'])
      } catch {
        /* ExitSentinel from process.exit(1) */
      }

      expect(getStderr()).toContain('provide exactly one of --file, --symbol, or --changes')
    })

    it('rejects when multiple selectors are provided', async () => {
      const { getStderr } = setup()

      const program = makeImpactProgram()
      try {
        await program.parseAsync([
          'node',
          'specd',
          'graph',
          'impact',
          '--file',
          'src/auth.ts',
          '--symbol',
          'validate',
        ])
      } catch {
        /* ExitSentinel from process.exit(1) */
      }

      expect(getStderr()).toContain('provide exactly one of --file, --symbol, or --changes')
    })
  })
})
