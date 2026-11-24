import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_INVALIDATION_POLICY, type SpecdConfig } from '@specd/core'
import type { Skill, SkillBundle } from '@specd/skills'

const ID = 'copilot'
const OTHER_OWNER = 'claude'
const AGENT_A = 'specd-project-context-optimizer'
const AGENT_B = 'specd-spec-context-optimizer'
const SKILLS_DIR = ['.github', 'skills']
const PROMPT_FILE = ['.github', 'copilot-instructions.md']
const NO_AGENTS_CAPABILITIES = ['frontmatter']

function makeItem(name: string, kind: 'skill' | 'agent'): Skill {
  return {
    name,
    description: name,
    templates: [],
    kind,
    metadata: {
      kind,
      supportedCapabilities: [],
      requiredCapabilities: [],
      requiredSharedTemplates: [],
    },
  }
}

const ITEMS: readonly Skill[] = [
  makeItem('specd', 'skill'),
  makeItem(AGENT_A, 'agent'),
  makeItem(AGENT_B, 'agent'),
]

const repositoryMock = {
  list: vi.fn(async (): Promise<readonly Skill[]> => ITEMS),
  get: vi.fn(
    async (name: string): Promise<Skill | undefined> => ITEMS.find((item) => item.name === name),
  ),
  getBundle: vi.fn(
    async (name: string, _context?: unknown): Promise<SkillBundle> => ({
      name,
      description: name,
      files:
        name === 'specd'
          ? [
              { filename: 'SKILL.md', content: '# specd' },
              { filename: 'shared.md', content: 'shared-content', shared: true },
            ]
          : [{ filename: 'SPECD-AGENT.md', content: `prompt for ${name}` }],
      install: async () => {},
      uninstall: async () => {},
    }),
  ),
  listSharedFiles: vi.fn(async () => [{ filename: 'shared.md', content: 'shared-content' }]),
}

vi.mock('@specd/skills', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@specd/skills')>()
  return { ...actual, createSkillRepository: () => repositoryMock }
})

async function createTempProjectRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'specd-plugin-agent-copilot-owners-'))
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

function sharedDirOf(projectRoot: string): string {
  return path.join(projectRoot, '.specd', 'config', 'skills', 'shared')
}

function skillDirOf(projectRoot: string, name: string): string {
  return path.join(projectRoot, ...SKILLS_DIR, name)
}

function agentPathOf(projectRoot: string, name: string): string {
  return path.join(projectRoot, '.github', 'agents', `${name}.agent.md`)
}

async function exists(file: string): Promise<boolean> {
  return stat(file).then(
    () => true,
    () => false,
  )
}

async function readOwners(projectRoot: string): Promise<string[]> {
  const raw = await readFile(path.join(sharedDirOf(projectRoot), '.owners.json'), 'utf8')
  return (JSON.parse(raw) as { owners: string[] }).owners
}

/** Installs with the default skills and agents, placing agents in the shared folder. */
async function installAgentsInSharedFolder(projectRoot: string): Promise<{
  uninstall: () => Promise<void>
}> {
  const config = makeMockConfig(projectRoot)
  const { create } = await import('../src/index.js')
  const plugin = await create({ config })
  await plugin.install({
    config,
    contributions: [],
    options: { capabilities: NO_AGENTS_CAPABILITIES },
  })
  return {
    uninstall: () => plugin.uninstall({ config, contributions: [] }),
  }
}

