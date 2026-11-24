import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_INVALIDATION_POLICY, type SpecdConfig } from '@specd/core'
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

function useSharedBundle(): void {
  repositoryMock.get.mockImplementation(async (name: string) => ({
    name,
    description: name,
    templates: [],
    kind: 'skill' as const,
    metadata: {
      kind: 'skill' as const,
      supportedCapabilities: [],
      requiredCapabilities: [],
      requiredSharedTemplates: [],
    },
  }))
  repositoryMock.getBundle.mockImplementation(async (name: string) => ({
    name,
    description: name,
    files: [
      { filename: 'SKILL.md', content: `# ${name}` },
      { filename: 'shared.md', content: 'shared-content', shared: true },
    ],
    install: async () => {},
    uninstall: async () => {},
  }))
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
    invalidation: DEFAULT_INVALIDATION_POLICY,
    plugins: [],
  }
}

describe('plugin-agent-standard create()', () => {
  it('given a project root, when install is called, then writes to .agents/skills/ with allowed-tools frontmatter', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      const result = await plugin.install({
        config,
        contributions: [],
        options: { skills: ['specd'] },
      })

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

      await plugin.uninstall({ config, contributions: [], options: { skills: ['specd'] } })
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

      await plugin.uninstall({ config, contributions: [] })
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
      await plugin.install({ config, contributions: [] })

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
                'Bash(node *) Bash(specd *) Bash(pnpm *) Read Write Edit Grep Glob Agent',
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

      const result = await plugin.install({
        config,
        contributions: [],
        options: {
          skills: [],
          agents: ['specd-project-context-optimizer'],
        },
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

      await plugin.install({ config, contributions: [], options: { skills: [] } })

      const agentsMdPath = path.join(projectRoot, 'AGENTS.md')
      const agentsContent = await readFile(agentsMdPath, 'utf8')
      expect(agentsContent).toContain('<!-- <specd agents="standard"> -->')
      expect(agentsContent).not.toContain('<!-- <specd-plugin:standard> -->')

      await plugin.uninstall({ config, contributions: [] })

      const exists = await readFile(agentsMdPath, 'utf8')
        .then(() => true)
        .catch(() => false)
      expect(exists).toBe(false)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given an agent file and a user file, when uninstall runs, then only the agent file is removed', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      repositoryMock.list.mockResolvedValueOnce([
        {
          name: 'specd-project-context-optimizer',
          description: 'optimizer',
          templates: [],
          kind: 'agent',
          metadata: {
            kind: 'agent',
            supportedCapabilities: [],
            requiredCapabilities: [],
            requiredSharedTemplates: [],
          },
        },
      ])
      const sharedDir = path.join(projectRoot, '.specd', 'config', 'skills', 'shared')
      await mkdir(sharedDir, { recursive: true })
      await writeFile(
        path.join(sharedDir, '.owners.json'),
        `${JSON.stringify({ owners: ['standard'] }, null, 2)}\n`,
        'utf8',
      )
      const agentFile = path.join(sharedDir, 'specd-project-context-optimizer.agent.md')
      const userFile = path.join(sharedDir, 'user-notes.md')
      await writeFile(agentFile, 'agent', 'utf8')
      await writeFile(userFile, 'keep', 'utf8')
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      await plugin.uninstall({ config, contributions: [] })
      await expect(readFile(agentFile, 'utf8')).rejects.toThrow()
      expect(await readFile(userFile, 'utf8')).toBe('keep')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('declares allowed-tools with a space before the command pattern', async () => {
    const { skillFrontmatter } = await import('../src/domain/frontmatter/index.js')
    const tools = skillFrontmatter['specd-fasttrack']?.['allowed-tools']
    expect(tools).toContain('Bash(node *)')
    expect(tools).toContain('Bash(specd *)')
    expect(tools).toContain('Bash(pnpm *)')
    expect(tools).not.toContain('Bash(node:*)')
    const compliance = skillFrontmatter['specd-compliance']?.['allowed-tools']
    expect(compliance).toContain('Bash(node *)')
    expect(compliance).toContain('Bash(pnpm *)')
    expect(compliance).toContain('Bash(git *)')
    expect(compliance).toContain('Bash(gh *)')
    expect(compliance).not.toContain(':')
  })

  it('given two tagged blocks, when one plugin uninstalls, then the other block remains', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      const { injectSpecdBlock } = await import('@specd/skills')
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      await plugin.install({ config, contributions: [], options: { skills: [] } })
      const agentsMdPath = path.join(projectRoot, 'AGENTS.md')
      await injectSpecdBlock(agentsMdPath, 'codex prompt', 'codex')
      await plugin.uninstall({ config, contributions: [] })
      const content = await readFile(agentsMdPath, 'utf8')
      expect(content).toContain('agents="codex"')
      expect(content).not.toContain('agents="standard"')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a selected agent, when that agent is uninstalled, then only its shared agent file is removed', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    const originalList = repositoryMock.list.getMockImplementation()
    try {
      useSharedBundle()
      const baseList = await repositoryMock.list()
      const agentItem = (name: string): (typeof baseList)[number] => ({
        name,
        description: name,
        templates: [],
        kind: 'agent',
        metadata: {
          kind: 'agent',
          name,
          description: name,
          supportedCapabilities: [],
          requiredCapabilities: [],
          requiredSharedTemplates: [],
        },
      })
      repositoryMock.list.mockImplementation(async () => [
        ...baseList,
        agentItem('specd-project-context-optimizer'),
        agentItem('specd-spec-context-optimizer'),
      ])
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      await plugin.install({ config, contributions: [], options: { skills: ['specd'] } })
      const sharedDir = path.join(projectRoot, '.specd', 'config', 'skills', 'shared')
      const selected = path.join(sharedDir, 'specd-project-context-optimizer.agent.md')
      const other = path.join(sharedDir, 'specd-spec-context-optimizer.agent.md')
      await writeFile(selected, 'selected', 'utf8')
      await writeFile(other, 'other', 'utf8')
      const markerBefore = await readFile(path.join(sharedDir, '.owners.json'), 'utf8')
      await plugin.uninstall({
        config,
        contributions: [],
        options: { agents: ['specd-project-context-optimizer'] },
      })
      await expect(readFile(selected, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
      expect(await readFile(other, 'utf8')).toBe('other')
      expect(await readFile(path.join(sharedDir, '.owners.json'), 'utf8')).toBe(markerBefore)
      expect(await readFile(path.join(sharedDir, 'shared.md'), 'utf8')).toBe('shared-content')
    } finally {
      if (originalList) repositoryMock.list.mockImplementation(originalList)
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a legacy shared folder without a marker, when standard is fully uninstalled, then shared.md remains', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      const sharedFile = path.join(projectRoot, '.specd', 'config', 'skills', 'shared', 'shared.md')
      await mkdir(path.dirname(sharedFile), { recursive: true })
      await writeFile(sharedFile, 'legacy', 'utf8')
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      await plugin.uninstall({ config, contributions: [] })
      expect(await readFile(sharedFile, 'utf8')).toBe('legacy')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given standard is the only owner, when standard is fully uninstalled, then specd shared files and the empty folder are removed', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      useSharedBundle()
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      await plugin.install({ config, contributions: [], options: { skills: ['specd'] } })
      const sharedDir = path.join(projectRoot, '.specd', 'config', 'skills', 'shared')
      await plugin.uninstall({ config, contributions: [] })
      await expect(readFile(path.join(sharedDir, 'shared.md'), 'utf8')).rejects.toMatchObject({
        code: 'ENOENT',
      })
      await expect(stat(sharedDir)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a foreign file and standard as the only owner, when standard is fully uninstalled, then the folder remains', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      useSharedBundle()
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      await plugin.install({ config, contributions: [], options: { skills: ['specd'] } })
      const notes = path.join(projectRoot, '.specd', 'config', 'skills', 'shared', 'notes.txt')
      await writeFile(notes, 'user', 'utf8')
      await plugin.uninstall({ config, contributions: [] })
      expect(await readFile(notes, 'utf8')).toBe('user')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a skills filter, when standard is uninstalled, then the marker and shared files stay', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      useSharedBundle()
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      await plugin.install({ config, contributions: [], options: { skills: ['specd'] } })
      const sharedDir = path.join(projectRoot, '.specd', 'config', 'skills', 'shared')
      const before = await readFile(path.join(sharedDir, '.owners.json'), 'utf8')
      await plugin.uninstall({ config, contributions: [], options: { skills: ['specd'] } })
      expect(await readFile(path.join(sharedDir, '.owners.json'), 'utf8')).toBe(before)
      expect(await readFile(path.join(sharedDir, 'shared.md'), 'utf8')).toBe('shared-content')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given the first shared write fails, when install rejects, then the marker lists standard and a later full uninstall releases it and cleans up', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      useSharedBundle()
      repositoryMock.getBundle.mockImplementation(async (name: string) => ({
        name,
        description: name,
        files: [
          { filename: 'SKILL.md', content: `# ${name}` },
          { filename: 'blocked', content: 'x', shared: true },
          { filename: 'shared.md', content: 'shared-content', shared: true },
        ],
        install: async () => {},
        uninstall: async () => {},
      }))
      const sharedDir = path.join(projectRoot, '.specd', 'config', 'skills', 'shared')
      // A directory named like the FIRST shared file makes the first shared write fail.
      await mkdir(path.join(sharedDir, 'blocked'), { recursive: true })
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      await expect(
        plugin.install({ config, contributions: [], options: { skills: ['specd'] } }),
      ).rejects.toThrow()
      // No shared file was written, yet the owner is already registered.
      await expect(readFile(path.join(sharedDir, 'shared.md'), 'utf8')).rejects.toMatchObject({
        code: 'ENOENT',
      })
      const owners = JSON.parse(await readFile(path.join(sharedDir, '.owners.json'), 'utf8')) as {
        owners: string[]
      }
      expect(owners.owners).toEqual(['standard'])

      await rm(path.join(sharedDir, 'blocked'), { recursive: true, force: true })
      await plugin.uninstall({ config, contributions: [] })
      await expect(stat(sharedDir)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})
