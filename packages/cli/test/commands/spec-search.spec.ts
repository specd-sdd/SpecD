import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  captureStderr,
  captureStdout,
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
  buildCliKernelOptions: vi.fn(() => ({})),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
vi.mock('@specd/sdk', async () => {
  const actual = await vi.importActual<typeof import('@specd/sdk')>('@specd/sdk')
  return {
    ...actual,
    createCodeGraphProvider: vi.fn(),
  }
})

import { createCodeGraphProvider } from '@specd/sdk'
import { registerSpecSearch } from '../../src/commands/spec/search.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({
    config: config,
    configFilePath: null,
    kernel: kernel,
  })
  kernel.specs.search.execute.mockResolvedValue([])
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

function makeSearchProgram() {
  const program = makeProgram()
  registerSpecSearch(program.command('spec'))
  return program
}

afterEach(() => vi.restoreAllMocks())

const searchEntries = [
  {
    workspace: 'default',
    path: 'auth/login',
    title: 'Login',
    score: 5,
    matches: [{ filename: 'spec.md', line: 3, snippet: 'OAuth2 login flow' }],
  },
  {
    workspace: 'default',
    path: 'billing/pay',
    title: 'Pay',
    score: 2,
    matches: [{ filename: 'spec.md', line: 1, snippet: 'payment flow' }],
  },
]

describe('spec search', () => {
  it('falls back to kernel search when graph is unavailable', async () => {
    const { kernel, stderr } = setup()
    vi.mocked(createCodeGraphProvider).mockImplementation(() => {
      throw new Error('no graph')
    })
    kernel.specs.search.execute.mockResolvedValue(searchEntries)

    const program = makeSearchProgram()
    await program.parseAsync(['node', 'specd', 'spec', 'search', 'login'])

    expect(stderr()).toContain('warning')
    expect(kernel.specs.search.execute).toHaveBeenCalledWith(
      'login',
      expect.objectContaining({ limit: 20 }),
    )
  })

  it('uses graph provider when available', async () => {
    const { kernel, stdout } = setup()
    const mockProvider = {
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      getStatistics: vi.fn().mockResolvedValue({ specCount: 5 }),
      searchSpecs: vi.fn().mockResolvedValue([
        {
          spec: {
            workspace: 'default',
            path: 'auth/login',
            title: 'Login',
            description: 'Login flow',
          },
          score: 8,
        },
      ]),
    }
    vi.mocked(createCodeGraphProvider).mockReturnValue(mockProvider as never)

    const program = makeSearchProgram()
    await program.parseAsync(['node', 'specd', 'spec', 'search', 'login'])

    expect(mockProvider.searchSpecs).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'login' }),
    )
    expect(kernel.specs.search.execute).not.toHaveBeenCalled()
  })

  it('errors with --graph when graph is unavailable', async () => {
    const { stderr } = setup()
    vi.mocked(createCodeGraphProvider).mockImplementation(() => {
      throw new Error('no graph')
    })

    const program = makeSearchProgram()
    try {
      await program.parseAsync(['node', 'specd', 'spec', 'search', 'login', '--graph'])
    } catch {
      /* ExitSentinel */
    }

    expect(stderr()).toContain('code graph index not available')
  })

  it('passes workspace filter to kernel fallback', async () => {
    const { kernel } = setup()
    vi.mocked(createCodeGraphProvider).mockImplementation(() => {
      throw new Error('no graph')
    })
    kernel.specs.search.execute.mockResolvedValue([])

    const program = makeSearchProgram()
    await program.parseAsync(['node', 'specd', 'spec', 'search', 'login', '--workspace', 'alpha'])

    expect(kernel.specs.search.execute).toHaveBeenCalledWith(
      'login',
      expect.objectContaining({ workspaces: ['alpha'] }),
    )
  })

  it('passes includeSummary to kernel fallback', async () => {
    const { kernel } = setup()
    vi.mocked(createCodeGraphProvider).mockImplementation(() => {
      throw new Error('no graph')
    })
    kernel.specs.search.execute.mockResolvedValue([])

    const program = makeSearchProgram()
    await program.parseAsync(['node', 'specd', 'spec', 'search', 'login', '--summary'])

    expect(kernel.specs.search.execute).toHaveBeenCalledWith(
      'login',
      expect.objectContaining({ includeSummary: true }),
    )
  })

  it('renders text output with score and path columns', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(createCodeGraphProvider).mockImplementation(() => {
      throw new Error('no graph')
    })
    kernel.specs.search.execute.mockResolvedValue(searchEntries)

    const program = makeSearchProgram()
    await program.parseAsync(['node', 'specd', 'spec', 'search', 'login'])

    const out = stdout()
    expect(out).toContain('SCORE')
    expect(out).toContain('PATH')
    expect(out).toContain('TITLE')
    expect(out).toContain('5.0')
  })

  it('renders JSON output as flat array', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(createCodeGraphProvider).mockImplementation(() => {
      throw new Error('no graph')
    })
    kernel.specs.search.execute.mockResolvedValue(searchEntries)

    const program = makeSearchProgram()
    await program.parseAsync(['node', 'specd', 'spec', 'search', 'login', '--format', 'json'])

    const json = JSON.parse(stdout())
    expect(json).toHaveLength(2)
    expect(json[0].path).toBe('default:auth/login')
    expect(json[0].score).toBe(5)
  })

  it('shows "no matching specs" for empty results in text mode', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(createCodeGraphProvider).mockImplementation(() => {
      throw new Error('no graph')
    })
    kernel.specs.search.execute.mockResolvedValue([])

    const program = makeSearchProgram()
    await program.parseAsync(['node', 'specd', 'spec', 'search', 'xyz'])

    const out = stdout()
    expect(out).toContain('no matching specs')
  })

  it('returns empty array for empty results in JSON mode', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(createCodeGraphProvider).mockImplementation(() => {
      throw new Error('no graph')
    })
    kernel.specs.search.execute.mockResolvedValue([])

    const program = makeSearchProgram()
    await program.parseAsync(['node', 'specd', 'spec', 'search', 'xyz', '--format', 'json'])

    const json = JSON.parse(stdout())
    expect(json).toEqual([])
  })

  it('rejects non-positive --limit', async () => {
    const { stderr } = setup()
    vi.mocked(createCodeGraphProvider).mockImplementation(() => {
      throw new Error('no graph')
    })

    const program = makeSearchProgram()
    try {
      await program.parseAsync(['node', 'specd', 'spec', 'search', 'login', '--limit', '0'])
    } catch {
      /* ExitSentinel */
    }

    expect(stderr()).toContain('--limit must be a positive integer')
  })
})
