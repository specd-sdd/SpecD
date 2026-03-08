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
} from './helpers.js'

vi.mock('../../src/load-config.js', () => ({ loadConfig: vi.fn() }))
vi.mock('../../src/kernel.js', () => ({ createCliKernel: vi.fn() }))
vi.mock('@specd/skills', () => ({
  getSkill: vi.fn(),
}))
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}))

import { loadConfig } from '../../src/load-config.js'
import { createCliKernel } from '../../src/kernel.js'
import { getSkill } from '@specd/skills'
import { registerSkillsUpdate } from '../../src/commands/skills/update.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(loadConfig).mockResolvedValue(config)
  vi.mocked(createCliKernel).mockReturnValue(kernel)
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('skills update', () => {
  it('reinstalls all recorded skills', async () => {
    const { kernel, stdout } = setup()
    kernel.project.getSkillsManifest.execute.mockResolvedValue({
      claude: ['my-skill', 'other-skill'],
    })
    vi.mocked(getSkill)
      .mockReturnValueOnce(makeMockSkill({ content: '# My Skill' }))
      .mockReturnValueOnce(makeMockSkill({ content: '# Other Skill' }))

    const program = makeProgram()
    registerSkillsUpdate(program.command('skills'))
    await program.parseAsync(['node', 'specd', 'skills', 'update'])

    const out = stdout()
    expect(out).toMatch(/updated my-skill\s*→/)
    expect(out).toMatch(/updated other-skill\s*→/)
  })

  it('text output includes → <path> after skill name', async () => {
    const { kernel, stdout } = setup()
    kernel.project.getSkillsManifest.execute.mockResolvedValue({
      claude: ['my-skill'],
    })
    vi.mocked(getSkill).mockReturnValue(makeMockSkill({ content: '# My Skill' }))

    const program = makeProgram()
    registerSkillsUpdate(program.command('skills'))
    await program.parseAsync(['node', 'specd', 'skills', 'update'])

    const out = stdout()
    expect(out).toMatch(/updated my-skill → \//)
  })

  it('prints "no skills to update" when no manifest', async () => {
    const { kernel, stdout } = setup()
    kernel.project.getSkillsManifest.execute.mockResolvedValue({})

    const program = makeProgram()
    registerSkillsUpdate(program.command('skills'))
    await program.parseAsync(['node', 'specd', 'skills', 'update'])

    expect(stdout()).toContain('no skills to update')
  })

  it('generates warning for removed skill', async () => {
    const { kernel, stderr } = setup()
    kernel.project.getSkillsManifest.execute.mockResolvedValue({
      claude: ['old-skill'],
    })
    vi.mocked(getSkill).mockReturnValue(undefined)
    captureStdout()

    const program = makeProgram()
    registerSkillsUpdate(program.command('skills'))
    await program.parseAsync(['node', 'specd', 'skills', 'update'])

    expect(stderr()).toContain('warning:')
    expect(stderr()).toContain('old-skill')
  })

  it('restricts update to --agent filter', async () => {
    const { kernel, stdout } = setup()
    kernel.project.getSkillsManifest.execute.mockResolvedValue({
      claude: ['my-skill'],
      copilot: ['other-skill'],
    })
    vi.mocked(getSkill).mockReturnValue(makeMockSkill({ content: '# My Skill' }))

    const program = makeProgram()
    registerSkillsUpdate(program.command('skills'))
    await program.parseAsync(['node', 'specd', 'skills', 'update', '--agent', 'claude'])

    const out = stdout()
    expect(out).toContain('updated my-skill')
  })

  it('exits 1 for unknown --agent', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerSkillsUpdate(program.command('skills'))
    await program
      .parseAsync(['node', 'specd', 'skills', 'update', '--agent', 'unknown'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('unknown agent')
  })

  it('outputs JSON array with status fields', async () => {
    const { kernel, stdout } = setup()
    kernel.project.getSkillsManifest.execute.mockResolvedValue({
      claude: ['my-skill'],
    })
    vi.mocked(getSkill).mockReturnValue(makeMockSkill({ content: '# Skill' }))

    const program = makeProgram()
    registerSkillsUpdate(program.command('skills'))
    await program.parseAsync(['node', 'specd', 'skills', 'update', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0].name).toBe('my-skill')
    expect(parsed[0].status).toBe('updated')
    expect(typeof parsed[0].path).toBe('string')
  })
})
