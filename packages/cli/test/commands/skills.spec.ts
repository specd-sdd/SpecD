/* eslint-disable @typescript-eslint/unbound-method */
/**
 * Tests for skills commands: list, show, install.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/load-config.js', () => ({ loadConfig: vi.fn() }))
vi.mock('../../src/kernel.js', () => ({ createCliKernel: vi.fn() }))
vi.mock('@specd/skills', () => ({
  listSkills: vi.fn(),
  getSkill: vi.fn(),
}))
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  access: vi.fn(),
  stat: vi.fn().mockResolvedValue({}),
}))

import { loadConfig } from '../../src/load-config.js'
import { createCliKernel } from '../../src/kernel.js'
import { listSkills, getSkill } from '@specd/skills'
import { registerSkillsList } from '../../src/commands/skills/list.js'
import { registerSkillsShow } from '../../src/commands/skills/show.js'
import { registerSkillsInstall } from '../../src/commands/skills/install.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(loadConfig).mockResolvedValue(config)
  vi.mocked(createCliKernel).mockReturnValue(kernel)
  vi.mocked(listSkills).mockReturnValue([])
  vi.mocked(getSkill).mockReturnValue(undefined)
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

const mockSkill = {
  name: 'commit',
  description: 'Create conventional commits',
  content: '# Commit skill\nHelp with commits.',
}

// ---------------------------------------------------------------------------
// skills list
// ---------------------------------------------------------------------------

describe('skills list', () => {
  it('prints "no skills available" when none registered', async () => {
    const { stdout } = setup()
    vi.mocked(listSkills).mockReturnValue([])

    const program = makeProgram()
    registerSkillsList(program.command('skills'))
    await program.parseAsync(['node', 'specd', 'skills', 'list'])

    expect(stdout()).toContain('no skills available')
  })

  it('lists skill names and descriptions', async () => {
    const { stdout } = setup()
    vi.mocked(listSkills).mockReturnValue([mockSkill])

    const program = makeProgram()
    registerSkillsList(program.command('skills'))
    await program.parseAsync(['node', 'specd', 'skills', 'list'])

    expect(stdout()).toContain('commit')
    expect(stdout()).toContain('Create conventional commits')
  })

  it('outputs JSON array', async () => {
    const { stdout } = setup()
    vi.mocked(listSkills).mockReturnValue([mockSkill])

    const program = makeProgram()
    registerSkillsList(program.command('skills'))
    await program.parseAsync(['node', 'specd', 'skills', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0].name).toBe('commit')
  })

  it('exits 1 for unknown --agent', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerSkillsList(program.command('skills'))
    await program
      .parseAsync(['node', 'specd', 'skills', 'list', '--agent', 'unknown'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error:')
  })
})

// ---------------------------------------------------------------------------
// skills show
// ---------------------------------------------------------------------------

describe('skills show', () => {
  it('rejects when name argument is missing', async () => {
    setup()

    const program = makeProgram()
    registerSkillsShow(program.command('skills'))
    await expect(program.parseAsync(['node', 'specd', 'skills', 'show'])).rejects.toThrow()
  })

  it('text output includes --- <skill-name> --- header', async () => {
    const { stdout } = setup()
    vi.mocked(getSkill).mockReturnValue(mockSkill)

    const program = makeProgram()
    registerSkillsShow(program.command('skills'))
    await program.parseAsync(['node', 'specd', 'skills', 'show', 'commit'])

    expect(stdout()).toContain('--- commit ---')
  })

  it('prints skill content in text format', async () => {
    const { stdout } = setup()
    vi.mocked(getSkill).mockReturnValue(mockSkill)

    const program = makeProgram()
    registerSkillsShow(program.command('skills'))
    await program.parseAsync(['node', 'specd', 'skills', 'show', 'commit'])

    expect(stdout()).toContain('# Commit skill')
  })

  it('exits 1 when skill not found', async () => {
    const { stderr } = setup()
    vi.mocked(getSkill).mockReturnValue(undefined)

    const program = makeProgram()
    registerSkillsShow(program.command('skills'))
    await program.parseAsync(['node', 'specd', 'skills', 'show', 'nonexistent']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain("skill 'nonexistent' not found")
  })

  it('outputs JSON with skill fields', async () => {
    const { stdout } = setup()
    vi.mocked(getSkill).mockReturnValue(mockSkill)

    const program = makeProgram()
    registerSkillsShow(program.command('skills'))
    await program.parseAsync(['node', 'specd', 'skills', 'show', 'commit', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.name).toBe('commit')
    expect(parsed.description).toBe('Create conventional commits')
    expect(typeof parsed.content).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// skills install (project scope)
// ---------------------------------------------------------------------------

describe('skills install (project scope)', () => {
  it('rejects when positional argument is missing', async () => {
    setup()

    const program = makeProgram()
    registerSkillsInstall(program.command('skills'))
    await expect(program.parseAsync(['node', 'specd', 'skills', 'install'])).rejects.toThrow()
  })

  it('JSON output is array with name and path', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(getSkill).mockReturnValue(mockSkill)
    kernel.project.recordSkillInstall.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerSkillsInstall(program.command('skills'))
    await program
      .parseAsync(['node', 'specd', 'skills', 'install', 'commit', '--format', 'json'])
      .catch(() => {})

    const parsed = JSON.parse(stdout())
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0].name).toBe('commit')
    expect(typeof parsed[0].path).toBe('string')
  })

  it('exits 1 when skill not found', async () => {
    const { stderr } = setup()
    vi.mocked(getSkill).mockReturnValue(undefined)

    const program = makeProgram()
    registerSkillsInstall(program.command('skills'))
    await program.parseAsync(['node', 'specd', 'skills', 'install', 'nonexistent']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain("skill 'nonexistent' not found")
  })

  it('records skill install in config for project scope', async () => {
    const { kernel } = setup()
    vi.mocked(getSkill).mockReturnValue(mockSkill)
    kernel.project.recordSkillInstall.execute.mockResolvedValue(undefined)
    captureStdout()

    const program = makeProgram()
    registerSkillsInstall(program.command('skills'))
    await program.parseAsync(['node', 'specd', 'skills', 'install', 'commit']).catch(() => {})

    expect(kernel.project.recordSkillInstall.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        skillNames: ['commit'],
        agent: 'claude',
      }),
    )
  })

  it('prints confirmation for project install', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(getSkill).mockReturnValue(mockSkill)
    kernel.project.recordSkillInstall.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerSkillsInstall(program.command('skills'))
    await program
      .parseAsync(['node', 'specd', 'skills', 'install', 'commit', '--agent', 'claude'])
      .catch(() => {})

    expect(stdout()).toContain('installed commit →')
  })
})
