/* eslint-disable @typescript-eslint/unbound-method */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockUseCase,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('@specd/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@specd/core')>()
  return {
    ...original,
    createInitProject: vi.fn(),
    createRecordSkillInstall: vi.fn(),
  }
})
vi.mock('@specd/skills', () => ({
  listSkills: vi.fn().mockReturnValue([]),
  getSkill: vi.fn(),
}))
vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn(),
}))
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn().mockReturnValue('/project\n') }
})

import { createInitProject, createRecordSkillInstall, AlreadyInitialisedError } from '@specd/core'
import { execSync } from 'node:child_process'
import { registerProjectInit } from '../../src/commands/project/init.js'

function setup() {
  const mockExecute = vi.fn().mockResolvedValue({
    configPath: '/project/specd.yaml',
    schemaRef: '@specd/schema-std',
    workspaces: [{ name: 'default', specsPath: 'specs/' }],
  })
  vi.mocked(createInitProject).mockReturnValue(
    makeMockUseCase<ReturnType<typeof createInitProject>>(mockExecute),
  )

  const mockRecordExecute = vi.fn().mockResolvedValue(undefined)
  vi.mocked(createRecordSkillInstall).mockReturnValue(
    makeMockUseCase<ReturnType<typeof createRecordSkillInstall>>(mockRecordExecute),
  )

  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { mockExecute, mockRecordExecute, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('project init (non-interactive)', () => {
  it('initializes project with defaults in text format', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerProjectInit(program.command('project'))
    await program.parseAsync([
      'node',
      'specd',
      'project',
      'init',
      '--workspace',
      'default',
      '--workspace-path',
      'specs/',
    ])

    expect(stdout()).toContain('initialized specd in')
  })

  it('outputs JSON with result and configPath', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerProjectInit(program.command('project'))
    await program.parseAsync([
      'node',
      'specd',
      'project',
      'init',
      '--workspace',
      'default',
      '--workspace-path',
      'specs/',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.configPath).toContain('specd.yaml')
    expect(parsed.schema).toBe('@specd/schema-std')
    expect(Array.isArray(parsed.workspaces)).toBe(true)
  })

  it('JSON output includes skillsInstalled as object', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerProjectInit(program.command('project'))
    await program.parseAsync([
      'node',
      'specd',
      'project',
      'init',
      '--workspace',
      'default',
      '--workspace-path',
      'specs/',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.skillsInstalled).toEqual({})
    expect(typeof parsed.skillsInstalled).toBe('object')
    expect(Array.isArray(parsed.skillsInstalled)).toBe(false)
  })

  it('passes --force to use case', async () => {
    const { mockExecute } = setup()
    captureStdout()

    const program = makeProgram()
    registerProjectInit(program.command('project'))
    await program.parseAsync([
      'node',
      'specd',
      'project',
      'init',
      '--workspace',
      'default',
      '--workspace-path',
      'specs/',
      '--force',
    ])

    const call = mockExecute.mock.calls[0]![0]
    expect(call.force).toBe(true)
  })

  it('exits 1 when AlreadyInitialisedError without --force', async () => {
    const { mockExecute, stderr } = setup()
    mockExecute.mockRejectedValue(new AlreadyInitialisedError('/project/specd.yaml'))

    const program = makeProgram()
    registerProjectInit(program.command('project'))
    await program
      .parseAsync([
        'node',
        'specd',
        'project',
        'init',
        '--workspace',
        'default',
        '--workspace-path',
        'specs/',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('uses git root as project root', async () => {
    const { mockExecute } = setup()
    vi.mocked(execSync).mockReturnValue('/project\n')
    captureStdout()

    const program = makeProgram()
    registerProjectInit(program.command('project'))
    await program.parseAsync([
      'node',
      'specd',
      'project',
      'init',
      '--workspace',
      'default',
      '--workspace-path',
      'specs/',
    ])

    const call = mockExecute.mock.calls[0]![0]
    expect(call.projectRoot).toBe('/project')
  })
})
