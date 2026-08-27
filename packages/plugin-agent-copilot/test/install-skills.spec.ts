import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { SpecdConfig } from '@specd/core'
import type { Skill, SkillBundle } from '@specd/skills'

const repositoryMock = {
  list: vi.fn(
    async (): Promise<readonly Skill[]> => [
      {
        name: 'specd',
        description: 'specd',
        templates: [],
        kind: 'skill',
        metadata: {
          kind: 'skill',
          supportedCapabilities: [],
          requiredCapabilities: [],
          requiredSharedTemplates: [],
        },
      },
      {
        name: 'specd-fasttrack',
        description: 'specd-fasttrack',
        templates: [],
        kind: 'skill',
        metadata: {
          kind: 'skill',
          supportedCapabilities: ['mcp', 'agents', 'frontmatter'],
          requiredCapabilities: [],
          requiredSharedTemplates: [],
        },
      },
    ],
  ),
  get: vi.fn(
    async (name: string): Promise<Skill | undefined> =>
      name === 'specd' || name === 'specd-fasttrack'
        ? {
            name,
            description: name,
            templates: [],
            kind: 'skill',
            metadata: {
              kind: 'skill',
              supportedCapabilities: [],
              requiredCapabilities: [],
              requiredSharedTemplates: [],
            },
          }
        : undefined,
  ),
  getBundle: vi.fn(
    async (name: string, context?: { capabilities?: readonly string[] }): Promise<SkillBundle> => ({
      name,
      description: name,
      files: [
        {
          filename: 'SKILL.md',
          content:
            name === 'specd-fasttrack'
              ? '---\nname: "specd-fasttrack"\ndescription: "Fast-track code-first development"\n---\n\n# specd-fasttrack\n\nCore workflow guidance' +
                (context?.capabilities?.includes('mcp')
                  ? '\n\nMCP-backed project workflow guidance'
                  : '')
              : '---\nname: "specd"\n---\n\n# ' + name,
        },
        { filename: 'shared.md', content: 'shared-content', shared: true },
      ],
      install: async () => {},
      uninstall: async () => {},
    }),
  ),
  listSharedFiles: vi.fn(async () => []),
}

vi.mock('@specd/skills', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@specd/skills')>()
  return { ...actual, createSkillRepository: () => repositoryMock }
})

async function createTempProjectRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'specd-plugin-agent-copilot-'))
}

