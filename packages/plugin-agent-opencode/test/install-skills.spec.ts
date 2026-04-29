import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { SpecdConfig } from '@specd/core'

const repositoryMock = {
  list: vi.fn(() => [{ name: 'specd', description: 'specd', templates: [] }]),
  get: vi.fn((name: string) =>
    name === 'specd' ? { name, description: name, templates: [] } : undefined,
  ),
  getBundle: vi.fn((name: string, _vars?: any, config?: any) => ({
    name,
    description: name,
    files: [
      { filename: 'SKILL.md', content: '# ' + name },
      { filename: 'shared.md', content: 'shared-content', shared: true },
    ],
    install: async () => {},
    uninstall: async () => {},
  })),
  listSharedFiles: vi.fn(() => []),
}

vi.mock('@specd/skills', () => ({
  createSkillRepository: () => repositoryMock,
}))

async function createTempProjectRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'specd-plugin-agent-opencode-'))
}

function makeMockConfig(projectRoot: string): SpecdConfig {
  return {
    projectRoot,
    configPath: path.join(projectRoot, 'specd.yaml'),
    schemaRef: '@specd/schema-std',
    workspaces: [
      {
        name: 'default',
        specsPath: path.join(projectRoot, 'specs'),
        specsAdapter: { adapter: 'fs', config: {} },
        schemasPath: null,
        schemasAdapter: null,
        codeRoot: projectRoot,
        ownership: 'owned',
        isExternal: false,
      },
    ],
    storage: {
      changesPath: path.join(projectRoot, '.specd', 'changes'),
      changesAdapter: { adapter: 'fs', config: {} },
      draftsPath: path.join(projectRoot, '.specd', 'drafts'),
      draftsAdapter: { adapter: 'fs', config: {} },
      discardedPath: path.join(projectRoot, '.specd', 'discarded'),
      discardedAdapter: { adapter: 'fs', config: {} },
      archivePath: path.join(projectRoot, 'specs'),
      archiveAdapter: { adapter: 'fs', config: {} },
    },
    approvals: { spec: false, signoff: false },
    plugins: { agents: [] },
  }
}

describe('plugin-agent-opencode create()', () => {
  it('given a project root, when install is called, then routes shared files and preserves shared markdown', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      const result = await plugin.install(config, { skills: ['specd'] })

      expect(result.installed.length).toBe(1)
      const skillFilePath = path.join(projectRoot, '.opencode', 'skills', 'specd', 'SKILL.md')
      const skillContent = await readFile(skillFilePath, 'utf8')
      expect(skillContent).toContain('---')
      expect(skillContent).toContain('name: "specd"')

      const sharedFilePath = path.join(
        projectRoot,
        '.opencode',
        'skills',
        '_specd-shared',
        'shared.md',
      )
      const sharedContent = await readFile(sharedFilePath, 'utf8')
      expect(sharedContent).toBe('shared-content')
      expect(sharedContent).not.toContain('name: "specd"')

      await plugin.uninstall(config, { skills: ['specd'] })
      await expect(readFile(sharedFilePath, 'utf8')).resolves.toBe('shared-content')

      const userSkillFilePath = path.join(
        projectRoot,
        '.opencode',
        'skills',
        'user-skill',
        'SKILL.md',
      )
      await mkdir(path.dirname(userSkillFilePath), { recursive: true })
      await writeFile(userSkillFilePath, '# user-skill\n', 'utf8')

      await plugin.uninstall(config)
      await expect(readFile(sharedFilePath, 'utf8')).rejects.toThrow()
      await expect(readFile(userSkillFilePath, 'utf8')).resolves.toBe('# user-skill\n')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})
