import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_INVALIDATION_POLICY, type SpecdConfig } from '@specd/core'
import type { Skill, SkillBundle } from '@specd/skills'

/*
 * Safety and coverage tests for uninstall (managed-name validation, full uninstall of both
 * agent locations), shared-folder override, install `skipped` entries, legacy flat files and the
 * agent path reported for shared-folder agents. The filesystem is real; only the skills repository
 * is replaced.
 */

const PLUGIN_ID = 'copilot'
const RUNTIME_DIR = '.github'
const RUNTIME_AGENT_EXT: string | null = '.agent.md'
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

const LISTED: readonly Skill[] = [
  makeItem('specd', 'skill'),
  makeItem('specd-new', 'skill'),
  makeItem(AGENT_A, 'agent'),
  makeItem(AGENT_B, 'agent'),
]
const KNOWN: readonly Skill[] = [...LISTED, makeItem('empty-skill', 'skill')]

const repositoryMock = {
  list: vi.fn(async (): Promise<readonly Skill[]> => LISTED),
  get: vi.fn(
    async (name: string): Promise<Skill | undefined> => KNOWN.find((item) => item.name === name),
  ),
  getBundle: vi.fn(async (name: string, _context?: unknown): Promise<SkillBundle> => {
    const isAgent = LISTED.find((item) => item.name === name)?.kind === 'agent'
    let files: SkillBundle['files'] = []
    if (name === 'empty-skill') {
      files = []
    } else if (isAgent) {
      files = [{ filename: 'SPECD-AGENT.md', content: `prompt for ${name}` }]
    } else {
      files = [
        { filename: 'SKILL.md', content: `# ${name}` },
        { filename: 'shared.md', content: 'shared-content', shared: true },
      ]
    }
    return { name, description: name, files, install: async () => {}, uninstall: async () => {} }
  }),
  listSharedFiles: vi.fn(async () => [{ filename: 'shared.md', content: 'shared-content' }]),
}

vi.mock('@specd/skills', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@specd/skills')>()
  return {
    ...actual,
    createSkillRepository: () => repositoryMock,
  }
})

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

async function exists(file: string): Promise<boolean> {
  return stat(file).then(
    () => true,
    () => false,
  )
}

interface Fixture {
  readonly projectRoot: string
  readonly config: SpecdConfig
  readonly plugin: Awaited<ReturnType<(typeof import('../src/index.js'))['create']>>
  readonly sharedDir: string
  /** Directory holding agent files selected by a default-capability filtered uninstall. */
  readonly agentsDir: string
  readonly skillsDir: string
  agentFile(agent: string): string
}

async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), `specd-plugin-agent-${PLUGIN_ID}-safety-`))
  const config = makeMockConfig(projectRoot)
  try {
    const { create } = await import('../src/index.js')
    const plugin = await create({ config })
    const sharedDir = path.join(projectRoot, '.specd', 'config', 'skills', 'shared')
    const agentsDir =
      RUNTIME_AGENT_EXT === null ? sharedDir : path.join(projectRoot, RUNTIME_DIR, 'agents')
    await run({
      projectRoot,
      config,
      plugin,
      sharedDir,
      agentsDir,
      skillsDir: path.join(projectRoot, RUNTIME_DIR, 'skills'),
      agentFile: (agent) => path.join(agentsDir, `${agent}${RUNTIME_AGENT_EXT ?? '.agent.md'}`),
    })
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
}

async function runUninstall(
  config: SpecdConfig,
  options: Parameters<
    InstanceType<
      (typeof import('../src/application/use-cases/uninstall-skills.js'))['UninstallSkills']
    >['execute']
  >[1],
) {
  const { UninstallSkills } = await import('../src/application/use-cases/uninstall-skills.js')
  return new UninstallSkills().execute(config, options)
}

