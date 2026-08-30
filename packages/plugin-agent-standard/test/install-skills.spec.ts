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
    ],
  ),
  get: vi.fn(
    async (name: string): Promise<Skill | undefined> =>
      name === 'specd'
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
    async (name: string, _context?: unknown): Promise<SkillBundle> => ({
      name,
      description: name,
      files: [
        {
          filename: 'SKILL.md',
          content: '---\nname: "specd"\nallowed-tools: Bash(node:*)\n---\n\n# ' + name,
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
  return mkdtemp(path.join(tmpdir(), 'specd-plugin-agent-standard-'))
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

describe('plugin-agent-standard create()', () => {
  it('given a project root, when install is called, then writes to .agents/skills/ with allowed-tools frontmatter', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      const result = await plugin.install(config, { skills: ['specd'] })

      expect(result.installed.length).toBe(1)
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
      const skillFilePath = path.join(projectRoot, '.agents', 'skills', 'specd', 'SKILL.md')
      const skillContent = await readFile(skillFilePath, 'utf8')
      expect(skillContent).toContain('---')
      expect(skillContent).toContain('name: "specd"')
      expect(skillContent).toContain('allowed-tools:')
      expect(skillContent).toContain('Bash(')
      expect(skillContent).not.toContain('allowed_tools:')

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
        '.agents',
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

  it('given the default skill selection, when install is called, then renders fast-track with Standard frontmatter only', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      repositoryMock.list.mockImplementation(async () => [
        {
          name: 'specd-fasttrack',
          description: 'Fast-track',
          templates: [],
          kind: 'skill',
          metadata: {
            kind: 'skill',
            supportedCapabilities: ['mcp', 'agents', 'frontmatter'],
            requiredCapabilities: [],
            requiredSharedTemplates: [],
          },
        },
      ])
      repositoryMock.get.mockImplementation(async (name: string) =>
        name === 'specd-fasttrack'
          ? {
              name,
              description: 'Fast-track',
              templates: [],
              kind: 'skill' as const,
              metadata: {
                kind: 'skill' as const,
                supportedCapabilities: ['mcp', 'agents', 'frontmatter'],
                requiredCapabilities: [],
                requiredSharedTemplates: [],
              },
            }
          : undefined,
      )
      repositoryMock.getBundle.mockImplementation(
        async (name: string, context?: unknown): Promise<SkillBundle> => {
          const capabilities = (context as { capabilities?: readonly string[] } | undefined)
            ?.capabilities

          return {
            name,
            description: 'Fast-track',
            files: [
              {
                filename: 'SKILL.md',
                content: `---\nname: \"specd-fasttrack\"\nallowed-tools: Bash(node:*) Bash(specd:*) Bash(pnpm:*) Read Write Edit Grep Glob Agent\n---\n\n# ${name}\n${capabilities?.includes('mcp') ? 'mcp-instructions' : ''}\n${capabilities?.includes('agents') ? 'agent-instructions' : ''}`,
              },
            ],
            install: async () => {},
            uninstall: async () => {},
          }
        },
      )

      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      await plugin.install(config)

      expect(repositoryMock.getBundle).toHaveBeenCalledWith(
        'specd-fasttrack',
        expect.objectContaining({
          capabilities: ['frontmatter'],
          variables: expect.objectContaining({
            frontmatter: {
              name: 'specd-fasttrack',
              description:
                'Manual-only: use only when the user explicitly invokes /specd-fasttrack. Fast-track code-first development, bugfix, or spike session with live decision journaling and post-facto consolidation into specd.',
              'allowed-tools':
                'Bash(node:*) Bash(specd:*) Bash(pnpm:*) Read Write Edit Grep Glob Agent',
            },
          }),
        }),
      )
      const content = await readFile(
        path.join(projectRoot, '.agents', 'skills', 'specd-fasttrack', 'SKILL.md'),
        'utf8',
      )
      expect(content).toContain(
        'allowed-tools: Bash(node:*) Bash(specd:*) Bash(pnpm:*) Read Write Edit Grep Glob Agent',
      )
      expect(content).not.toContain('mcp-instructions')
      expect(content).not.toContain('agent-instructions')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given an agent, when install is called, then generates Standard YAML wrapper', async () => {
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
          variables: expect.objectContaining({
            frontmatter: {
              name: 'specd-project-context-optimizer',
              description:
                'Generates a high-density, token-efficient version of project-level context.',
            },
          }),
        }),
      )

      const agentFilePath = path.join(
        projectRoot,
        '.specd',
        'config',
        'skills',
        'shared',
        'specd-project-context-optimizer.agent.md',
      )
      const content = await readFile(agentFilePath, 'utf8')

      expect(content).toContain('prompt-content')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given project root, when install runs, then injects AGENTS.md prompt block and standard marker and uninstalls cleanly', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)

    try {
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })

      await plugin.install(config, { skills: [] })

      const agentsMdPath = path.join(projectRoot, 'AGENTS.md')
      const agentsContent = await readFile(agentsMdPath, 'utf8')
      expect(agentsContent).toContain('<!-- <specd agents="standard"> -->')
      expect(agentsContent).not.toContain('<!-- <specd-plugin:standard> -->')

      await plugin.uninstall(config)

      const exists = await readFile(agentsMdPath, 'utf8')
        .then(() => true)
        .catch(() => false)
      expect(exists).toBe(false)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})