describe('plugin-agent-copilot shared-folder ownership', () => {
  it('given an agent-only install with capabilities lacking agents, when the agent lands in the shared folder, then the owner is registered and a later full uninstall cleans up', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      await plugin.install({
        config,
        contributions: [],
        options: {
          skills: ['no-such-skill'],
          agents: [AGENT_A],
          capabilities: NO_AGENTS_CAPABILITIES,
        },
      })

      const sharedDir = sharedDirOf(projectRoot)
      expect(await readOwners(projectRoot)).toEqual([ID])
      expect(await readFile(path.join(sharedDir, `${AGENT_A}.agent.md`), 'utf8')).toContain(
        `prompt for ${AGENT_A}`,
      )
      expect(await exists(path.join(sharedDir, 'shared.md'))).toBe(false)
      expect(await exists(path.join(sharedDir, 'SKILL.md'))).toBe(false)

      await plugin.uninstall({ config, contributions: [] })

      expect(await exists(path.join(sharedDir, `${AGENT_A}.agent.md`))).toBe(false)
      expect(await exists(sharedDir)).toBe(false)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given agents in the shared folder and no other owner, when fully uninstalled, then agent files, shared.md, the marker and the folder are removed', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      const installed = await installAgentsInSharedFolder(projectRoot)
      const sharedDir = sharedDirOf(projectRoot)
      expect(await exists(path.join(sharedDir, `${AGENT_A}.agent.md`))).toBe(true)
      expect(await exists(path.join(sharedDir, `${AGENT_B}.agent.md`))).toBe(true)

      await installed.uninstall()

      expect(await exists(path.join(sharedDir, `${AGENT_A}.agent.md`))).toBe(false)
      expect(await exists(path.join(sharedDir, `${AGENT_B}.agent.md`))).toBe(false)
      expect(await exists(path.join(sharedDir, 'shared.md'))).toBe(false)
      expect(await exists(path.join(sharedDir, '.owners.json'))).toBe(false)
      expect(await exists(sharedDir)).toBe(false)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given agents in the shared folder and another owner, when fully uninstalled, then the marker lists only the other owner and every shared file remains', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      const installed = await installAgentsInSharedFolder(projectRoot)
      const sharedDir = sharedDirOf(projectRoot)
      const { addSharedOwner } = await import('@specd/skills')
      await addSharedOwner(sharedDir, OTHER_OWNER)

      await installed.uninstall()

      expect(await readOwners(projectRoot)).toEqual([OTHER_OWNER])
      expect(await readFile(path.join(sharedDir, 'shared.md'), 'utf8')).toBe('shared-content')
      expect(await readFile(path.join(sharedDir, `${AGENT_A}.agent.md`), 'utf8')).toContain(
        `prompt for ${AGENT_A}`,
      )
      expect(await readFile(path.join(sharedDir, `${AGENT_B}.agent.md`), 'utf8')).toContain(
        `prompt for ${AGENT_B}`,
      )
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given agents in the shared folder and a foreign file, when fully uninstalled, then only the foreign file and the folder remain', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      const installed = await installAgentsInSharedFolder(projectRoot)
      const sharedDir = sharedDirOf(projectRoot)
      await writeFile(path.join(sharedDir, 'notes.txt'), 'user', 'utf8')

      await installed.uninstall()

      expect(await readFile(path.join(sharedDir, 'notes.txt'), 'utf8')).toBe('user')
      expect(await exists(path.join(sharedDir, 'shared.md'))).toBe(false)
      expect(await exists(path.join(sharedDir, `${AGENT_A}.agent.md`))).toBe(false)
      expect(await exists(path.join(sharedDir, `${AGENT_B}.agent.md`))).toBe(false)
      expect(await exists(path.join(sharedDir, '.owners.json'))).toBe(false)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a legacy shared folder with agent files and no marker, when fully uninstalled, then every shared file remains', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      const sharedDir = sharedDirOf(projectRoot)
      await mkdir(sharedDir, { recursive: true })
      await writeFile(path.join(sharedDir, 'shared.md'), 'legacy', 'utf8')
      await writeFile(path.join(sharedDir, `${AGENT_A}.agent.md`), 'legacy agent', 'utf8')
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })

      await plugin.uninstall({ config, contributions: [] })

      expect(await readFile(path.join(sharedDir, 'shared.md'), 'utf8')).toBe('legacy')
      expect(await readFile(path.join(sharedDir, `${AGENT_A}.agent.md`), 'utf8')).toBe(
        'legacy agent',
      )
      expect(await exists(path.join(sharedDir, '.owners.json'))).toBe(false)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})

