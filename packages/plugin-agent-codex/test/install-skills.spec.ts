import { mkdtemp, readFile, rm } from 'node:fs/promises'
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
    files: [{ filename: 'SKILL.md', content: '# ' + name }],
    install: async () => {},
    uninstall: async () => {},
  })),
  listSharedFiles: vi.fn(() => []),
}

vi.mock('@specd/skills', () => ({
  createSkillRepository: () => repositoryMock,
}))

async function createTempProjectRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'specd-plugin-agent-codex-'))
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

describe('plugin-agent-codex create()', () => {
  it('given a project root, when install is called, then writes a skill directory with frontmatter', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      const result = await plugin.install(config, { skills: ['specd'] })

      expect(result.installed.length).toBe(1)
      const skillFilePath = path.join(projectRoot, '.codex', 'skills', 'specd', 'SKILL.md')
      const skillContent = await readFile(skillFilePath, 'utf8')
      expect(skillContent).toContain('---')
      expect(skillContent).toContain('name: "specd"')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})
