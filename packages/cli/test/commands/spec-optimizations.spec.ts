import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ArtifactConflictError, ReadOnlyWorkspaceError, SpecNotFoundError } from '@specd/sdk'
import {
  ExitSentinel,
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

vi.mock('../../src/helpers/read-stdin.js', () => ({
  readStdin: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { readStdin } from '../../src/helpers/read-stdin.js'
import { registerSpecOptimizations } from '../../src/commands/spec/optimizations.js'

function captureStderr(): () => string {
  let buffer = ''
  vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    buffer += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
    return true
  }) as never)
  return () => buffer
}

function writeTempJson(value: unknown): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'specd-opt-'))
  const path = join(dir, 'opt.json')
  writeFileSync(path, JSON.stringify(value), 'utf8')
  return { dir, path }
}

function makeCliArgs(...args: string[]): string[] {
  return ['node', 'specd', 'spec', 'optimizations', ...args]
}

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
  return { kernel, stdout, stderr }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('spec optimizations', () => {
  it('get delegates to kernel.specs.getPersistedOptimizations', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.getPersistedOptimizations.execute).mockResolvedValue({
      specId: 'default:auth/login',
      initialized: true,
      fresh: false,
      optimizedContext: { freshness: 'missing', reasons: ['missing'] },
    })

    const program = makeProgram()
    registerSpecOptimizations(program.command('spec'))
    await program.parseAsync(makeCliArgs('get', 'auth/login', '--field', 'optimizedContext'))

    expect(kernel.specs.getPersistedOptimizations.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
      field: 'optimizedContext',
    })
    expect(stdout()).toContain('optimizedContext: missing')
  })

  it('get prints stale text output with reasons for initialized persisted fields', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.getPersistedOptimizations.execute).mockResolvedValue({
      specId: 'default:auth/login',
      initialized: true,
      fresh: false,
      optimizedDescription: {
        freshness: 'stale',
        reasons: ['schema_changed', 'artifact_state_changed'],
        value: 'Cached summary',
      },
    })

    const program = makeProgram()
    registerSpecOptimizations(program.command('spec'))
    await program.parseAsync(makeCliArgs('get', 'auth/login'))

    expect(stdout()).toContain(
      'optimizedDescription: STALE (schema_changed, artifact_state_changed)',
    )
    expect(stdout()).toContain('Cached summary')
  })

  it('get prints the uninitialized diagnostic in text mode', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.getPersistedOptimizations.execute).mockResolvedValue({
      specId: 'default:auth/login',
      initialized: false,
      fresh: false,
    })

    const program = makeProgram()
    registerSpecOptimizations(program.command('spec'))
    await program.parseAsync(makeCliArgs('get', 'auth/login'))

    expect(stdout().trim()).toBe(
      'spec default:auth/login is not initialized — run specs init first',
    )
  })

  it('get only prints the selected missing field in text mode', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.getPersistedOptimizations.execute).mockResolvedValue({
      specId: 'default:auth/login',
      initialized: true,
      fresh: false,
      optimizedContext: { freshness: 'missing', reasons: ['missing'] },
    })

    const program = makeProgram()
    registerSpecOptimizations(program.command('spec'))
    await program.parseAsync(makeCliArgs('get', 'auth/login', '--field', 'optimizedContext'))

    expect(stdout()).toContain('optimizedContext: missing')
    expect(stdout()).not.toContain('optimizedDescription')
  })

  it('set accepts direct optimizedDescription only', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.updatePersistedOptimizations.execute).mockResolvedValue({
      specId: 'default:auth/login',
      changed: true,
    })

    const program = makeProgram()
    registerSpecOptimizations(program.command('spec'))
    await program.parseAsync(
      makeCliArgs('set', 'auth/login', '--optimized-description', 'Short summary'),
    )

    expect(resolveCliContext).toHaveBeenCalledTimes(1)
    expect(kernel.specs.updatePersistedOptimizations.execute).toHaveBeenCalledTimes(1)
    expect(kernel.specs.updatePersistedOptimizations.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
      set: { optimizedDescription: 'Short summary' },
    })
  })

  it('set accepts both direct values in one mutation', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.updatePersistedOptimizations.execute).mockResolvedValue({
      specId: 'default:auth/login',
      changed: true,
      optimizations: {
        optimizedDescription: 'summary',
        optimizedContext: '# Title\n## Rules',
      },
    })

    const program = makeProgram()
    registerSpecOptimizations(program.command('spec'))
    await program.parseAsync(
      makeCliArgs(
        'set',
        'auth/login',
        '--optimized-description',
        'summary',
        '--optimized-context',
        '# Title\n## Rules',
      ),
    )

    expect(kernel.specs.updatePersistedOptimizations.execute).toHaveBeenCalledTimes(1)
    expect(kernel.specs.updatePersistedOptimizations.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
      set: {
        optimizedDescription: 'summary',
        optimizedContext: '# Title\n## Rules',
      },
    })
  })

  it('set reads compatibility input from file', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.updatePersistedOptimizations.execute).mockResolvedValue({
      specId: 'default:auth/login',
      changed: true,
    })
    const input = writeTempJson({ optimizedDescription: 'Short summary' })

    try {
      const program = makeProgram()
      registerSpecOptimizations(program.command('spec'))
      await program.parseAsync(makeCliArgs('set', 'auth/login', '--input', input.path))

      expect(kernel.specs.updatePersistedOptimizations.execute).toHaveBeenCalledWith({
        specId: 'default:auth/login',
        set: { optimizedDescription: 'Short summary' },
      })
    } finally {
      rmSync(input.dir, { recursive: true, force: true })
    }
  })

  it('set reads compatibility input from stdin', async () => {
    const { kernel } = setup()
    vi.mocked(readStdin).mockResolvedValue('{"optimizedContext":"context"}')
    vi.mocked(kernel.specs.updatePersistedOptimizations.execute).mockResolvedValue({
      specId: 'default:auth/login',
      changed: true,
    })

    const program = makeProgram()
    registerSpecOptimizations(program.command('spec'))
    await program.parseAsync(makeCliArgs('set', 'auth/login', '--input', '-'))

    expect(readStdin).toHaveBeenCalledTimes(1)
    expect(kernel.specs.updatePersistedOptimizations.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
      set: { optimizedContext: 'context' },
    })
  })

  it('set rejects missing input forms before resolving context', async () => {
    const { kernel, stderr } = setup()

    const program = makeProgram()
    registerSpecOptimizations(program.command('spec'))

    await expect(program.parseAsync(makeCliArgs('set', 'auth/login'))).rejects.toMatchObject({
      code: 1,
    } satisfies Partial<ExitSentinel>)

    expect(stderr()).toContain('error: set requires --input or at least one of')
    expect(resolveCliContext).not.toHaveBeenCalled()
    expect(kernel.specs.updatePersistedOptimizations.execute).not.toHaveBeenCalled()
  })

  it('set rejects mixed structured and direct forms before resolving context', async () => {
    const { kernel, stderr } = setup()
    const input = writeTempJson({ optimizedDescription: 'Short summary' })

    try {
      const program = makeProgram()
      registerSpecOptimizations(program.command('spec'))

      await expect(
        program.parseAsync(
          makeCliArgs('set', 'auth/login', '--input', input.path, '--optimized-context', 'context'),
        ),
      ).rejects.toMatchObject({
        code: 1,
      } satisfies Partial<ExitSentinel>)

      expect(stderr()).toContain('error: --input cannot be combined')
      expect(resolveCliContext).not.toHaveBeenCalled()
      expect(kernel.specs.updatePersistedOptimizations.execute).not.toHaveBeenCalled()
    } finally {
      rmSync(input.dir, { recursive: true, force: true })
    }
  })

  it('set rejects an empty JSON object before resolving context', async () => {
    const { kernel, stderr } = setup()
    const input = writeTempJson({})

    try {
      const program = makeProgram()
      registerSpecOptimizations(program.command('spec'))

      await expect(
        program.parseAsync(makeCliArgs('set', 'auth/login', '--input', input.path)),
      ).rejects.toMatchObject({
        code: 1,
      } satisfies Partial<ExitSentinel>)

      expect(stderr()).toContain('error: invalid JSON: object must include at least one')
      expect(resolveCliContext).not.toHaveBeenCalled()
      expect(kernel.specs.updatePersistedOptimizations.execute).not.toHaveBeenCalled()
    } finally {
      rmSync(input.dir, { recursive: true, force: true })
    }
  })

  it('set rejects malformed JSON before resolving context', async () => {
    const { kernel, stderr } = setup()
    const dir = mkdtempSync(join(tmpdir(), 'specd-opt-'))
    const path = join(dir, 'bad.json')
    writeFileSync(path, '{bad json', 'utf8')

    try {
      const program = makeProgram()
      registerSpecOptimizations(program.command('spec'))

      await expect(
        program.parseAsync(makeCliArgs('set', 'auth/login', '--input', path)),
      ).rejects.toMatchObject({
        code: 1,
      } satisfies Partial<ExitSentinel>)

      expect(stderr()).toContain('error: invalid JSON:')
      expect(resolveCliContext).not.toHaveBeenCalled()
      expect(kernel.specs.updatePersistedOptimizations.execute).not.toHaveBeenCalled()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('set rejects a non-object JSON value before resolving context', async () => {
    const { kernel, stderr } = setup()
    const input = writeTempJson(['not', 'object'])

    try {
      const program = makeProgram()
      registerSpecOptimizations(program.command('spec'))

      await expect(
        program.parseAsync(makeCliArgs('set', 'auth/login', '--input', input.path)),
      ).rejects.toMatchObject({
        code: 1,
      } satisfies Partial<ExitSentinel>)

      expect(stderr()).toContain('error: invalid JSON: expected an object')
      expect(resolveCliContext).not.toHaveBeenCalled()
      expect(kernel.specs.updatePersistedOptimizations.execute).not.toHaveBeenCalled()
    } finally {
      rmSync(input.dir, { recursive: true, force: true })
    }
  })

  it('set rejects unknown JSON keys before resolving context', async () => {
    const { kernel, stderr } = setup()
    const input = writeTempJson({ unexpectedKey: 'value' })

    try {
      const program = makeProgram()
      registerSpecOptimizations(program.command('spec'))

      await expect(
        program.parseAsync(makeCliArgs('set', 'auth/login', '--input', input.path)),
      ).rejects.toMatchObject({
        code: 1,
      } satisfies Partial<ExitSentinel>)

      expect(stderr()).toContain("error: invalid field 'unexpectedKey'")
      expect(resolveCliContext).not.toHaveBeenCalled()
      expect(kernel.specs.updatePersistedOptimizations.execute).not.toHaveBeenCalled()
    } finally {
      rmSync(input.dir, { recursive: true, force: true })
    }
  })

  it('set rejects non-string JSON values before resolving context', async () => {
    const { kernel, stderr } = setup()
    const input = writeTempJson({ optimizedDescription: 42 })

    try {
      const program = makeProgram()
      registerSpecOptimizations(program.command('spec'))

      await expect(
        program.parseAsync(makeCliArgs('set', 'auth/login', '--input', input.path)),
      ).rejects.toMatchObject({
        code: 1,
      } satisfies Partial<ExitSentinel>)

      expect(stderr()).toContain("error: invalid value for 'optimizedDescription'")
      expect(resolveCliContext).not.toHaveBeenCalled()
      expect(kernel.specs.updatePersistedOptimizations.execute).not.toHaveBeenCalled()
    } finally {
      rmSync(input.dir, { recursive: true, force: true })
    }
  })

  it('clear accepts direct flags for both fields in one mutation', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.updatePersistedOptimizations.execute).mockResolvedValue({
      specId: 'default:auth/login',
      changed: true,
    })

    const program = makeProgram()
    registerSpecOptimizations(program.command('spec'))
    await program.parseAsync(
      makeCliArgs('clear', 'auth/login', '--optimized-description', '--optimized-context'),
    )

    expect(kernel.specs.updatePersistedOptimizations.execute).toHaveBeenCalledTimes(1)
    expect(kernel.specs.updatePersistedOptimizations.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
      clear: ['optimizedDescription', 'optimizedContext'],
    })
    expect(stdout()).toContain('cleared optimizations for default:auth/login')
    expect(stdout()).toContain('optimizations: none')
  })

  it('clear accepts a single direct flag', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.updatePersistedOptimizations.execute).mockResolvedValue({
      specId: 'default:auth/login',
      changed: true,
      optimizations: {
        optimizedDescription: 'summary',
      },
    })

    const program = makeProgram()
    registerSpecOptimizations(program.command('spec'))
    await program.parseAsync(makeCliArgs('clear', 'auth/login', '--optimized-context'))

    expect(kernel.specs.updatePersistedOptimizations.execute).toHaveBeenCalledTimes(1)
    expect(kernel.specs.updatePersistedOptimizations.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
      clear: ['optimizedContext'],
    })
    expect(stdout()).toContain('optimizedDescription: summary')
    expect(stdout()).not.toContain('optimizations: none')
  })

  it('clear followed by get exposes the persisted empty projection', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.updatePersistedOptimizations.execute).mockResolvedValue({
      specId: 'default:auth/login',
      changed: true,
    })
    vi.mocked(kernel.specs.getPersistedOptimizations.execute).mockResolvedValue({
      specId: 'default:auth/login',
      initialized: true,
      fresh: true,
    })

    const clearProgram = makeProgram()
    registerSpecOptimizations(clearProgram.command('spec'))
    await clearProgram.parseAsync(
      makeCliArgs('clear', 'auth/login', '--field', 'optimizedDescription'),
    )

    const getProgram = makeProgram()
    registerSpecOptimizations(getProgram.command('spec'))
    await getProgram.parseAsync(makeCliArgs('get', 'auth/login'))

    expect(stdout()).toContain('optimizations: none')
    expect(stdout()).toContain('no persisted optimization values')
  })

  it('clear accepts repeated compatibility fields and deduplicates them', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.updatePersistedOptimizations.execute).mockResolvedValue({
      specId: 'default:auth/login',
      changed: true,
      optimizations: {},
    })

    const program = makeProgram()
    registerSpecOptimizations(program.command('spec'))
    await program.parseAsync(
      makeCliArgs(
        'clear',
        'auth/login',
        '--field',
        'optimizedDescription',
        '--field',
        'optimizedDescription',
        '--field',
        'optimizedContext',
      ),
    )

    expect(kernel.specs.updatePersistedOptimizations.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
      clear: ['optimizedDescription', 'optimizedContext'],
    })
  })

  it('clear rejects missing selection before resolving context', async () => {
    const { kernel, stderr } = setup()

    const program = makeProgram()
    registerSpecOptimizations(program.command('spec'))

    await expect(program.parseAsync(makeCliArgs('clear', 'auth/login'))).rejects.toMatchObject({
      code: 1,
    } satisfies Partial<ExitSentinel>)

    expect(stderr()).toContain('error: clear requires --field or at least one of')
    expect(resolveCliContext).not.toHaveBeenCalled()
    expect(kernel.specs.updatePersistedOptimizations.execute).not.toHaveBeenCalled()
  })

  it('clear rejects mixed field and direct forms before resolving context', async () => {
    const { kernel, stderr } = setup()

    const program = makeProgram()
    registerSpecOptimizations(program.command('spec'))

    await expect(
      program.parseAsync(
        makeCliArgs(
          'clear',
          'auth/login',
          '--field',
          'optimizedDescription',
          '--optimized-context',
        ),
      ),
    ).rejects.toMatchObject({
      code: 1,
    } satisfies Partial<ExitSentinel>)

    expect(stderr()).toContain('error: --field cannot be combined')
    expect(resolveCliContext).not.toHaveBeenCalled()
    expect(kernel.specs.updatePersistedOptimizations.execute).not.toHaveBeenCalled()
  })

  it('clear rejects unsupported field names before resolving context', async () => {
    const { kernel, stderr } = setup()

    const program = makeProgram()
    registerSpecOptimizations(program.command('spec'))

    await expect(
      program.parseAsync(makeCliArgs('clear', 'auth/login', '--field', 'bogusField')),
    ).rejects.toMatchObject({
      code: 1,
    } satisfies Partial<ExitSentinel>)

    expect(stderr()).toContain("error: invalid field 'bogusField'")
    expect(resolveCliContext).not.toHaveBeenCalled()
    expect(kernel.specs.updatePersistedOptimizations.execute).not.toHaveBeenCalled()
  })

  it('get preserves structured output formatting', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.getPersistedOptimizations.execute).mockResolvedValue({
      specId: 'default:auth/login',
      initialized: true,
      fresh: true,
      optimizedDescription: {
        freshness: 'fresh',
        reasons: [],
        value: 'summary',
      },
    })

    const program = makeProgram()
    registerSpecOptimizations(program.command('spec'))
    await program.parseAsync(makeCliArgs('get', 'auth/login', '--format', 'json'))

    expect(stdout()).toContain('"result":"ok"')
    expect(stdout()).toContain('"specId":"default:auth/login"')
  })

  it('set maps SpecNotFoundError through handleError', async () => {
    const { kernel, stderr } = setup()
    vi.mocked(kernel.specs.updatePersistedOptimizations.execute).mockRejectedValue(
      new SpecNotFoundError('default:auth/login'),
    )

    const program = makeProgram()
    registerSpecOptimizations(program.command('spec'))

    await expect(
      program.parseAsync(makeCliArgs('set', 'auth/login', '--optimized-description', 'summary')),
    ).rejects.toMatchObject({
      code: 1,
    } satisfies Partial<ExitSentinel>)

    expect(stderr()).toContain('error:')
  })

  it('set maps ArtifactConflictError through handleError', async () => {
    const { kernel, stderr } = setup()
    vi.mocked(kernel.specs.updatePersistedOptimizations.execute).mockRejectedValue(
      new ArtifactConflictError('/project/spec-lock.json', 'incoming', 'current'),
    )

    const program = makeProgram()
    registerSpecOptimizations(program.command('spec'))

    await expect(
      program.parseAsync(makeCliArgs('set', 'auth/login', '--optimized-description', 'summary')),
    ).rejects.toMatchObject({
      code: 1,
    } satisfies Partial<ExitSentinel>)

    expect(stderr()).toContain('error:')
  })

  it('set maps ReadOnlyWorkspaceError through handleError', async () => {
    const { kernel, stderr } = setup()
    vi.mocked(kernel.specs.updatePersistedOptimizations.execute).mockRejectedValue(
      new ReadOnlyWorkspaceError('Workspace "default" is read-only'),
    )

    const program = makeProgram()
    registerSpecOptimizations(program.command('spec'))

    await expect(
      program.parseAsync(makeCliArgs('set', 'auth/login', '--optimized-description', 'summary')),
    ).rejects.toMatchObject({
      code: 1,
    } satisfies Partial<ExitSentinel>)

    expect(stderr()).toContain('error:')
  })
})