describe('plugin-agent-copilot filtered uninstall only touches specd-managed names', () => {
  it('given a user skill and a user agent with the same shape, when named in the filters, then neither is deleted and both are reported as skipped', async () => {
    await withFixture(async ({ config, plugin, skillsDir, agentsDir }) => {
      await plugin.install({ config, contributions: [] })
      const userSkillDir = path.join(skillsDir, 'my-user-skill')
      await mkdir(userSkillDir, { recursive: true })
      await writeFile(path.join(userSkillDir, 'SKILL.md'), 'mine', 'utf8')
      const userFlat = path.join(skillsDir, 'my-user-skill.md')
      await writeFile(userFlat, 'mine', 'utf8')
      const userAgent = path.join(agentsDir, `my-user-agent${RUNTIME_AGENT_EXT ?? '.agent.md'}`)
      await writeFile(userAgent, 'mine', 'utf8')

      const result = await runUninstall(config, {
        skills: ['my-user-skill'],
        agents: ['my-user-agent'],
      })

      expect(await readFile(path.join(userSkillDir, 'SKILL.md'), 'utf8')).toBe('mine')
      expect(await readFile(userFlat, 'utf8')).toBe('mine')
      expect(await readFile(userAgent, 'utf8')).toBe('mine')
      expect(result.skipped).toEqual([
        { skill: 'my-user-skill', reason: 'not a specd-managed item' },
        { skill: 'my-user-agent', reason: 'not a specd-managed item' },
      ])
    })
  })

  it('given a skill name that is an agent name and vice versa, when filtered, then nothing is deleted', async () => {
    await withFixture(async ({ config, plugin, skillsDir, agentFile }) => {
      await plugin.install({ config, contributions: [] })

      const result = await runUninstall(config, { skills: [AGENT_A], agents: ['specd'] })

      expect(await exists(agentFile(AGENT_A))).toBe(true)
      expect(await exists(path.join(skillsDir, 'specd', 'SKILL.md'))).toBe(true)
      expect(result.skipped.map((entry) => entry.skill)).toEqual([AGENT_A, 'specd'])
    })
  })

  it("given skills ['..'] and agents ['../x'], when filtered, then nothing is deleted and both are reported as invalid", async () => {
    await withFixture(async ({ projectRoot, config, plugin, skillsDir, agentsDir }) => {
      await plugin.install({ config, contributions: [] })
      const sentinel = path.join(projectRoot, RUNTIME_DIR, 'keep.txt')
      await writeFile(sentinel, 'keep', 'utf8')
      const outsideAgent = path.join(agentsDir, '..', `x${RUNTIME_AGENT_EXT ?? '.agent.md'}`)
      await writeFile(outsideAgent, 'keep', 'utf8')
      const before = await readdir(path.join(projectRoot, RUNTIME_DIR), { recursive: true })

      const result = await runUninstall(config, { skills: ['..'], agents: ['../x'] })

      expect(await readdir(path.join(projectRoot, RUNTIME_DIR), { recursive: true })).toEqual(
        before,
      )
      expect(await readFile(sentinel, 'utf8')).toBe('keep')
      expect(await readFile(outsideAgent, 'utf8')).toBe('keep')
      expect(await exists(path.join(skillsDir, 'specd', 'SKILL.md'))).toBe(true)
      expect(result.skipped).toEqual([
        { skill: '..', reason: 'invalid name' },
        { skill: '../x', reason: 'invalid name' },
      ])
    })
  })

  it.each(['.', '', 'specd/../..', 'a\\b', '/etc'])(
    'given the unsafe skill name %j, when filtered, then the skills directory is left intact',
    async (name) => {
      await withFixture(async ({ config, plugin, skillsDir }) => {
        await plugin.install({ config, contributions: [] })
        const before = await readdir(skillsDir, { recursive: true })

        const result = await runUninstall(config, { skills: [name] })

        expect(await readdir(skillsDir, { recursive: true })).toEqual(before)
        expect(result.skipped).toEqual([{ skill: name, reason: 'invalid name' }])
      })
    },
  )

  it('given managed names mixed with unknown ones, when filtered, then managed ones are removed, others kept and reported', async () => {
    await withFixture(async ({ config, plugin, skillsDir, agentFile }) => {
      await plugin.install({ config, contributions: [] })

      const result = await runUninstall(config, {
        skills: ['specd', 'ghost'],
        agents: [AGENT_A, '../x'],
      })

      expect(await exists(path.join(skillsDir, 'specd'))).toBe(false)
      expect(await exists(path.join(skillsDir, 'specd-new', 'SKILL.md'))).toBe(true)
      expect(await exists(agentFile(AGENT_A))).toBe(false)
      expect(await exists(agentFile(AGENT_B))).toBe(true)
      expect(result.skipped.map((entry) => entry.skill)).toEqual(['ghost', '../x'])
    })
  })

  it('given only managed names, when filtered through the plugin, then they are removed and nothing is skipped', async () => {
    await withFixture(async ({ config, plugin, skillsDir, agentFile }) => {
      await plugin.install({ config, contributions: [] })

      await plugin.uninstall({
        config,
        contributions: [],
        options: { skills: ['specd-new'], agents: [AGENT_B] },
      })
      const result = await runUninstall(config, { skills: ['specd'] })

      expect(await exists(path.join(skillsDir, 'specd-new'))).toBe(false)
      expect(await exists(agentFile(AGENT_B))).toBe(false)
      expect(await exists(path.join(skillsDir, 'specd'))).toBe(false)
      expect(result.skipped).toEqual([])
    })
  })

  it('given an agents-only filter with a managed agent, when uninstalled, then the agent is removed and skipped is empty', async () => {
    await withFixture(async ({ config, plugin, agentFile, skillsDir }) => {
      await plugin.install({ config, contributions: [] })

      const result = await runUninstall(config, { agents: [AGENT_A] })

      expect(await exists(agentFile(AGENT_A))).toBe(false)
      expect(await exists(agentFile(AGENT_B))).toBe(true)
      expect(await exists(path.join(skillsDir, 'specd', 'SKILL.md'))).toBe(true)
      expect(result.skipped).toEqual([])
    })
  })

  it('given a legacy flat <skill>.md next to a selected skill, when filtered uninstall runs, then both are removed and other flat files stay', async () => {
    await withFixture(async ({ config, plugin, skillsDir }) => {
      await plugin.install({ config, contributions: [] })
      await writeFile(path.join(skillsDir, 'specd.md'), 'legacy', 'utf8')
      await writeFile(path.join(skillsDir, 'specd-new.md'), 'legacy', 'utf8')

      const result = await runUninstall(config, { skills: ['specd'] })

      expect(await exists(path.join(skillsDir, 'specd'))).toBe(false)
      expect(await exists(path.join(skillsDir, 'specd.md'))).toBe(false)
      expect(await exists(path.join(skillsDir, 'specd-new.md'))).toBe(true)
      expect(result.skipped).toEqual([])
    })
  })

  it('given a full uninstall, when it runs, then it reports nothing skipped', async () => {
    await withFixture(async ({ config, plugin }) => {
      await plugin.install({ config, contributions: [] })

      expect((await runUninstall(config, undefined)).skipped).toEqual([])
    })
  })
})

