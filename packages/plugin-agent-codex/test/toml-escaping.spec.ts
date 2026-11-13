import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { SpecdConfig } from '@specd/core'
import type { Skill, SkillBundle } from '@specd/skills'
import { escapeTomlBasicString } from '../src/application/use-cases/install-skills.js'

const AGENT = 'specd-project-context-optimizer'

let promptOverride: string | undefined

/** Every character TOML forbids raw inside a basic string: U+0000-U+001F and U+007F. */
const CONTROL_CODES = [...Array.from({ length: 0x20 }, (_, code) => code), 0x7f]

const SHORT_ESCAPES: Readonly<Record<number, string>> = {
  0x08: '\\b',
  0x09: '\\t',
  0x0a: '\\n',
  0x0c: '\\f',
  0x0d: '\\r',
}

function expectedEscape(code: number): string {
  return SHORT_ESCAPES[code] ?? `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`
}

const repositoryMock = {
  list: vi.fn(
    async (): Promise<readonly Skill[]> => [
      {
        name: AGENT,
        description: AGENT,
        templates: [],
        kind: 'agent',
        metadata: {
          kind: 'agent',
          supportedCapabilities: [],
          requiredCapabilities: [],
          requiredSharedTemplates: [],
        },
      },
    ],
  ),
  get: vi.fn(async (name: string): Promise<Skill | undefined> => {
    const [item] = await repositoryMock.list()
    return item?.name === name ? item : undefined
  }),
  getBundle: vi.fn(
    async (name: string, _context?: unknown): Promise<SkillBundle> => ({
      name,
      description: name,
      files: [
        { filename: 'SPECD-AGENT.md', content: promptOverride ?? `before${controlText()}after` },
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

function controlText(): string {
  return CONTROL_CODES.map((code) => `<${String.fromCharCode(code)}>`).join('')
}

describe('codex TOML basic string escaping', () => {
  it.each(CONTROL_CODES)(
    'given control character U+%s, when escaped as a basic string, then no raw control character remains',
    (code) => {
      const escaped = escapeTomlBasicString(`a${String.fromCharCode(code)}b`)

      expect(escaped).toBe(`"a${expectedEscape(code)}b"`)
      expect(escaped).not.toMatch(/[\u0000-\u001f\u007f]/)
    },
  )

  it('given a backslash and a double quote, when escaped, then both are escaped', () => {
    expect(escapeTomlBasicString('a\\b"c')).toBe('"a\\\\b\\"c"')
  })

  it('given non-control unicode text, when escaped, then it is kept as is', () => {
    expect(escapeTomlBasicString('héllo ✓ 😀')).toBe('"héllo ✓ 😀"')
  })

  it('given control characters in an agent prompt, when installed, then the multi-line value holds none raw except newline and tab', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'specd-plugin-agent-codex-toml-'))
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

      await plugin.install({ config, contributions: [], options: { agents: [AGENT] } })

      const toml = await readFile(
        path.join(projectRoot, '.codex', 'agents', `${AGENT}.toml`),
        'utf8',
      )
      expect(toml).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f]/)
      for (const code of CONTROL_CODES) {
        // Newline and tab may stay raw; the escaped forms of the others must be present.
        if (code === 0x09 || code === 0x0a) continue
        expect(toml).toContain(`<${expectedEscape(code)}>`)
      }
      expect(toml.startsWith(`name = "${AGENT}"\n`)).toBe(true)
      expect(toml.endsWith('\n"""')).toBe(true)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a prompt with surrounding whitespace, when installed, then the multi-line value is trimmed', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'specd-plugin-agent-codex-trim-'))
    const config = {
      projectRoot,
      configPath: path.join(projectRoot, '.specd', 'config'),
      schemaRef: '@specd/schema-std',
      workspaces: [],
      plugins: [],
    } as unknown as SpecdConfig
    promptOverride = '\n\n  body line  \n\n'
    try {
      const { create } = await import('../src/index.js')
      const plugin = await create({ config } as never)

      await plugin.install({ config, contributions: [], options: { agents: [AGENT] } })

      const toml = await readFile(
        path.join(projectRoot, '.codex', 'agents', `${AGENT}.toml`),
        'utf8',
      )
      expect(toml.endsWith('developer_instructions = """\nbody line\n"""')).toBe(true)
    } finally {
      promptOverride = undefined
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})
