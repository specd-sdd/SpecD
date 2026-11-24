import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { SpecdConfig } from '@specd/core'
import type { Skill, SkillBundle } from '@specd/skills'

const AGENT = 'tool-agent'

vi.mock('../src/domain/frontmatter/index.js', () => ({
  skillFrontmatter: {},
  agentFrontmatter: {
    'tool-agent': {
      name: 'tool-agent',
      description: 'tool agent',
      'allowed-tools': 'Bash(git a, b), Read , Write',
    },
    'array-agent': {
      name: 'array-agent',
      description: 'array agent',
      'allowed-tools': [' Read ', 'Bash(x, y)'],
    },
  },
}))

function agentItem(name: string): Skill {
  return {
    name,
    description: name,
    templates: [],
    kind: 'agent',
    metadata: {
      kind: 'agent',
      supportedCapabilities: [],
      requiredCapabilities: [],
      requiredSharedTemplates: [],
    },
  }
}

const repositoryMock = {
  list: vi.fn(async (): Promise<readonly Skill[]> => [agentItem(AGENT), agentItem('array-agent')]),
  get: vi.fn(async (name: string): Promise<Skill | undefined> => agentItem(name)),
  getBundle: vi.fn(
    async (name: string, _context?: unknown): Promise<SkillBundle> => ({
      name,
      description: name,
      files: [{ filename: 'SPECD-AGENT.md', content: 'prompt' }],
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

describe('plugin-agent-copilot agent tool list', () => {
  it('given allowed-tools with a comma inside parentheses, when installing, then the tools list splits on top-level commas only', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'specd-plugin-agent-copilot-tools-'))
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

      const frontmatterOf = (name: string): unknown => {
        const call = repositoryMock.getBundle.mock.calls.find(([bundleName]) => bundleName === name)
        return (call?.[1] as { variables?: { frontmatter?: unknown } } | undefined)?.variables
          ?.frontmatter
      }
      expect(frontmatterOf(AGENT)).toEqual({
        name: 'tool-agent',
        description: 'tool agent',
        tools: ['Bash(git a, b)', 'Read', 'Write'],
      })
      expect(frontmatterOf('array-agent')).toEqual({
        name: 'array-agent',
        description: 'array agent',
        tools: ['Read', 'Bash(x, y)'],
      })
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})