function makeMockConfig(projectRoot: string): SpecdConfig {
  return {
    projectRoot,
    configPath: path.join(projectRoot, '.specd', 'config'),
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

describe('plugin-agent-copilot create()', () => {
  it('given a project root, when install is called, then routes shared files and preserves shared markdown', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      const result = await plugin.install(config)

      expect(result.installed.length).toBe(2)
      expect(repositoryMock.getBundle).toHaveBeenCalledWith(
        'specd',
        expect.objectContaining({
          variables: expect.objectContaining({
            configPath: '.specd/config',
            schemaRef: '@specd/schema-std',
            sharedFolder: '.specd/config/skills/shared',
          }),
        }),
      )
      const skillFilePath = path.join(projectRoot, '.github', 'skills', 'specd', 'SKILL.md')
      const skillContent = await readFile(skillFilePath, 'utf8')
      expect(skillContent).toContain('---')
      expect(skillContent).toContain('name: "specd"')

      const fasttrackFilePath = path.join(
        projectRoot,
        '.github',
        'skills',
        'specd-fasttrack',
        'SKILL.md',
      )
      const fasttrackContent = await readFile(fasttrackFilePath, 'utf8')
      expect(fasttrackContent).toContain('name: "specd-fasttrack"')
      expect(fasttrackContent).not.toContain('MCP-backed project workflow guidance')
      expect(fasttrackContent).not.toContain('allowed-tools:')
      expect(repositoryMock.getBundle).toHaveBeenCalledWith(
        'specd-fasttrack',
        expect.objectContaining({
          capabilities: expect.arrayContaining(['frontmatter', 'agents']),
          variables: expect.objectContaining({
            frontmatter: {
              name: 'specd-fasttrack',
              description:
                'Fast-track code-first development, bugfix, or spike session with live decision journaling and post-facto consolidation into specd.',
            },
          }),
        }),
      )

      const sharedFilePath = path.join(
        projectRoot,
        '.specd',
        'config',
        'skills',
        'shared',
        'shared.md',
      )
      const sharedContent = await readFile(sharedFilePath, 'utf8')
      expect(sharedContent).toBe('shared-content')
      expect(sharedContent).not.toContain('name: "specd"')

      await plugin.uninstall(config, { skills: ['specd'] })
      await expect(readFile(sharedFilePath, 'utf8')).resolves.toBe('shared-content')

      const userSkillFilePath = path.join(
        projectRoot,
        '.github',
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

  it('given an agent, when install is called, then generates Copilot-specific YAML wrapper', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)

    try {
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      repositoryMock.get.mockImplementation(async (name: string) => {
        if (name === 'specd-project-context-optimizer') {
          return {
            name: 'specd-project-context-optimizer',
            description: 'AI Optimizer',
            kind: 'agent',
            templates: [{ filename: 'SPECD-AGENT.md', getContent: async () => 'prompt-content' }],
            metadata: {
              kind: 'agent',
              name: 'specd-project-context-optimizer',
              description: 'AI Optimizer',
              supportedCapabilities: [],
              requiredCapabilities: [],
              requiredSharedTemplates: [],
            },
          }
        }
        return undefined
      })
      repositoryMock.getBundle.mockImplementation(async (name: string): Promise<SkillBundle> => {
        if (name === 'specd-project-context-optimizer') {
          return {
            name: 'specd-project-context-optimizer',
            description: 'AI Optimizer',
            files: [{ filename: 'SPECD-AGENT.md', content: 'prompt-content' }],
            install: async () => {},
            uninstall: async () => {},
          }
        }
        return {
          name,
          description: name,
          files: [],
          install: async () => {},
          uninstall: async () => {},
        }
      })

      const result = await plugin.install(config, {
        skills: [],
        agents: ['specd-project-context-optimizer'],
      })
      expect(result.installed).toContainEqual(
        expect.objectContaining({ skill: 'specd-project-context-optimizer' }),
      )

      expect(repositoryMock.getBundle).toHaveBeenCalledWith(
        'specd-project-context-optimizer',
        expect.objectContaining({
          capabilities: expect.arrayContaining(['frontmatter', 'agents']),
          variables: expect.objectContaining({
            frontmatter: {
              name: 'specd-project-context-optimizer',
              description:
                'Generates a high-density, token-efficient version of project-level context.',
              tools: [
                'Bash(node *)',
                'Bash(specd *)',
                'Bash(cat *)',
                'Bash(rm *)',
                'Read',
                'Write',
              ],
            },
          }),
        }),
      )

      const agentFilePath = path.join(
        projectRoot,
        '.github',
        'agents',
        'specd-project-context-optimizer.agent.md',
      )
      const content = await readFile(agentFilePath, 'utf8')

      expect(content).toContain('prompt-content')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given project root, when install runs, then injects copilot-instructions.md prompt block and uninstalls cleanly', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)

    try {
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })

      await plugin.install(config, { skills: [] })

      const copilotMdPath = path.join(projectRoot, '.github', 'copilot-instructions.md')
      const copilotContent = await readFile(copilotMdPath, 'utf8')
      expect(copilotContent).toContain('<!-- <specd agents="copilot"> -->')
      expect(copilotContent).toContain('<!-- </specd> -->')

      await plugin.uninstall(config)

      const exists = await readFile(copilotMdPath, 'utf8')
        .then(() => true)
        .catch(() => false)
      expect(exists).toBe(false)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})
