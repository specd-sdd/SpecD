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
import { ChangeNotFoundError } from '@specd/sdk'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
  buildCliKernelOptions: vi.fn(() => ({})),
}))

const mockExecuteSuggestImplementationLinks = vi.fn().mockResolvedValue({
  result: 'ok',
  specs: [
    {
      specId: 'default:auth/login',
      title: 'Login',
      existing: { files: [], symbols: [], dependsOn: [] },
      suggestions: [
        {
          file: 'default:src/auth.ts',
          symbols: ['login'],
          confidence: 'HIGH',
          reasons: ['exact-ast-symbol-match'],
          score: 160,
        },
      ],
    },
  ],
})

vi.mock('@specd/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@specd/sdk')>()
  return {
    ...actual,
    createSuggestImplementationLinks: vi.fn(() => ({
      execute: mockExecuteSuggestImplementationLinks,
    })),
  }
})

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerSpecImplementation } from '../../src/commands/spec/implementation.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({
    config,
    configFilePath: null,
    kernel,
  })
  captureStdout()
  mockProcessExit()
  return { kernel }
}

afterEach(() => vi.restoreAllMocks())

describe('spec implementation', () => {
  it('documents the structured suggest response without executing the use case', async () => {
    mockExecuteSuggestImplementationLinks.mockClear()
    const getStdout = captureStdout()
    const program = makeProgram()
    const spec = program.command('spec')
    registerSpecImplementation(spec)
    try {
      await program.parseAsync(['node', 'specd', 'spec', 'implementation', 'suggest', '--help'])
    } catch {
      /* Commander exit override */
    }

    const help = getStdout()
    expect(help).toContain('JSON/TOON output schema:')
    expect(help).toContain('alreadyIncluded: boolean')
    expect(mockExecuteSuggestImplementationLinks).not.toHaveBeenCalled()
  })

  it('list delegates to kernel.specs.getPersistedImplementation', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.getPersistedImplementation.execute).mockResolvedValue({
      specId: 'default:auth/login',
      implementation: [{ file: 'default:src/auth.ts' }],
      initialized: true,
    })

    const program = makeProgram()
    registerSpecImplementation(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'implementation', 'list', 'auth/login'])

    expect(kernel.specs.getPersistedImplementation.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
    })
  })

  it('add delegates to kernel.specs.updatePersistedImplementation', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.updatePersistedImplementation.execute).mockResolvedValue({
      specId: 'default:auth/login',
      implementation: [{ file: 'default:src/auth.ts', symbols: ['login'] }],
      created: true,
    })

    const program = makeProgram()
    registerSpecImplementation(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'implementation',
      'add',
      'auth/login',
      '--file',
      'src/auth.ts',
      '--symbol',
      'login',
    ])

    expect(kernel.specs.updatePersistedImplementation.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
      action: 'add',
      file: 'src/auth.ts',
      symbols: ['login'],
    })
  })

  it('suggest delegates to SuggestImplementationLinks orchestration use case', async () => {
    setup()
    const program = makeProgram()
    registerSpecImplementation(program.command('spec'))

    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'implementation',
      'suggest',
      'auth/login',
      '--format',
      'json',
    ])

    expect(resolveCliContext).toHaveBeenCalled()
    expect(mockExecuteSuggestImplementationLinks).toHaveBeenCalledWith(
      expect.objectContaining({
        specId: 'default:auth/login',
      }),
    )
  })

  it('remove delegates to kernel.specs.updatePersistedImplementation', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.updatePersistedImplementation.execute).mockResolvedValue({
      specId: 'default:auth/login',
      implementation: [],
      created: false,
    })

    const program = makeProgram()
    registerSpecImplementation(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'implementation',
      'remove',
      'auth/login',
      '--file',
      'src/auth.ts',
      '--symbol',
      'login',
    ])

    expect(kernel.specs.updatePersistedImplementation.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
      action: 'remove',
      file: 'src/auth.ts',
      symbols: ['login'],
    })
  })

  it('list reports uninitialized spec distinctly in text output', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.getPersistedImplementation.execute).mockResolvedValue({
      specId: 'default:auth/login',
      implementation: [],
      initialized: false,
    })
    const getOutput = captureStdout()

    const program = makeProgram()
    registerSpecImplementation(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'implementation', 'list', 'auth/login'])

    expect(getOutput()).toContain('is not initialized — run specs init first')
  })

  it('list includes initialized:false in json output for uninitialized specs', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.getPersistedImplementation.execute).mockResolvedValue({
      specId: 'default:auth/login',
      implementation: [],
      initialized: false,
    })
    const getOutput = captureStdout()

    const program = makeProgram()
    registerSpecImplementation(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'implementation',
      'list',
      'auth/login',
      '--format',
      'json',
    ])

    expect(JSON.parse(getOutput())).toMatchObject({ initialized: false })
  })

  it('suggest renders [already included] tag for linked files', async () => {
    setup()
    const getOutput = captureStdout()
    mockExecuteSuggestImplementationLinks.mockResolvedValueOnce({
      result: 'ok',
      specs: [
        {
          specId: 'default:auth/login',
          title: 'Login',
          existing: { files: ['src/auth.ts'], symbols: [], dependsOn: [] },
          suggestions: [
            {
              file: 'src/auth.ts',
              symbols: ['login'],
              confidence: 'HIGH',
              reasons: ['exact-ast-symbol-match'],
              score: 160,
              alreadyIncluded: true,
            },
          ],
        },
      ],
    })
    const program = makeProgram()
    registerSpecImplementation(program.command('spec'))

    await program.parseAsync(['node', 'specd', 'spec', 'implementation', 'suggest', 'auth/login'])

    expect(getOutput()).toContain('[already included] [HIGH] src/auth.ts')
  })

  it('list accepts --format toon', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.getPersistedImplementation.execute).mockResolvedValue({
      specId: 'default:auth/login',
      implementation: [{ file: 'default:src/auth.ts' }],
      initialized: true,
    })
    const getOutput = captureStdout()

    const program = makeProgram()
    registerSpecImplementation(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'implementation',
      'list',
      'auth/login',
      '--format',
      'toon',
    ])

    expect(process.exit).not.toHaveBeenCalled()
    expect(getOutput().length).toBeGreaterThan(0)
  })

  it('maps typed errors to exit code 1 with error prefix', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.getPersistedImplementation.execute).mockRejectedValue(
      new ChangeNotFoundError('nonexistent'),
    )
    const stderr = captureStderr()

    const program = makeProgram()
    registerSpecImplementation(program.command('spec'))
    try {
      await program.parseAsync(['node', 'specd', 'spec', 'implementation', 'list', 'auth/login'])
    } catch (err) {
      expect(err).toBeInstanceOf(ExitSentinel)
      expect((err as ExitSentinel).code).toBe(1)
    }

    expect(stderr()).toContain('error:')
  })

  it('suggest renders text output for existing files, confidence and mutations by default', async () => {
    setup()
    const getOutput = captureStdout()
    mockExecuteSuggestImplementationLinks.mockResolvedValueOnce({
      result: 'ok',
      specs: [
        {
          specId: 'default:auth/login',
          title: 'Login',
          existing: { files: ['src/core.ts'], symbols: [], dependsOn: [] },
          suggestions: [
            {
              file: 'src/auth.ts',
              symbols: ['login'],
              confidence: 'HIGH',
              reasons: ['exact-ast-symbol-match'],
              score: 160,
              alreadyIncluded: false,
            },
          ],
        },
      ],
      appliedMutations: { updatedSpecsCount: 1, filesAddedCount: 2, symbolsAddedCount: 3 },
    })
    const program = makeProgram()
    registerSpecImplementation(program.command('spec'))

    await program.parseAsync(['node', 'specd', 'spec', 'implementation', 'suggest', 'auth/login'])

    const out = getOutput()
    expect(out).toContain('existing:')
    expect(out).toContain('src/core.ts')
    expect(out).toContain('[new] [HIGH] src/auth.ts [login]')
    expect(out).toContain('applied mutations: updated 1 specs (2 files, 3 symbols added)')
  })
})