describe('plugin-agent-copilot full uninstall of agent files', () => {
  it('given agents in the shared folder and in the agents directory, when fully uninstalled with capabilities lacking agents, then both locations are cleaned', async () => {
    await withFixture(async ({ projectRoot, config, plugin, sharedDir, agentFile }) => {
      await plugin.install({
        config,
        contributions: [],
        options: { capabilities: ['frontmatter'] },
      })
      await plugin.install({ config, contributions: [] })
      expect(await exists(path.join(sharedDir, `${AGENT_A}.agent.md`))).toBe(true)
      expect(await exists(agentFile(AGENT_A))).toBe(true)

      await plugin.uninstall({
        config,
        contributions: [],
        options: { capabilities: ['frontmatter'] },
      })

      expect(await exists(agentFile(AGENT_A))).toBe(false)
      expect(await exists(agentFile(AGENT_B))).toBe(false)
      expect(await exists(path.join(sharedDir, `${AGENT_A}.agent.md`))).toBe(false)
      expect(await exists(sharedDir)).toBe(false)
      expect(await exists(path.join(projectRoot, RUNTIME_DIR, 'skills', 'specd'))).toBe(false)
    })
  })
})

describe('plugin-agent-copilot shared folder override', () => {
  it('given variables.sharedFolder, when installing and fully uninstalling, then the custom folder is used instead of the default', async () => {
    await withFixture(async ({ projectRoot, config, plugin, sharedDir }) => {
      const variables = { sharedFolder: '.custom/shared' }
      const custom = path.join(projectRoot, '.custom', 'shared')

      await plugin.install({ config, contributions: [], options: { variables } })

      expect(await readFile(path.join(custom, 'shared.md'), 'utf8')).toBe('shared-content')
      expect(JSON.parse(await readFile(path.join(custom, '.owners.json'), 'utf8'))).toEqual({
        owners: [PLUGIN_ID],
      })
      expect(await exists(sharedDir)).toBe(false)
      expect(repositoryMock.getBundle).toHaveBeenCalledWith(
        'specd',
        expect.objectContaining({
          variables: expect.objectContaining({ sharedFolder: '.custom/shared' }),
        }),
      )

      await plugin.uninstall({ config, contributions: [], options: { variables } })

      expect(await exists(custom)).toBe(false)
    })
  })

  it('given a custom shared folder with another owner, when fully uninstalled with the same override, then the files stay and only this owner is released', async () => {
    await withFixture(async ({ projectRoot, config, plugin }) => {
      const variables = { sharedFolder: '.custom/shared' }
      const custom = path.join(projectRoot, '.custom', 'shared')
      const { addSharedOwner } = await import('@specd/skills')
      await plugin.install({ config, contributions: [], options: { variables } })
      await addSharedOwner(custom, 'someone-else')

      await plugin.uninstall({ config, contributions: [], options: { variables } })

      expect(await readFile(path.join(custom, 'shared.md'), 'utf8')).toBe('shared-content')
      expect(JSON.parse(await readFile(path.join(custom, '.owners.json'), 'utf8'))).toEqual({
        owners: ['someone-else'],
      })
    })
  })
})

