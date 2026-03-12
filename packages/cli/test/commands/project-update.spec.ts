/* eslint-disable @typescript-eslint/unbound-method */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeMockSkill,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
  ExitSentinel,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

vi.mock('@specd/skills', () => ({
  getSkill: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { getSkill } from '@specd/skills'
import { writeFile } from 'node:fs/promises'
import { registerProjectUpdate } from '../../src/commands/project/update.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({ config, kernel })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('Skills update step', () => {
  it('Recorded skills are reinstalled', async () => {
    const { kernel, stdout } = setup()
    kernel.project.getSkillsManifest.execute.mockResolvedValue({
      claude: ['my-skill'],
    })
    vi.mocked(getSkill).mockReturnValue(makeMockSkill({ name: 'my-skill', content: '# My Skill' }))

    const program = makeProgram()
    registerProjectUpdate(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'update'])

    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('my-skill.md'),
      '# My Skill',
      'utf8',
    )
    expect(stdout()).toContain('my-skill')
  })

  it('Skill no longer in bundle generates warning but does not fail', async () => {
    const { kernel, stderr } = setup()
    kernel.project.getSkillsManifest.execute.mockResolvedValue({
      claude: ['old-skill'],
    })
    vi.mocked(getSkill).mockReturnValue(undefined)

    const program = makeProgram()
    registerProjectUpdate(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'update'])

    expect(stderr()).toContain('old-skill')
    expect(stderr()).toMatch(/warning/)
  })
})

describe('Output on success', () => {
  it('Text output is prefixed with step name', async () => {
    const { kernel, stdout } = setup()
    kernel.project.getSkillsManifest.execute.mockResolvedValue({
      claude: ['my-skill'],
    })
    vi.mocked(getSkill).mockReturnValue(makeMockSkill({ name: 'my-skill', content: '# Skill' }))

    const program = makeProgram()
    registerProjectUpdate(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'update'])

    expect(stdout()).toMatch(/skills:/)
  })

  it('Nothing to update prints up-to-date message', async () => {
    const { kernel, stdout } = setup()
    kernel.project.getSkillsManifest.execute.mockResolvedValue(null)

    const program = makeProgram()
    registerProjectUpdate(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'update'])

    expect(stdout()).toContain('project is up to date')
  })

  it('JSON output groups results by step', async () => {
    const { kernel, stdout } = setup()
    kernel.project.getSkillsManifest.execute.mockResolvedValue({
      claude: ['my-skill'],
    })
    vi.mocked(getSkill).mockReturnValue(makeMockSkill({ name: 'my-skill', content: '# Skill' }))

    const program = makeProgram()
    registerProjectUpdate(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'update', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed).toHaveProperty('skills')
    expect(Array.isArray(parsed.skills)).toBe(true)
    expect(parsed.skills.length).toBeGreaterThan(0)
  })
})

describe('Partial failure', () => {
  it('Warnings from skills update do not change exit code', async () => {
    const { kernel, stdout, stderr } = setup()
    kernel.project.getSkillsManifest.execute.mockResolvedValue({
      claude: ['current-skill', 'missing-skill'],
    })
    vi.mocked(getSkill).mockImplementation((name: string) => {
      if (name === 'current-skill') {
        return makeMockSkill({ name: 'current-skill', content: '# Current' })
      }
      return undefined
    })

    const program = makeProgram()
    registerProjectUpdate(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'update'])

    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('current-skill.md'),
      '# Current',
      'utf8',
    )
    expect(stderr()).toContain('missing-skill')
    expect(stderr()).toMatch(/warning/)
    expect(stdout()).toContain('current-skill')
  })

  it('Missing specd.yaml exits with error', async () => {
    const { stderr } = setup()
    vi.mocked(resolveCliContext).mockRejectedValue(new Error('specd.yaml not found'))

    const program = makeProgram()
    registerProjectUpdate(program.command('project'))

    try {
      await program.parseAsync(['node', 'specd', 'project', 'update'])
    } catch (err) {
      expect(err).toBeInstanceOf(ExitSentinel)
    }

    expect(process.exit).toHaveBeenCalled()
    expect(stderr()).toMatch(/fatal:|error:/)
  })
})
