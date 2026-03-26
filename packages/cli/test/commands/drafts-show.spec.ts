/* eslint-disable @typescript-eslint/unbound-method */

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

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { ChangeNotFoundError } from '@specd/core'
import { registerDraftsShow } from '../../src/commands/drafts/show.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({ config, configFilePath: null, kernel })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('Command signature', () => {
  it('Missing name argument', async () => {
    setup()

    const program = makeProgram()
    registerDraftsShow(program.command('drafts'))
    await expect(program.parseAsync(['node', 'specd', 'drafts', 'show'])).rejects.toThrow()
  })
})

describe('Output format — text', () => {
  it('Normal text output', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: {
        name: 'old-experiment',
        state: 'drafting',
        isDrafted: true,
        specIds: new Set(['auth/legacy']),
        schemaName: 'schema-std',
        schemaVersion: 1,
        history: [],
      },
      artifactStatuses: [],
    })

    const program = makeProgram()
    registerDraftsShow(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'show', 'old-experiment'])

    const out = stdout()
    expect(out).toContain('name:')
    expect(out).toContain('old-experiment')
    expect(out).toContain('state:')
    expect(out).toContain('drafting')
    expect(out).toContain('specs:')
    expect(out).toContain('auth/legacy')
    expect(out).toContain('schema:')
    expect(out).toContain('schema-std@1')
  })
})

describe('Output format — JSON', () => {
  it('JSON format output', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: {
        name: 'old-experiment',
        state: 'drafting',
        isDrafted: true,
        specIds: new Set(['auth/legacy']),
        schemaName: 'schema-std',
        schemaVersion: 1,
        history: [],
      },
      artifactStatuses: [],
    })

    const program = makeProgram()
    registerDraftsShow(program.command('drafts'))
    await program.parseAsync([
      'node',
      'specd',
      'drafts',
      'show',
      'old-experiment',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.name).toBe('old-experiment')
    expect(parsed.state).toBe('drafting')
    expect(parsed.specIds).toEqual(['auth/legacy'])
    expect(parsed.schema).toEqual({ name: 'schema-std', version: 1 })
  })
})

describe('Error cases', () => {
  it('Change not found', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockRejectedValue(new ChangeNotFoundError('nonexistent'))

    const program = makeProgram()
    registerDraftsShow(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'show', 'nonexistent']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('Change not in drafts', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: {
        name: 'my-change',
        state: 'designing',
        isDrafted: false,
        specIds: new Set(['auth/login']),
        schemaName: '@specd/schema-std',
        schemaVersion: 1,
        history: [],
      },
      artifactStatuses: [],
    })

    const program = makeProgram()
    registerDraftsShow(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'show', 'my-change']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })
})
