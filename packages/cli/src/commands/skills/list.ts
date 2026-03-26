import { type Command } from 'commander'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { listSkills } from '@specd/skills'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { vlen, pad } from '../../helpers/table.js'
import { KNOWN_AGENTS } from '../../helpers/known-agents.js'
import { fileExists } from '../../helpers/file-exists.js'

/**
 * Resolves the project root by walking up from cwd looking for specd.yaml.
 * Falls back to cwd if not found.
 *
 * @returns The absolute path to the project root.
 */
async function resolveProjectRoot(): Promise<string> {
  let dir = process.cwd()
  for (let i = 0; i < 10; i++) {
    try {
      await fs.stat(path.join(dir, 'specd.yaml'))
      return dir
    } catch {
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return process.cwd()
}

/**
 * Registers the `skills list` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSkillsList(parent: Command): void {
  parent
    .command('list')
    .allowExcessArguments(false)
    .description(
      'List all available specd agent skills with their descriptions. Use --agent to check installation status for a specific agent.',
    )
    .option('--agent <id>', 'check installation status for this agent (e.g. claude)')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .action(async (opts: { agent?: string; format: string }) => {
      try {
        if (opts.agent !== undefined && !(opts.agent in KNOWN_AGENTS)) {
          cliError(`unknown agent '${opts.agent}'`, opts.format)
        }

        const skills = listSkills()
        const fmt = parseFormat(opts.format)

        if (skills.length === 0) {
          if (fmt === 'text') {
            output('no skills available', 'text')
          } else {
            output([], fmt)
          }
          return
        }

        /** Shape of a single skill row for display. */
        type SkillRow = { name: string; description: string; installed?: boolean }
        let rows: SkillRow[]

        if (opts.agent !== undefined) {
          const agentConfig = KNOWN_AGENTS[opts.agent]!
          const projectRoot = await resolveProjectRoot()
          const projectDir = agentConfig.projectDir(projectRoot)
          const globalDir = agentConfig.globalDir
          rows = await Promise.all(
            skills.map(async (s) => {
              const installed =
                (await fileExists(path.join(projectDir, `${s.name}.md`))) ||
                (await fileExists(path.join(globalDir, `${s.name}.md`)))
              return { name: s.name, description: s.description, installed }
            }),
          )
        } else {
          rows = skills.map((s) => ({ name: s.name, description: s.description }))
        }

        if (fmt === 'text') {
          const maxName = Math.max(vlen(''), ...rows.map((r) => vlen(r.name)))
          const maxDesc = Math.max(vlen(''), ...rows.map((r) => vlen(r.description)))
          const lines = rows.map((r) => {
            const namePart = '  ' + pad(r.name, maxName)
            const descPart = '  ' + pad(r.description, maxDesc)
            const installedPart =
              r.installed !== undefined ? '  ' + (r.installed ? 'installed' : 'not installed') : ''
            return namePart + descPart + installedPart
          })
          output(lines.join('\n'), 'text')
        } else {
          output(rows, fmt)
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
