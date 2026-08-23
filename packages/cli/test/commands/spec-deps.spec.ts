import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
} from './helpers.js'

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
    expect(out).toContain('existing dependsOn:')
    expect(out).toContain('default:auth/core')
    expect(out).toContain('default:auth/shared [new]')
    expect(out).toContain('default:auth/core [already included]')
    expect(out).toContain('applied mutations: updated 1 specs (1 dependencies added)')
    expect(out).toContain('post-apply validation: all specs valid')
  })
})
