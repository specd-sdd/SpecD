import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ChangeNotFoundError,
  ChangeAlreadyExistsError,
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
} from '@specd/core'
import { handleError } from '../src/handle-error.js'
import { mockProcessExit, ExitSentinel } from './commands/helpers.js'

function capturedStderr(): string {
  const spy = vi.mocked(process.stderr.write)
  return (spy.mock.calls as [string][]).map(([s]) => s).join('')
}

function callHandleError(err: unknown, format?: string): void {
  try {
    handleError(err, format)
  } catch (e) {
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

describe('handleError — exit code 3 (system errors)', () => {
  beforeEach(() => {
    mockProcessExit()
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env['SPECD_DEBUG']
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

  it('stack trace present when SPECD_DEBUG=1', () => {
    process.env['SPECD_DEBUG'] = '1'
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
