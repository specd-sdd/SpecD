import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SpecdConfig } from '@specd/core'
import type { PluginLoaderOptions } from '@specd/plugin-manager'

/*
 * Runs the real skills pipeline (real repository, real ResolveBundle, real
 * templates and frontmatter rendering). Nothing from @specd/skills is mocked.
 */

const SKILLS_DIR = ['.codex', 'skills']
const AGENT_FILE = ['.codex', 'agents', 'specd-project-context-optimizer.toml']

function makeConfig(projectRoot: string): SpecdConfig {
  return {
    projectRoot,
    configPath: path.join(projectRoot, '.specd', 'config'),
    schemaRef: '@specd/schema-std',
    workspaces: [],
    plugins: [],
  } as unknown as SpecdConfig
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
}

async function withInstalledProject(
  run: (projectRoot: string, uninstall: () => Promise<void>) => Promise<void>,
): Promise<void> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'specd-plugin-agent-codex-real-'))
  const config = makeConfig(projectRoot)
  try {
    const { create } = await import('../src/index.js')
    const plugin = await create({ config } as unknown as PluginLoaderOptions)
    const result = await plugin.install({ config, contributions: [] })
    expect(result.skipped).toEqual([])
    await run(projectRoot, () => plugin.uninstall({ config, contributions: [] }))
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
}

describe('plugin-agent-codex real skills pipeline', () => {
  it('given a default install, when skills are rendered, then every skill has real frontmatter and fast-track is included', async () => {
    await withInstalledProject(async (projectRoot) => {
      const installed = await readdir(path.join(projectRoot, ...SKILLS_DIR))
      expect(installed).toEqual(
        expect.arrayContaining(['specd', 'specd-fasttrack', 'specd-new', 'specd-verify']),
      )
      for (const skill of installed) {
        const content = await readFile(
          path.join(projectRoot, ...SKILLS_DIR, skill, 'SKILL.md'),
          'utf8',
        )
        expect(content).toMatch(/^---\nname: [^\n]+\ndescription: [^\n]+\n(?:[^\n]*\n)*?---\n/)
        expect(content).not.toContain('{{')
      }
      const fasttrack = await readFile(
        path.join(projectRoot, ...SKILLS_DIR, 'specd-fasttrack', 'SKILL.md'),
        'utf8',
      )
      expect(fasttrack).toContain('name: specd-fasttrack\n')
      expect(fasttrack).toContain(
        'description: "Manual-only: use only when the user explicitly invokes /specd-fasttrack.',
      )
      expect(fasttrack).not.toMatch(/disable[-_]model[-_]invocation/)
      expect(fasttrack.includes('MCP-backed project workflow')).toBe(true)
      expect(fasttrack.includes('delegate bounded investigations')).toBe(true)
    })
  })

  it('given a default install, when the agent is rendered, then its file has the runtime format', async () => {
    await withInstalledProject(async (projectRoot) => {
      const agent = await readFile(path.join(projectRoot, ...AGENT_FILE), 'utf8')
      expect(agent.startsWith('---')).toBe(false)
      expect(agent).toMatch(
        /^name = "specd-project-context-optimizer"\ndescription = "[^"\n]+"\ndeveloper_instructions = \"\"\"\n/,
      )
      expect(agent.endsWith('\n\"\"\"')).toBe(true)
    })
  })

  it('given a default install, when fully uninstalled, then no installed file remains', async () => {
    await withInstalledProject(async (projectRoot, uninstall) => {
      expect((await listFiles(projectRoot)).length).toBeGreaterThan(0)

      await uninstall()

      expect(await listFiles(projectRoot)).toEqual([])
    })
  })
})
