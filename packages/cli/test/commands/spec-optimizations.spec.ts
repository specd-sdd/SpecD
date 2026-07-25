import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
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

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerSpecOptimizations } from '../../src/commands/spec/optimizations.js'

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

describe('spec optimizations', () => {
  it('get delegates to kernel.specs.getPersistedOptimizations', async () => {
    const { kernel } = setup()
    const stdout = captureStdout()
    vi.mocked(kernel.specs.getPersistedOptimizations.execute).mockResolvedValue({
      specId: 'default:auth/login',
      initialized: true,
      fresh: false,
      optimizedContext: { freshness: 'missing', reasons: ['missing'] },
    })

    const program = makeProgram()
    registerSpecOptimizations(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'optimizations',
      'get',
      'auth/login',
      '--field',
      'optimizedContext',
    ])

    expect(kernel.specs.getPersistedOptimizations.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
      field: 'optimizedContext',
    })
    expect(stdout()).toContain('optimizedContext: missing')
  })

  it('set delegates to kernel.specs.updatePersistedOptimizations', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.updatePersistedOptimizations.execute).mockResolvedValue({
      specId: 'default:auth/login',
      changed: true,
    })

    const dir = mkdtempSync(join(tmpdir(), 'specd-opt-'))
    const inputPath = join(dir, 'opt.json')
    writeFileSync(inputPath, JSON.stringify({ optimizedDescription: 'Short summary' }), 'utf8')

    const program = makeProgram()
    registerSpecOptimizations(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'optimizations',
      'set',
      'auth/login',
      '--input',
      inputPath,
    ])

    expect(kernel.specs.updatePersistedOptimizations.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
      set: { optimizedDescription: 'Short summary' },
    })

    rmSync(dir, { recursive: true, force: true })
  })
})
