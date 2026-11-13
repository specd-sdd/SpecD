import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_INVALIDATION_POLICY, type SpecdConfig } from '@specd/core'
import type { Skill, SkillBundle } from '@specd/skills'
import { splitTopLevelCommas } from '../src/application/use-cases/install-skills.js'

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

describe('plugin-agent-copilot create()', () => {
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
                'Manual-only: use only when the user explicitly invokes /specd-fasttrack. Fast-track code-first development, bugfix, or spike session with live decision journaling and post-facto consolidation into specd.',
              'disable-model-invocation': true,
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

      const userSkillFilePath = path.join(
        projectRoot,
        '.github',
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

      await plugin.install({ config, contributions: [], options: { skills: [] } })

      const copilotMdPath = path.join(projectRoot, '.github', 'copilot-instructions.md')
      const copilotContent = await readFile(copilotMdPath, 'utf8')
      expect(copilotContent).toContain('<!-- <specd agents="copilot"> -->')
      expect(copilotContent).toContain('<!-- </specd> -->')

      await plugin.uninstall({ config, contributions: [] })

      const exists = await readFile(copilotMdPath, 'utf8')
        .then(() => true)
        .catch(() => false)
      expect(exists).toBe(false)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a user file in the shared folder, when uninstall runs, then that file remains', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      await plugin.install({ config, contributions: [] })
      const sharedDir = path.join(projectRoot, '.specd', 'config', 'skills', 'shared')
      const userFile = path.join(sharedDir, 'user-notes.md')
      await mkdir(sharedDir, { recursive: true })
      await writeFile(userFile, 'keep me', 'utf8')
      await plugin.uninstall({ config, contributions: [] })
      expect(await readFile(userFile, 'utf8')).toBe('keep me')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a filtered install, when it writes shared files, then copilot is recorded as an owner', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      useSharedBundle()
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      await plugin.install({ config, contributions: [], options: { skills: ['specd'] } })
      const owners = JSON.parse(
        await readFile(
          path.join(projectRoot, '.specd', 'config', 'skills', 'shared', '.owners.json'),
          'utf8',
        ),
      ) as { owners: string[] }
      expect(owners.owners).toEqual(['copilot'])
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given another owner remains, when copilot is fully uninstalled, then shared.md stays', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      useSharedBundle()
      const { addSharedOwner } = await import('@specd/skills')
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      await plugin.install({ config, contributions: [], options: { skills: ['specd'] } })
      const sharedDir = path.join(projectRoot, '.specd', 'config', 'skills', 'shared')
      await addSharedOwner(sharedDir, 'claude')
      await plugin.uninstall({ config, contributions: [] })
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
        name === 'specd-project-context-optimizer'
          ? {
              name,
              description: 'optimizer',
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
        files: [{ filename: 'SPECD-AGENT.md', content: 'prompt-content' }],
        install: async () => {},
        uninstall: async () => {},
      }))
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      await plugin.install({
        config,
        contributions: [],
        options: {
          skills: [],
          agents: ['specd-project-context-optimizer'],
          capabilities: ['frontmatter'],
        },
      })
      expect(
        await readFile(
          path.join(
            projectRoot,
            '.specd',
            'config',
            'skills',
            'shared',
            'specd-project-context-optimizer.agent.md',
          ),
          'utf8',
        ),
      ).toContain('prompt-content')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given copilot is the only owner, when copilot is fully uninstalled, then specd shared files and the empty folder are removed', async () => {
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

  it('given a foreign file and copilot as the only owner, when copilot is fully uninstalled, then the folder remains', async () => {
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

  it('given a skills filter, when copilot is uninstalled, then the marker and shared files stay', async () => {
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

  it('given the first shared write fails, when install rejects, then the marker lists copilot and a later full uninstall releases it and cleans up', async () => {
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
      expect(owners.owners).toEqual(['copilot'])

      await rm(path.join(sharedDir, 'blocked'), { recursive: true, force: true })
      await plugin.uninstall({ config, contributions: [] })
      await expect(stat(sharedDir)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a legacy shared folder without a marker, when copilot is fully uninstalled, then shared.md remains', async () => {
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
              'disable-model-invocation': true,
            },
          }),
        }),
      )
      expect(
        await readFile(
          path.join(projectRoot, '.github', 'skills', 'specd-fasttrack', 'SKILL.md'),
          'utf8',
        ),
      ).toContain('# specd-fasttrack')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('splits agent tool lists on top-level commas only', () => {
    expect(splitTopLevelCommas('Bash(node *), Bash(a, b), Read , Write')).toEqual([
      'Bash(node *)',
      'Bash(a, b)',
      'Read',
      'Write',
    ])
    expect(splitTopLevelCommas('Read,,Write,')).toEqual(['Read', 'Write'])
    expect(splitTopLevelCommas('Bash(a(b, c), d), Read')).toEqual(['Bash(a(b, c), d)', 'Read'])
  })
})
