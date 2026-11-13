import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  Logger,
  ChangeNotFoundError,
  ChangeAlreadyExistsError,
  DraftedChangeReadOnlyError,
  AlreadyInitialisedError,
  ApprovalGateDisabledError,
  SchemaNotFoundError,
  InvalidStateTransitionError,
  ApprovalRequiredError,
  ArtifactNotOptionalError,
  ArtifactConflictError,
  InvalidSpecPathError,
  SpecNotInChangeError,
  ArtifactNotFoundError,
  CorruptedManifestError,
  ParserNotRegisteredError,
  UnsupportedPatternError,
  PathTraversalError,
  DeltaApplicationError,
  MetadataValidationError,
  DependsOnOverwriteError,
  HookFailedError,
  SchemaValidationError,
  ConfigValidationError,
  ArchiveDependencyMismatchError,
  PluginDestroyError,
  PluginValidationError,
  InvalidSpecLockError,
  type LoggerPort,
} from '@specd/sdk'
import { handleError, cliError } from '../src/handle-error.js'
import { CliExitError } from '../src/helpers/cli-exit-error.js'
import { CliValidationError, InvalidFormatError } from '../src/errors/index.js'
import { mockProcessExit, ExitSentinel } from './commands/helpers.js'

function capturedStderr(): string {
  const spy = vi.mocked(process.stderr.write)
  return (spy.mock.calls as [string][]).map(([s]) => s).join('')
}

function callHandleError(
  err: unknown,
  format?: string,
  options?: { readonly lockRepairHint?: boolean },
): void {
  try {
    handleError(err, format, options)
  } catch (e) {
    try {
      if (e instanceof CliExitError) process.exit(e.exitCode)
    } catch (sentinel) {
      if (sentinel instanceof ExitSentinel) return
      throw sentinel
    }
    if (e instanceof ExitSentinel) return
    throw e
  }
}

function capturedStdout(): string {
  const spy = vi.mocked(process.stdout.write)
  return (spy.mock.calls as [string][]).map(([s]) => s).join('')
}

