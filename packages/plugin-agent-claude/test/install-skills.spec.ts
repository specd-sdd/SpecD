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
  return mkdtemp(path.join(tmpdir(), 'specd-plugin-agent-claude-'))
}

describe('plugin-agent-claude create()', () => {
  it('given a project root, when install is called, then writes a skill directory with frontmatter on markdown files', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      const { create } = await import('../src/index.js')
      const plugin = create()
      const result = await plugin.install(projectRoot, { skills: ['specd'] })

      expect(result.installed.length).toBe(1)
      const skillFilePath = path.join(projectRoot, '.claude', 'skills', 'specd', 'SKILL.md')
      const sharedFilePath = path.join(projectRoot, '.claude', 'skills', 'specd', 'shared.md')
      const skillContent = await readFile(skillFilePath, 'utf8')
      const sharedContent = await readFile(sharedFilePath, 'utf8')
      expect(skillContent).toContain('---')
      expect(skillContent).toContain('description:')
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
})
