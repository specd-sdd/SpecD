import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_INVALIDATION_POLICY, type SpecdConfig } from '@specd/core'
import type { Skill, SkillBundle } from '@specd/skills'

const AGENT_A = 'specd-project-context-optimizer'
const AGENT_B = 'specd-spec-context-optimizer'

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
  return {
    ...actual,
    createSkillRepository: () => repositoryMock,
    removeSharedOwner: vi.fn(actual.removeSharedOwner),
  }
})

async function createTempProjectRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'specd-plugin-agent-standard-lifecycle-'))
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

async function exists(file: string): Promise<boolean> {
  return readFile(file, 'utf8').then(
    () => true,
    () => false,
  )
}

async function removeSharedOwnerCalls(): Promise<number> {
  const skills = await import('@specd/skills')
  return vi.mocked(skills.removeSharedOwner).mock.calls.length
}

async function resetRemoveSharedOwnerCalls(): Promise<void> {
  const skills = await import('@specd/skills')
  vi.mocked(skills.removeSharedOwner).mockClear()
}

describe('plugin-agent-standard agent and shared-folder lifecycle', () => {
  it('given agents that live in the shared folder, when uninstall selects one agent, then only that agent file is removed and removeSharedOwner is not called', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      await plugin.install({
        config,
        contributions: [],
        options: { skills: ['specd'], agents: [AGENT_A, AGENT_B] },
      })
      const sharedDir = sharedDirOf(projectRoot)
      const selected = path.join(sharedDir, `${AGENT_A}.agent.md`)
      const other = path.join(sharedDir, `${AGENT_B}.agent.md`)
      expect(await exists(selected)).toBe(true)
      expect(await exists(other)).toBe(true)
      const markerBefore = await readFile(path.join(sharedDir, '.owners.json'), 'utf8')
      const promptPath = path.join(projectRoot, 'AGENTS.md')
      await resetRemoveSharedOwnerCalls()

      await plugin.uninstall({
        config,
        contributions: [],
        options: { agents: [AGENT_A] },
      })

      expect(await exists(selected)).toBe(false)
      expect(await readFile(other, 'utf8')).toContain(`prompt for ${AGENT_B}`)
      expect(await readFile(path.join(sharedDir, 'shared.md'), 'utf8')).toBe('shared-content')
      expect(await readFile(path.join(sharedDir, '.owners.json'), 'utf8')).toBe(markerBefore)
      expect(await readFile(promptPath, 'utf8')).toContain('<!-- <specd agents="standard"> -->')
      expect(await removeSharedOwnerCalls()).toBe(0)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a filtered install, when it writes shared files, then standard is recorded as an owner', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      await plugin.install({ config, contributions: [], options: { skills: ['specd'] } })
      const owners = JSON.parse(
        await readFile(path.join(sharedDirOf(projectRoot), '.owners.json'), 'utf8'),
      ) as { owners: string[] }
      expect(owners.owners).toEqual(['standard'])
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given standard and another owner, when standard is fully uninstalled, then shared files and the marker remain', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      const { addSharedOwner } = await import('@specd/skills')
      const { create } = await import('../src/index.js')
      const plugin = await create({ config })
      await plugin.install({ config, contributions: [], options: { skills: ['specd'] } })
      const sharedDir = sharedDirOf(projectRoot)
      await addSharedOwner(sharedDir, 'copilot')
      await plugin.uninstall({ config, contributions: [] })
      expect(await readFile(path.join(sharedDir, 'shared.md'), 'utf8')).toBe('shared-content')
      const owners = JSON.parse(await readFile(path.join(sharedDir, '.owners.json'), 'utf8')) as {
        owners: string[]
      }
      expect(owners.owners).toEqual(['copilot'])
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})
