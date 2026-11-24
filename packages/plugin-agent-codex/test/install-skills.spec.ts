import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_INVALIDATION_POLICY, type SpecdConfig } from '@specd/core'
import type { Skill, SkillBundle } from '@specd/skills'
import { escapeTomlBasicString } from '../src/application/use-cases/install-skills.js'

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
    async (name: string, _context?: unknown): Promise<SkillBundle> => ({
      name,
      description: name,
      files: [
        {
          filename: 'SKILL.md',
          content:
            name === 'specd-fasttrack'
              ? '---\nname: "specd-fasttrack"\ndescription: "Fast-track code-first development"\n---\n\n# specd-fasttrack\n\n**Mandatory live journal rule:** before moving to the next meaningful action, append an entry to `.specd-exploration.md`.'
              : '---\nname: "specd"\ndescription: "specd"\n---\n\n# ' + name,
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
  return mkdtemp(path.join(tmpdir(), 'specd-plugin-agent-codex-'))
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

describe('plugin-agent-codex create()', () => {
  it('given a project root, when install is called, then routes shared files and preserves shared markdown', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      const result = await plugin.install({ config, contributions: [] })

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
      const skillFilePath = path.join(projectRoot, '.codex', 'skills', 'specd', 'SKILL.md')
      const skillContent = await readFile(skillFilePath, 'utf8')
      expect(skillContent).toContain('---')
      expect(skillContent).toContain('name: "specd"')

      const fasttrackFilePath = path.join(
        projectRoot,
        '.codex',
        'skills',
        'specd-fasttrack',
        'SKILL.md',
      )
      const fasttrackContent = await readFile(fasttrackFilePath, 'utf8')
      const frontmatter = fasttrackContent.match(/^---\n([\s\S]*?)\n---/)?.[1]
      expect(frontmatter?.trim().split('\n')).toEqual([
        'name: "specd-fasttrack"',
        'description: "Fast-track code-first development"',
      ])
      expect(fasttrackContent).toContain('**Mandatory live journal rule:**')
      expect(fasttrackContent).toContain('append an entry to `.specd-exploration.md`')
      expect(repositoryMock.getBundle).toHaveBeenCalledWith(
        'specd-fasttrack',
        expect.objectContaining({
          variables: expect.objectContaining({
            frontmatter: {
              name: 'specd-fasttrack',
              description:
                'Manual-only: use only when the user explicitly invokes /specd-fasttrack. Fast-track code-first development, bugfix, or spike session with live decision journaling and post-facto consolidation into specd.',
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

      await plugin.uninstall({ config, contributions: [], options: { skills: ['specd'] } })
      await expect(readFile(sharedFilePath, 'utf8')).resolves.toBe('shared-content')

      const userSkillFilePath = path.join(projectRoot, '.codex', 'skills', 'user-skill', 'SKILL.md')
      await mkdir(path.dirname(userSkillFilePath), { recursive: true })
      await writeFile(userSkillFilePath, '# user-skill\n', 'utf8')

      await plugin.uninstall({ config, contributions: [] })
      await expect(readFile(sharedFilePath, 'utf8')).rejects.toThrow()
      await expect(readFile(userSkillFilePath, 'utf8')).resolves.toBe('# user-skill\n')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given an agent, when install is called, then generates Codex-specific TOML wrapper', async () => {
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
            templates: [
              {
                filename: 'SPECD-AGENT.md',
                getContent: async () => 'prompt with """triple quotes"""',
              },
            ],
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
            files: [{ filename: 'SPECD-AGENT.md', content: 'prompt with """triple quotes"""' }],
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

      const agentFilePath = path.join(
        projectRoot,
        '.codex',
        'agents',
        'specd-project-context-optimizer.toml',
      )
      const content = await readFile(agentFilePath, 'utf8')

      expect(content).toContain('name = "specd-project-context-optimizer"')
      expect(content).toContain(
        'description = "Generates a high-density, token-efficient version of project-level context."',
      )
      expect(content).toContain('developer_instructions = """')
      expect(content).toContain('prompt with \\"\\"\\"triple quotes\\"\\"\\"')
      expect(content).toContain('"""')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given project root, when install runs, then injects AGENTS.md prompt block and codex marker and uninstalls cleanly', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)

    try {
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })

      await plugin.install({ config, contributions: [], options: { skills: [] } })

      const agentsMdPath = path.join(projectRoot, 'AGENTS.md')
      const agentsContent = await readFile(agentsMdPath, 'utf8')
      expect(agentsContent).toContain('<!-- <specd agents="codex"> -->')
      expect(agentsContent).not.toContain('<!-- <specd-plugin:codex> -->')

      await plugin.uninstall({ config, contributions: [] })

      const exists = await readFile(agentsMdPath, 'utf8')
        .then(() => true)
        .catch(() => false)
      expect(exists).toBe(false)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a prompt with backslashes, when an agent is installed, then TOML escapes them', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      repositoryMock.list.mockResolvedValueOnce([
        {
          name: 'specd',
          description: 'specd',
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
      repositoryMock.get.mockResolvedValueOnce({
        name: 'specd',
        description: 'specd',
        templates: [],
        kind: 'agent',
        metadata: {
          kind: 'agent',
          supportedCapabilities: [],
          requiredCapabilities: [],
          requiredSharedTemplates: [],
        },
      })
      repositoryMock.getBundle.mockResolvedValueOnce({
        name: 'specd',
        description: 'specd',
        files: [{ filename: 'SKILL.md', content: 'path\\to\\file """quoted"""', shared: false }],
        install: async () => {},
        uninstall: async () => {},
      })
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      await plugin.install({ config, contributions: [], options: { agents: ['specd'] } })
      const toml = await readFile(path.join(projectRoot, '.codex', 'agents', 'specd.toml'), 'utf8')
      expect(toml).toContain('path\\\\to\\\\file')
      expect(toml).toContain('\\"\\"\\"quoted\\"\\"\\"')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given codex and another owner, when codex uninstalls, then the other prompt reference and shared.md remain', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      useSharedBundle()
      const { addSharedOwner, injectSpecdBlock } = await import('@specd/skills')
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      await plugin.install({ config, contributions: [], options: { skills: ['specd'] } })
      const sharedDir = path.join(projectRoot, '.specd', 'config', 'skills', 'shared')
      await addSharedOwner(sharedDir, 'opencode')
      const agentsMdPath = path.join(projectRoot, 'AGENTS.md')
      await injectSpecdBlock(agentsMdPath, 'opencode prompt', 'opencode')
      await plugin.uninstall({ config, contributions: [] })
      const content = await readFile(agentsMdPath, 'utf8')
      expect(content).toContain('agents="opencode"')
      expect(content).not.toContain('agents="codex"')
      expect(await readFile(path.join(sharedDir, 'shared.md'), 'utf8')).toBe('shared-content')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given capabilities without agents, when an agent is installed, then it is written next to shared.md', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      repositoryMock.get.mockImplementation(async (name: string) =>
        name === 'specd'
          ? {
              name,
              description: 'specd',
              kind: 'agent' as const,
              templates: [],
              metadata: {
                kind: 'agent' as const,
                supportedCapabilities: [],
                requiredCapabilities: [],
                requiredSharedTemplates: [],
              },
            }
          : undefined,
      )
      repositoryMock.getBundle.mockImplementation(async (name: string) => ({
        name,
        description: name,
        files: [{ filename: 'AGENT.md', content: 'prompt-content' }],
        install: async () => {},
        uninstall: async () => {},
      }))
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      await plugin.install({
        config,
        contributions: [],
        options: { skills: [], agents: ['specd'], capabilities: ['frontmatter'] },
      })
      expect(
        await readFile(
          path.join(projectRoot, '.specd', 'config', 'skills', 'shared', 'specd.agent.md'),
          'utf8',
        ),
      ).toContain('prompt-content')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given codex is the only owner, when codex is fully uninstalled, then specd shared files and the empty folder are removed', async () => {
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

  it('given a foreign file and codex as the only owner, when codex is fully uninstalled, then the folder remains', async () => {
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

  it('given a skills filter, when codex is uninstalled, then the marker and shared files stay', async () => {
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

  it('given the first shared write fails, when install rejects, then the marker lists codex and a later full uninstall releases it and cleans up', async () => {
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
      expect(owners.owners).toEqual(['codex'])

      await rm(path.join(sharedDir, 'blocked'), { recursive: true, force: true })
      await plugin.uninstall({ config, contributions: [] })
      await expect(stat(sharedDir)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a legacy shared folder without a marker, when codex is fully uninstalled, then shared.md remains', async () => {
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

  it('given the fast-track skill is selected, when install is called, then it is rendered with its frontmatter', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      useSharedBundle()
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      await plugin.install({ config, contributions: [], options: { skills: ['specd-fasttrack'] } })
      expect(repositoryMock.getBundle).toHaveBeenCalledWith(
        'specd-fasttrack',
        expect.objectContaining({
          variables: expect.objectContaining({
            frontmatter: {
              name: 'specd-fasttrack',
              description:
                'Manual-only: use only when the user explicitly invokes /specd-fasttrack. Fast-track code-first development, bugfix, or spike session with live decision journaling and post-facto consolidation into specd.',
            },
          }),
        }),
      )
      expect(
        await readFile(
          path.join(projectRoot, '.codex', 'skills', 'specd-fasttrack', 'SKILL.md'),
          'utf8',
        ),
      ).toContain('# specd-fasttrack')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('escapes TOML basic strings with quotes, backslashes, newlines and control characters', () => {
    expect(escapeTomlBasicString('plain')).toBe('"plain"')
    expect(escapeTomlBasicString('say "hi" \\ there')).toBe('"say \\"hi\\" \\\\ there"')
    expect(escapeTomlBasicString('a\nb\tc\rd\be\ff')).toBe('"a\\nb\\tc\\rd\\be\\ff"')
    expect(escapeTomlBasicString('x\u0000y\u001Fz\u007F')).toBe('"x\\u0000y\\u001Fz\\u007F"')
    expect(escapeTomlBasicString('ünï \u{1F600}')).toBe('"ünï \u{1F600}"')
  })

  it('given an agent whose metadata has special characters, when installed, then name and description are valid TOML basic strings', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      const { agentFrontmatter } = await import('../src/domain/frontmatter/index.js')
      const key = 'specd-toml-escape'
      const original = { ...agentFrontmatter }
      ;(agentFrontmatter as Record<string, unknown>)[key] = {
        name: 'na"me\\x',
        description: 'line1\nline2\u0001 "q"',
      }
      try {
        repositoryMock.get.mockImplementation(async (name: string) => ({
          name,
          description: name,
          templates: [],
          kind: 'agent' as const,
          metadata: {
            kind: 'agent' as const,
            supportedCapabilities: [],
            requiredCapabilities: [],
            requiredSharedTemplates: [],
          },
        }))
        repositoryMock.getBundle.mockImplementation(async (name: string) => ({
          name,
          description: name,
          files: [{ filename: 'SPECD-AGENT.md', content: 'body' }],
          install: async () => {},
          uninstall: async () => {},
        }))
        const { create } = await import('../src/index.js')
        const plugin = await create({ config })
        await plugin.install({ config, contributions: [], options: { skills: [], agents: [key] } })
        const toml = await readFile(
          path.join(projectRoot, '.codex', 'agents', `${key}.toml`),
          'utf8',
        )
        expect(toml).toContain('name = "na\\"me\\\\x"')
        expect(toml).toContain('description = "line1\\nline2\\u0001 \\"q\\""')
      } finally {
        delete (agentFrontmatter as Record<string, unknown>)[key]
        Object.assign(agentFrontmatter, original)
      }
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})
