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
import { ReadOnlyWorkspaceError } from '@specd/sdk'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
  buildCliKernelOptions: vi.fn(() => ({})),
}))

const mockExecuteSuggestSpecDependencies = vi.fn().mockResolvedValue({
  result: 'ok',
  specs: [
    {
      specId: 'default:auth/login',
      title: 'Login',
      existingDependsOn: [],
      suggestedDependsOn: [
        {
          specId: 'default:auth/shared',
          title: 'Shared Auth',
          reason: 'Code import relationship',
        },
      ],
    },
  ],
})

vi.mock('@specd/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@specd/sdk')>()
  return {
    ...actual,
    createSuggestSpecDependencies: vi.fn(() => ({
      execute: mockExecuteSuggestSpecDependencies,
    })),
  }
})

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerSpecDeps } from '../../src/commands/spec/deps.js'

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

describe('spec deps', () => {
  it('documents dependency and post-validation structured output without execution', async () => {
    mockExecuteSuggestSpecDependencies.mockClear()
    const getStdout = captureStdout()
    const program = makeProgram()
    const spec = program.command('spec')
    registerSpecDeps(spec)
    try {
      await program.parseAsync(['node', 'specd', 'spec', 'deps', 'suggest', '--help'])
    } catch {
      /* Commander exit override */
    }

    const help = getStdout()
    expect(help).toContain('JSON/TOON output schema:')
    expect(help).toContain('postApplyValidation?:')
    expect(mockExecuteSuggestSpecDependencies).not.toHaveBeenCalled()
  })

  it('list delegates to kernel.specs.getPersistedDeps', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.getPersistedDeps.execute).mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: ['default:auth/shared'],
      initialized: true,
    })

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'deps', 'list', 'auth/login'])

    expect(kernel.specs.getPersistedDeps.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
    })
  })

  it('set delegates to kernel.specs.updatePersistedDeps', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.updatePersistedDeps.execute).mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: ['default:auth/shared'],
      created: false,
    })

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'deps',
      'set',
      'auth/login',
      '--dep',
      'default:auth/shared',
    ])

    expect(kernel.specs.updatePersistedDeps.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
      set: ['default:auth/shared'],
    })
  })

  it('suggest delegates to SuggestSpecDependencies orchestration use case', async () => {
    setup()
    const program = makeProgram()
    registerSpecDeps(program.command('spec'))

    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'deps',
      'suggest',
      'auth/login',
      '--format',
      'json',
    ])

    expect(resolveCliContext).toHaveBeenCalled()
    expect(mockExecuteSuggestSpecDependencies).toHaveBeenCalledWith(
      expect.objectContaining({
        specId: 'default:auth/login',
      }),
    )
  })

  it('suggest renders text output for existing deps, tags and validation by default', async () => {
    setup()
    const getOutput = captureStdout()
    mockExecuteSuggestSpecDependencies.mockResolvedValueOnce({
      result: 'ok',
      specs: [
        {
          specId: 'default:auth/login',
          title: 'Login',
          existingDependsOn: ['default:auth/core'],
          suggestedDependsOn: [
            {
              specId: 'default:auth/shared',
              title: 'Shared Auth',
              reason: 'Code import relationship',
              alreadyIncluded: false,
            },
            {
              specId: 'default:auth/core',
              title: 'Core Auth',
              reason: 'Already included dependency',
              alreadyIncluded: true,
            },
          ],
        },
      ],
      appliedMutations: { updatedSpecsCount: 1, depsAddedCount: 1 },
      postApplyValidation: { status: 'all-valid', invalidSpecs: [] },
    })
    const program = makeProgram()
    registerSpecDeps(program.command('spec'))

    await program.parseAsync(['node', 'specd', 'spec', 'deps', 'suggest', 'auth/login'])

    const out = getOutput()
    expect(out).toContain('[default:auth/login]')
    expect(out).toContain('existing dependsOn:')
    expect(out).toContain('default:auth/core')
    expect(out).toContain('[new] default:auth/shared')
    expect(out).toContain('[already included] default:auth/core')
    expect(out).toContain('applied mutations: updated 1 specs (1 dependencies added)')
    expect(out).toContain('post-apply validation: all specs valid')
  })

  it('add delegates to kernel.specs.updatePersistedDeps', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.updatePersistedDeps.execute).mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: ['core:a', 'core:b'],
    })

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'deps',
      'add',
      'auth/login',
      '--dep',
      'core:a',
      '--dep',
      'core:b',
    ])

    expect(kernel.specs.updatePersistedDeps.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
      add: ['core:a', 'core:b'],
    })
  })

  it('remove delegates to kernel.specs.updatePersistedDeps', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.updatePersistedDeps.execute).mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: [],
    })

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'deps',
      'remove',
      'auth/login',
      '--dep',
      'core:a',
    ])

    expect(kernel.specs.updatePersistedDeps.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
      remove: ['core:a'],
    })
  })

  it('clear delegates to kernel.specs.updatePersistedDeps', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.updatePersistedDeps.execute).mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: [],
    })

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'deps', 'clear', 'auth/login'])

    expect(kernel.specs.updatePersistedDeps.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
      clear: true,
    })
  })

  it('set without --dep flags clears the list', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.updatePersistedDeps.execute).mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: [],
    })

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'deps', 'set', 'auth/login'])

    expect(kernel.specs.updatePersistedDeps.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
      set: [],
    })
  })

  it('remove on an uninitialized spec is a no-op, not an error', async () => {
    const { kernel } = setup()
    const getOutput = captureStdout()
    vi.mocked(kernel.specs.updatePersistedDeps.execute).mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: [],
    })

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'deps',
      'remove',
      'auth/login',
      '--dep',
      'core:a',
    ])

    expect(process.exit).not.toHaveBeenCalled()
    expect(getOutput()).toContain('dependsOn: (empty)')
  })

  it('list includes initialized:false in json output for uninitialized specs', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.getPersistedDeps.execute).mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: [],
      initialized: false,
    })
    const getOutput = captureStdout()

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'deps',
      'list',
      'auth/login',
      '--format',
      'json',
    ])

    expect(JSON.parse(getOutput())).toMatchObject({ initialized: false })
  })

  it('list reports uninitialized spec distinctly in text output', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.getPersistedDeps.execute).mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: [],
      initialized: false,
    })
    const getOutput = captureStdout()

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'deps', 'list', 'auth/login'])

    expect(getOutput()).toContain('is not initialized — run specs init first')
  })

  it('maps readOnly workspace errors to exit code 1 with actionable message', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.updatePersistedDeps.execute).mockRejectedValue(
      new ReadOnlyWorkspaceError(
        'Workspace "platform" is read-only: persisted dependencies cannot be modified. ' +
          'Change the workspace ownership in specd.yaml to allow writes.',
      ),
    )
    const stderr = captureStderr()

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    try {
      await program.parseAsync([
        'node',
        'specd',
        'spec',
        'deps',
        'add',
        'auth/login',
        '--dep',
        'core:a',
      ])
    } catch (err) {
      expect(err).toBeInstanceOf(ExitSentinel)
      expect((err as ExitSentinel).code).toBe(1)
    }

    expect(stderr()).toContain('error:')
    expect(stderr()).toContain('read-only')
  })

  it('list accepts --format toon', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.getPersistedDeps.execute).mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: ['core:a'],
      initialized: true,
    })
    const getOutput = captureStdout()

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'deps',
      'list',
      'auth/login',
      '--format',
      'toon',
    ])

    expect(process.exit).not.toHaveBeenCalled()
    expect(getOutput().length).toBeGreaterThan(0)
  })

  it('suggest passes apply: true directly when --apply --yes is used', async () => {
    setup()
    mockExecuteSuggestSpecDependencies.mockClear()
    const program = makeProgram()
    registerSpecDeps(program.command('spec'))

    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'deps',
      'suggest',
      'auth/login',
      '--apply',
      '--yes',
    ])

    expect(mockExecuteSuggestSpecDependencies).toHaveBeenCalledWith(
      expect.objectContaining({
        specId: 'default:auth/login',
        apply: true,
      }),
    )
  })
})
