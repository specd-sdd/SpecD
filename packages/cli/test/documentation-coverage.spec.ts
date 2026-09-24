import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createProgram } from '../src/program.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')
const docsCliDir = path.join(repoRoot, 'docs/cli')
const guideCliFile = path.join(repoRoot, 'docs/guide/cli.md')
const indexCliFile = path.join(repoRoot, 'docs/cli/index.md')

/**
 * Resolves the documentation file for a given command name or its aliases.
 *
 * @param names - Command name and aliases (e.g. ['archives', 'archive'])
 * @returns Path to the markdown documentation file or null
 */
function resolveDocFile(names: string[]): string | null {
  for (const name of names) {
    const candidate = path.join(docsCliDir, `${name}.md`)
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  // Handle root shortcuts like 'init' -> 'project-init.md' or 'project.md'
  if (names.includes('init')) {
    const projectInit = path.join(docsCliDir, 'project-init.md')
    if (fs.existsSync(projectInit)) return projectInit
    const project = path.join(docsCliDir, 'project.md')
    if (fs.existsSync(project)) return project
  }

  return null
}

describe('CLI Documentation Coverage (dynamic introspection)', () => {
  const program = createProgram()
  const topLevelCommands = program.commands

  it('registers top-level command families in the CLI program', () => {
    expect(topLevelCommands.length).toBeGreaterThan(0)
  })

  // 1. Check that every command family has a dedicated markdown reference in docs/cli/<name>.md
  describe('Dedicated docs/cli/<command>.md files', () => {
    for (const cmd of topLevelCommands) {
      const names = [cmd.name(), ...cmd.aliases()]
      const primaryName = cmd.name()

      it(`has a dedicated reference doc for 'specd ${primaryName}' (or aliases: ${names.join(', ')})`, () => {
        const docFile = resolveDocFile(names)
        expect(
          docFile !== null,
          `Expected documentation file for command 'specd ${primaryName}' in '${docsCliDir}' to exist.`,
        ).toBe(true)
      })

      it(`documents all subcommands of 'specd ${primaryName}'`, () => {
        const docFile = resolveDocFile(names)
        if (!docFile) return

        const content = fs.readFileSync(docFile, 'utf-8')
        const subcommands = cmd.commands

        for (const subCmd of subcommands) {
          const subName = subCmd.name()
          // Check that the subcommand name appears in the doc (word boundary match)
          const pattern = new RegExp(`\\b${subName}\\b`, 'i')
          const matches = pattern.test(content)

          expect(
            matches,
            `Subcommand '${primaryName} ${subName}' is registered in the CLI but was not found in '${path.basename(docFile)}'.`,
          ).toBe(true)
        }
      })
    }
  })

  // 2. Check that docs/guide/cli.md documents every top-level command family and its primary commands
  describe('Guide Overview in docs/guide/cli.md', () => {
    it('covers all top-level command families in docs/guide/cli.md', () => {
      expect(fs.existsSync(guideCliFile)).toBe(true)
      const guideContent = fs.readFileSync(guideCliFile, 'utf-8')

      for (const cmd of topLevelCommands) {
        const names = [cmd.name(), ...cmd.aliases()]
        // If command is a root shortcut like 'init', it's documented under project init
        const patternStr = names.map((n) => `specd\\s+${n}\\b`).join('|')
        const pattern = new RegExp(patternStr, 'i')

        expect(
          pattern.test(guideContent),
          `Command family 'specd ${cmd.name()}' (aliases: ${names.join(', ')}) is registered in the CLI but is not documented in 'docs/guide/cli.md'.`,
        ).toBe(true)
      }
    })
  })

  // 3. Check that docs/cli/index.md lists every top-level command family
  describe('CLI Index in docs/cli/index.md', () => {
    it('lists all top-level command families in docs/cli/index.md', () => {
      expect(fs.existsSync(indexCliFile)).toBe(true)
      const indexContent = fs.readFileSync(indexCliFile, 'utf-8')

      for (const cmd of topLevelCommands) {
        const names = [cmd.name(), ...cmd.aliases()]
        const patternStr = names.map((n) => `specd\\s+${n}\\b`).join('|')
        const pattern = new RegExp(patternStr, 'i')

        expect(
          pattern.test(indexContent),
          `Command family 'specd ${cmd.name()}' (aliases: ${names.join(', ')}) is registered in the CLI but is not listed in 'docs/cli/index.md'.`,
        ).toBe(true)
      }
    })
  })
})