describe('handleError — exit code 1 (domain errors)', () => {
  beforeEach(() => {
    mockProcessExit()
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const domainCases: [string, unknown][] = [
    ['ChangeNotFoundError', new ChangeNotFoundError('my-change')],
    ['ChangeAlreadyExistsError', new ChangeAlreadyExistsError('my-change')],
    ['DraftedChangeReadOnlyError', new DraftedChangeReadOnlyError('my-change', 'save')],
    ['AlreadyInitialisedError', new AlreadyInitialisedError('/project/specd.yaml')],
    ['InvalidStateTransitionError', new InvalidStateTransitionError('designing', 'archiving')],
    ['ApprovalRequiredError', new ApprovalRequiredError('my-change')],
    ['ArtifactNotOptionalError', new ArtifactNotOptionalError('spec.md')],
    ['ApprovalGateDisabledError', new ApprovalGateDisabledError('spec')],
    ['ConfigValidationError', new ConfigValidationError('/project/specd.yaml', 'bad config')],
    [
      'ArtifactConflictError',
      new ArtifactConflictError('.specd-metadata.yaml', 'new content', 'old content'),
    ],
    ['InvalidSpecPathError', new InvalidSpecPathError('path contains invalid characters')],
    ['SpecNotInChangeError', new SpecNotInChangeError('auth/login', 'my-change')],
    ['ArtifactNotFoundError', new ArtifactNotFoundError('spec.md', 'my-change')],
    ['CorruptedManifestError', new CorruptedManifestError('invalid JSON in manifest')],
    ['ParserNotRegisteredError', new ParserNotRegisteredError('yaml')],
    ['UnsupportedPatternError', new UnsupportedPatternError('output', 'nested variables')],
    ['PathTraversalError', new PathTraversalError('/etc/passwd')],
    ['DeltaApplicationError', new DeltaApplicationError('section not found')],
    ['PluginDestroyError', new PluginDestroyError([new Error('boom')], ['@acme/x'])],
    ['PluginValidationError', new PluginValidationError('@acme/x', ['create'])],
    ['MetadataValidationError', new MetadataValidationError('title: Required')],
    ['DependsOnOverwriteError', new DependsOnOverwriteError(['core:config'], ['core:change'])],
  ]

  for (const [name, err] of domainCases) {
    it(`${name} → exit 1 with error: prefix`, () => {
      callHandleError(err)
      expect(process.exit).toHaveBeenCalledWith(1)
      expect(capturedStderr()).toMatch(/^error:/)
    })
  }
})

describe('handleError — exit code 2 (hook failure)', () => {
  beforeEach(() => {
    mockProcessExit()
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('HookFailedError → exit 2 with error: prefix and command name', () => {
    callHandleError(new HookFailedError('my-hook', 1, 'hook stderr output'))
    expect(process.exit).toHaveBeenCalledWith(2)
    const out = capturedStderr()
    expect(out).toContain('hook stderr output')
    expect(out).toMatch(/error:/)
    expect(out).toContain('my-hook')
  })
})

describe('handleError — InvalidSpecLockError repair hint', () => {
  const HINT =
    'Repair with: specd specs deps remove <spec-id>, specd specs deps set <spec-id>, or specd specs deps clear <spec-id>'
  const dependsOnError = (): InvalidSpecLockError =>
    new InvalidSpecLockError(
      'default:auth/login',
      '.specd/spec-lock.json',
      'dependsOn.0',
      'must be a fully-qualified valid spec ID',
    )

  beforeEach(() => {
    mockProcessExit()
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('adds the specs deps repair commands for dependsOn field paths when requested', () => {
    callHandleError(dependsOnError(), undefined, { lockRepairHint: true })
    expect(process.exit).toHaveBeenCalledWith(1)
    const err = capturedStderr()
    expect(err).toContain('specd specs deps remove')
    expect(err).toContain('specd specs deps set')
    expect(err).toContain('specd specs deps clear')
    expect(err).not.toContain('Correct that field in the file')
  })

  it('prints no hint for commands that do not request it', () => {
    callHandleError(dependsOnError())
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(capturedStderr()).not.toContain('Repair with')
  })

  it('does not reference --force in the repair hint', () => {
    callHandleError(dependsOnError(), undefined, { lockRepairHint: true })
    expect(capturedStderr()).not.toContain('--force')
  })

  it('emits the repair hint once on its own line after the error line', () => {
    callHandleError(dependsOnError(), undefined, { lockRepairHint: true })
    const err = capturedStderr()
    expect(err).toContain(HINT)
    expect(err.split(HINT).length - 1).toBe(1)
    expect(err.indexOf('error:')).toBeLessThan(err.indexOf(HINT))
    expect(HINT).not.toMatch(/[()]/)
  })

  it('keeps the hint out of the structured error message', () => {
    callHandleError(dependsOnError(), 'json', { lockRepairHint: true })
    const payload = JSON.parse(capturedStdout()) as { message: string; hint?: string }
    expect(payload.message).not.toContain('Repair with')
    expect(payload.hint).toBe(HINT)
  })

  it('omits the repair hint for non-dependsOn field paths', () => {
    callHandleError(
      new InvalidSpecLockError(
        'default:auth/login',
        '.specd/spec-lock.json',
        'contentHash',
        'must be a string',
      ),
      undefined,
      { lockRepairHint: true },
    )
    expect(capturedStderr()).not.toContain('Repair with')
  })
})

describe('handleError — exit code 3 (system errors)', () => {
  beforeEach(() => {
    mockProcessExit()
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Logger.resetImplementation()
  })

  it('SchemaNotFoundError → exit 3 with fatal: prefix', () => {
    callHandleError(new SchemaNotFoundError('@specd/schema-std'))
    expect(process.exit).toHaveBeenCalledWith(3)
    expect(capturedStderr()).toMatch(/^fatal:/)
  })

  it('SchemaValidationError → exit 3 with fatal: prefix', () => {
    callHandleError(new SchemaValidationError('@specd/schema-std', 'bad yaml'))
    expect(process.exit).toHaveBeenCalledWith(3)
    expect(capturedStderr()).toMatch(/^fatal:/)
  })

  it('generic Error → exit 3 with fatal: prefix', () => {
    callHandleError(new Error('something went wrong'))
    expect(process.exit).toHaveBeenCalledWith(3)
    expect(capturedStderr()).toMatch(/^fatal:/)
  })

  it('no stack trace by default', () => {
    callHandleError(new Error('oops'))
    const out = capturedStderr()
    // Should not include a stack trace line
    expect(out.split('\n').filter((l) => l.trim().startsWith('at ')).length).toBe(0)
  })

  it('stack trace present when logger debug level is enabled', () => {
    const impl: LoggerPort = {
      log: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      trace: vi.fn(),
      isLevelEnabled: vi.fn((level) => level === 'debug'),
      child: vi.fn(() => impl),
    }
    Logger.setImplementation(impl)

    callHandleError(new Error('oops'))
    expect(capturedStderr()).toContain('at ')
  })

  it('unknown value → exit 3 with fatal: prefix', () => {
    callHandleError('raw string error')
    expect(process.exit).toHaveBeenCalledWith(3)
    expect(capturedStderr()).toMatch(/^fatal:/)
  })
})

describe('handleError — structured error output', () => {
  beforeEach(() => {
    mockProcessExit()
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('domain error emits structured JSON to stdout when format is json', () => {
    callHandleError(new ChangeNotFoundError('my-change'), 'json')
    const parsed = JSON.parse(capturedStdout()) as Record<string, unknown>
    expect(parsed.result).toBe('error')
    expect(parsed.code).toBe('CHANGE_NOT_FOUND')
    expect(parsed.exitCode).toBe(1)
    expect(parsed.message).toContain('my-change')
  })

  it('InvalidFormatError emits structured JSON to stdout when format is json', () => {
    callHandleError(new InvalidFormatError("invalid format 'xml'"), 'json')
    const parsed = JSON.parse(capturedStdout()) as Record<string, unknown>
    expect(parsed.result).toBe('error')
    expect(parsed.code).toBe('INVALID_FORMAT')
    expect(parsed.exitCode).toBe(1)
  })

  it('CliValidationError emits structured JSON to stdout when format is json', () => {
    callHandleError(new CliValidationError('invalid flag'), 'json')
    const parsed = JSON.parse(capturedStdout()) as Record<string, unknown>
    expect(parsed.result).toBe('error')
    expect(parsed.code).toBe('CLI_VALIDATION_ERROR')
    expect(parsed.exitCode).toBe(1)
    expect(parsed.message).toContain('invalid flag')
  })

  it('custom error with specd: true discriminator emits structured JSON', () => {
    const customError = new Error('custom failure')
    ;(customError as any).specd = true
    ;(customError as any).code = 'CUSTOM_ERROR_CODE'

    callHandleError(customError, 'json')
    const parsed = JSON.parse(capturedStdout()) as Record<string, unknown>
    expect(parsed.result).toBe('error')
    expect(parsed.code).toBe('CUSTOM_ERROR_CODE')
    expect(parsed.exitCode).toBe(1)
    expect(parsed.message).toContain('custom failure')
  })

  it('structured output preserves contextual metadata from SpecdError getters', () => {
    callHandleError(
      new ArchiveDependencyMismatchError(
        'core:archive-change',
        ['core:change', 'core:storage'],
        ['core:change', 'default:_global/error-handling-conventions'],
      ),
      'json',
    )

    const parsed = JSON.parse(capturedStdout()) as Record<string, unknown>
    expect(parsed.code).toBe('ARCHIVE_DEPENDENCY_MISMATCH')
    expect(parsed.message).toContain('Archive failed')
    expect(parsed.metadata).toEqual({
      specId: 'core:archive-change',
      expectedDeps: ['core:change', 'core:storage'],
      actualDeps: ['core:change', 'default:_global/error-handling-conventions'],
    })
  })

  it('domain error emits structured output when format is toon', () => {
    callHandleError(new ChangeNotFoundError('my-change'), 'toon')
    const out = capturedStdout()
    expect(out).toBeTruthy()
    expect(out).toContain('error')
  })

  it('domain error does not emit to stdout when format is text', () => {
    callHandleError(new ChangeNotFoundError('my-change'), 'text')
    expect(capturedStdout()).toBe('')
  })

  it('domain error does not emit to stdout when format is undefined', () => {
    callHandleError(new ChangeNotFoundError('my-change'))
    expect(capturedStdout()).toBe('')
  })

  it('hook failure emits structured JSON with exit code 2', () => {
    callHandleError(new HookFailedError('my-hook', 1, 'stderr'), 'json')
    const parsed = JSON.parse(capturedStdout()) as Record<string, unknown>
    expect(parsed.result).toBe('error')
    expect(parsed.code).toBe('HOOK_FAILED')
    expect(parsed.exitCode).toBe(2)
  })

  it('schema error emits structured JSON with exit code 3', () => {
    callHandleError(new SchemaNotFoundError('@specd/schema-std'), 'json')
    const parsed = JSON.parse(capturedStdout()) as Record<string, unknown>
    expect(parsed.result).toBe('error')
    expect(parsed.code).toBe('SCHEMA_NOT_FOUND')
    expect(parsed.exitCode).toBe(3)
  })

  it('generic Error does not emit structured output even with json format', () => {
    callHandleError(new Error('unexpected'), 'json')
    expect(capturedStdout()).toBe('')
    expect(capturedStderr()).toMatch(/^fatal:/)
  })

  it('unknown value does not emit structured output even with json format', () => {
    callHandleError('raw string', 'json')
    expect(capturedStdout()).toBe('')
    expect(capturedStderr()).toMatch(/^fatal:/)
  })
})

describe('exit signalling without process.exit', () => {
  beforeEach(() => {
    mockProcessExit()
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('cliError writes its output and throws a CliExitError without calling process.exit', () => {
    let thrown: unknown
    try {
      cliError('something failed', undefined, 1)
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(CliExitError)
    expect((thrown as CliExitError).exitCode).toBe(1)
    expect(process.exit).not.toHaveBeenCalled()
    expect(capturedStderr()).toContain('error: something failed')
  })

  it('handleError throws a CliExitError carrying the exit code for a domain error', () => {
    let thrown: unknown
    try {
      handleError(new ChangeNotFoundError('my-change'))
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(CliExitError)
    expect((thrown as CliExitError).exitCode).toBe(1)
    expect(process.exit).not.toHaveBeenCalled()
  })

  it('handleError rethrows a CliExitError unchanged and prints nothing', () => {
    const original = new CliExitError(2)
    let thrown: unknown
    try {
      handleError(original)
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBe(original)
    expect(capturedStderr()).toBe('')
  })

  it('handleError turns an unexpected error into CliExitError(3)', () => {
    let thrown: unknown
    try {
      handleError(new Error('unexpected'))
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(CliExitError)
    expect((thrown as CliExitError).exitCode).toBe(3)
    expect(capturedStderr()).toContain('fatal: unexpected')
  })
})