describe('plugin-agent-copilot empty filter arrays', () => {
  it('given empty skills and agents arrays, when install runs, then everything is installed', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })

      await plugin.install({ config, contributions: [], options: { skills: [], agents: [] } })

      expect(await exists(path.join(skillDirOf(projectRoot, 'specd'), 'SKILL.md'))).toBe(true)
      expect(await exists(agentPathOf(projectRoot, AGENT_A))).toBe(true)
      expect(await exists(agentPathOf(projectRoot, AGENT_B))).toBe(true)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it.each([
    ['skills', { skills: [] }],
    ['agents', { agents: [] }],
    ['skills and agents', { skills: [], agents: [] }],
  ])(
    'given an empty %s array, when uninstall runs, then it behaves as an unfiltered full uninstall',
    async (_label, options) => {
      const projectRoot = await createTempProjectRoot()
      const config = makeMockConfig(projectRoot)
      try {
        const { create } = await import('../src/index.js')
        const plugin = await create({ config })
        await plugin.install({ config, contributions: [] })
        expect(await exists(path.join(projectRoot, ...PROMPT_FILE))).toBe(true)

        await plugin.uninstall({ config, contributions: [], options })

        expect(await exists(skillDirOf(projectRoot, 'specd'))).toBe(false)
        expect(await exists(agentPathOf(projectRoot, AGENT_A))).toBe(false)
        expect(await exists(agentPathOf(projectRoot, AGENT_B))).toBe(false)
        expect(await exists(path.join(projectRoot, ...PROMPT_FILE))).toBe(false)
        expect(await exists(path.join(sharedDirOf(projectRoot), '.owners.json'))).toBe(false)
        expect(await exists(sharedDirOf(projectRoot))).toBe(false)
      } finally {
        await rm(projectRoot, { recursive: true, force: true })
      }
    },
  )
})

describe('plugin-agent-copilot filtered uninstall by skills', () => {
  it('given installed skills and agents, when uninstall selects a skill, then the prompt block, marker, shared files and agents stay', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      await plugin.install({ config, contributions: [] })
      const sharedDir = sharedDirOf(projectRoot)
      const markerBefore = await readFile(path.join(sharedDir, '.owners.json'), 'utf8')

      await plugin.uninstall({ config, contributions: [], options: { skills: ['specd'] } })

      expect(await exists(skillDirOf(projectRoot, 'specd'))).toBe(false)
      expect(await readFile(path.join(projectRoot, ...PROMPT_FILE), 'utf8')).toContain(
        '<!-- <specd agents="copilot"> -->',
      )
      expect(await readFile(path.join(sharedDir, '.owners.json'), 'utf8')).toBe(markerBefore)
      expect(await readFile(path.join(sharedDir, 'shared.md'), 'utf8')).toBe('shared-content')
      expect(await exists(agentPathOf(projectRoot, AGENT_A))).toBe(true)
      expect(await exists(agentPathOf(projectRoot, AGENT_B))).toBe(true)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})

describe('plugin-agent-copilot legacy prompt markers', () => {
  it('given a legacy plugin marker next to user content, when fully uninstalled, then the legacy marker and base block are purged and the user content stays', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      const promptPath = path.join(projectRoot, ...PROMPT_FILE)
      await mkdir(path.dirname(promptPath), { recursive: true })
      await writeFile(
        promptPath,
        '# Project Instructions\n\n<!-- <specd-plugin:copilot> -->\nRegistered by legacy\n<!-- </specd-plugin:copilot> -->\n\n<!-- <specd agents="copilot"> -->\n# specd\n<!-- </specd> -->\n',
        'utf8',
      )
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })

      await plugin.uninstall({ config, contributions: [] })

      const content = await readFile(promptPath, 'utf8')
      expect(content).toContain('# Project Instructions')
      expect(content).not.toContain('specd-plugin:copilot')
      expect(content).not.toContain('<!-- <specd')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})
