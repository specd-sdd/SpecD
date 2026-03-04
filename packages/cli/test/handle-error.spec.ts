/* eslint-disable @typescript-eslint/unbound-method */
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
  HookFailedError,
  SchemaValidationError,
  ConfigValidationError,
} from '@specd/core'
import { handleError } from '../src/handle-error.js'

function capturedStderr(): string {
  const spy = vi.mocked(process.stderr.write)
  return (spy.mock.calls as [string][]).map(([s]) => s).join('')
}

describe('handleError — exit code 1 (domain errors)', () => {
  beforeEach(() => {
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
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
  ]

  for (const [name, err] of domainCases) {
    it(`${name} → exit 1 with error: prefix`, () => {
      handleError(err)
      expect(process.exit).toHaveBeenCalledWith(1)
      expect(capturedStderr()).toMatch(/^error:/)
    })
  }
})

describe('handleError — exit code 2 (hook failure)', () => {
  beforeEach(() => {
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('HookFailedError → exit 2 with error: prefix and command name', () => {
    handleError(new HookFailedError('my-hook', 1, 'hook stderr output'))
    expect(process.exit).toHaveBeenCalledWith(2)
    const out = capturedStderr()
    expect(out).toMatch(/^error:/)
    expect(out).toContain('my-hook')
  })
})

describe('handleError — exit code 3 (system errors)', () => {
  beforeEach(() => {
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env['SPECD_DEBUG']
  })

  it('SchemaNotFoundError → exit 3 with fatal: prefix', () => {
    handleError(new SchemaNotFoundError('@specd/schema-std'))
    expect(process.exit).toHaveBeenCalledWith(3)
    expect(capturedStderr()).toMatch(/^fatal:/)
  })

  it('SchemaValidationError → exit 3 with fatal: prefix', () => {
    handleError(new SchemaValidationError('@specd/schema-std', 'bad yaml'))
    expect(process.exit).toHaveBeenCalledWith(3)
    expect(capturedStderr()).toMatch(/^fatal:/)
  })

  it('generic Error → exit 3 with fatal: prefix', () => {
    handleError(new Error('something went wrong'))
    expect(process.exit).toHaveBeenCalledWith(3)
    expect(capturedStderr()).toMatch(/^fatal:/)
  })

  it('no stack trace by default', () => {
    handleError(new Error('oops'))
    const out = capturedStderr()
    // Should not include a stack trace line
    expect(out.split('\n').filter((l) => l.trim().startsWith('at ')).length).toBe(0)
  })

  it('stack trace present when SPECD_DEBUG=1', () => {
    process.env['SPECD_DEBUG'] = '1'
    handleError(new Error('oops'))
    expect(capturedStderr()).toContain('at ')
  })

  it('unknown value → exit 3 with fatal: prefix', () => {
    handleError('raw string error')
    expect(process.exit).toHaveBeenCalledWith(3)
    expect(capturedStderr()).toMatch(/^fatal:/)
  })
})
