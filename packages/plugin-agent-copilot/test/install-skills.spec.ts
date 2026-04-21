import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const repositoryMock = {
  list: vi.fn(() => [{ name: 'specd', description: 'specd', templates: [] }]),
  get: vi.fn((name: string) =>
    name === 'specd' || name === 'specd-verify'
      ? { name, description: name, templates: [] }
      : undefined,
  ),
  getBundle: vi.fn((name: string) => ({
    name,
    description: name,
    files: [
      { filename: 'SKILL.md', content: `# ${name}` },
      { filename: 'shared.md', content: 'shared-content' },
    ],
    install: async () => {},
    uninstall: async () => {},
  })),
  listSharedFiles: vi.fn(() => [
    { filename: 'shared.md', content: 'shared-content', skills: ['specd', 'specd-verify'] },
  ]),
}

vi.mock('@specd/skills', () => ({
  createSkillRepository: () => repositoryMock,
}))

/**
 * Creates a temporary project root.
 *
 * @returns Temporary root path.
 */
async function createTempProjectRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'specd-plugin-agent-copilot-'))
}

describe('plugin-agent-copilot create()', () => {
  it('given a project root, when install is called, then writes a skill directory with frontmatter on markdown files', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      const { create } = await import('../src/index.js')
      const plugin = create()
      const result = await plugin.install(projectRoot, { skills: ['specd'] })

      expect(result.installed.length).toBe(1)
      const skillFilePath = path.join(projectRoot, '.github', 'skills', 'specd', 'SKILL.md')
      const sharedFilePath = path.join(projectRoot, '.github', 'skills', 'specd', 'shared.md')
      const skillContent = await readFile(skillFilePath, 'utf8')
      const sharedContent = await readFile(sharedFilePath, 'utf8')
      expect(skillContent).toContain('---')
      expect(skillContent).toContain('name:')
      expect(skillContent).toContain('description:')
      expect(skillContent).not.toContain('allowed-tools:')
      expect(sharedContent).toContain('---')
      expect(sharedContent).toContain('description:')
      expect(sharedContent).toContain('shared-content')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a skill filter, when install is called, then installs only selected skills', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      const { create } = await import('../src/index.js')
      const plugin = create()
      const result = await plugin.install(projectRoot, { skills: ['specd-verify'] })

      expect(result.installed.map((entry) => entry.skill)).toEqual(['specd-verify'])
      expect(result.skipped.length).toBe(0)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given created skill directories, when uninstall is called with skills filter, then removes only selected skills', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      const { create } = await import('../src/index.js')
      const plugin = create()
      await plugin.install(projectRoot, { skills: ['specd', 'specd-verify'] })
      await plugin.uninstall(projectRoot, { skills: ['specd'] })

      const { stat } = await import('node:fs/promises')
      await expect(stat(path.join(projectRoot, '.github', 'skills', 'specd'))).rejects.toThrow()
      await expect(
        stat(path.join(projectRoot, '.github', 'skills', 'specd-verify')),
      ).resolves.toBeDefined()
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given created skill directories, when uninstall is called without skills filter, then removes only specd-managed skills', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      const { create } = await import('../src/index.js')
      const plugin = create()
      await plugin.install(projectRoot, { skills: ['specd'] })
      await plugin.uninstall(projectRoot)

      const { stat } = await import('node:fs/promises')
      await expect(stat(path.join(projectRoot, '.github', 'skills', 'specd'))).rejects.toThrow()
      await expect(stat(path.join(projectRoot, '.github', 'skills'))).resolves.toBeDefined()
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('returns a valid AgentPlugin with correct name and type', async () => {
    const { create } = await import('../src/index.js')
    const plugin = create()
    expect(plugin.name).toBe('@specd/plugin-agent-copilot')
    expect(plugin.type).toBe('agent')
  })
})