describe('plugin-agent-copilot install result', () => {
  it('given unknown and empty-bundle items, when installing, then each is reported in skipped with its reason', async () => {
    await withFixture(async ({ config, plugin }) => {
      const result = await plugin.install({
        config,
        contributions: [],
        options: { skills: ['ghost', 'empty-skill', 'specd'] },
      })

      expect(result.skipped).toEqual([
        { skill: 'ghost', reason: 'item not found' },
        { skill: 'empty-skill', reason: 'bundle has no files' },
      ])
      expect(result.installed.map((entry) => entry.skill)).toEqual(['specd', AGENT_A, AGENT_B])
    })
  })

  it('given a default install, when the result is read, then skills report their directory and agents their runtime file', async () => {
    await withFixture(async ({ config, plugin, skillsDir, agentFile }) => {
      const result = await plugin.install({ config, contributions: [] })

      expect(result.installed).toEqual(
        expect.arrayContaining([
          { skill: 'specd', path: path.join(skillsDir, 'specd') },
          { skill: AGENT_A, path: agentFile(AGENT_A) },
        ]),
      )
    })
  })

  it('given capabilities without agents, when installing, then agents report the shared-folder .agent.md path', async () => {
    await withFixture(async ({ config, plugin, sharedDir }) => {
      const result = await plugin.install({
        config,
        contributions: [],
        options: { capabilities: ['frontmatter'] },
      })

      expect(result.installed).toEqual(
        expect.arrayContaining([
          { skill: AGENT_A, path: path.join(sharedDir, `${AGENT_A}.agent.md`) },
        ]),
      )
    })
  })
})

describe('plugin-agent-copilot legacy flat skill files', () => {
  it('given a legacy flat <skill>.md, when installing, then it is removed and unrelated flat files stay', async () => {
    await withFixture(async ({ config, plugin, skillsDir }) => {
      await mkdir(skillsDir, { recursive: true })
      await writeFile(path.join(skillsDir, 'specd.md'), 'legacy', 'utf8')
      await writeFile(path.join(skillsDir, 'my-notes.md'), 'mine', 'utf8')

      await plugin.install({ config, contributions: [] })

      expect(await exists(path.join(skillsDir, 'specd.md'))).toBe(false)
      expect(await exists(path.join(skillsDir, 'specd', 'SKILL.md'))).toBe(true)
      expect(await readFile(path.join(skillsDir, 'my-notes.md'), 'utf8')).toBe('mine')
    })
  })

  it('given legacy flat files left by a previous version, when fully uninstalled, then they are removed and unrelated flat files stay', async () => {
    await withFixture(async ({ config, plugin, skillsDir }) => {
      await plugin.install({ config, contributions: [] })
      await writeFile(path.join(skillsDir, 'specd.md'), 'legacy', 'utf8')
      await writeFile(path.join(skillsDir, 'specd-new.md'), 'legacy', 'utf8')
      await writeFile(path.join(skillsDir, 'my-notes.md'), 'mine', 'utf8')

      await plugin.uninstall({ config, contributions: [] })

      expect(await exists(path.join(skillsDir, 'specd.md'))).toBe(false)
      expect(await exists(path.join(skillsDir, 'specd-new.md'))).toBe(false)
      expect(await readFile(path.join(skillsDir, 'my-notes.md'), 'utf8')).toBe('mine')
    })
  })
})
