import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { SpecdConfig } from '@specd/core'
import type { Skill, SkillBundle } from '@specd/skills'

vi.mock('../src/domain/frontmatter/index.js', () => ({
  skillFrontmatter: {
    'all-keys': {
      name: 'all-keys',
      description: 'all keys',
      allowed_tools: 'Read, Write',
      argument_hint: '<x>',
      disable_model_invocation: true,
      user_invocable: false,
      when_to_use: 'when needed',
      model: 'opus',
    },
  },
  agentFrontmatter: {
    'an-agent': {
      name: 'an-agent',
      description: 'an agent',
      allowed_tools: 'Read, Write',
      model: 'sonnet',
    },
  },
}))

function item(name: string, kind: 'skill' | 'agent'): Skill {
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

const ITEMS = [item('all-keys', 'skill'), item('an-agent', 'agent')]
const repositoryMock = {
  list: vi.fn(async (): Promise<readonly Skill[]> => ITEMS),
  get: vi.fn(async (name: string) => ITEMS.find((entry) => entry.name === name)),
  getBundle: vi.fn(
    async (name: string, _context?: unknown): Promise<SkillBundle> => ({
      name,
      description: name,
      files: [{ filename: name === 'an-agent' ? 'SPECD-AGENT.md' : 'SKILL.md', content: '# x' }],
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

describe('plugin-agent-claude frontmatter key spelling', () => {
  it('given every skill key, when installing, then skills use hyphenated keys and agents keep tools and model', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'specd-plugin-agent-claude-keys-'))
    const config = {
      projectRoot,
      configPath: path.join(projectRoot, '.specd', 'config'),
      schemaRef: '@specd/schema-std',
      workspaces: [],
      plugins: [],
    } as unknown as SpecdConfig
    try {
      const { create } = await import('../src/index.js')
      const plugin = await create({ config } as never)

      await plugin.install({ config, contributions: [] })

      const frontmatterOf = (name: string): Record<string, unknown> => {
        const call = repositoryMock.getBundle.mock.calls.find(([bundleName]) => bundleName === name)
        return (
          (call?.[1] as { variables?: { frontmatter?: Record<string, unknown> } }).variables
            ?.frontmatter ?? {}
        )
      }
      expect(frontmatterOf('all-keys')).toEqual({
        name: 'all-keys',
        description: 'all keys',
        'allowed-tools': 'Read, Write',
        'argument-hint': '<x>',
        'disable-model-invocation': true,
        'user-invocable': false,
        when_to_use: 'when needed',
        model: 'opus',
      })
      expect(frontmatterOf('an-agent')).toEqual({
        name: 'an-agent',
        description: 'an agent',
        tools: 'Read, Write',
      })
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})
