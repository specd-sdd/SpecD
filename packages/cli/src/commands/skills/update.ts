import { type Command } from 'commander'
import { getSkill } from '@specd/skills'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { KNOWN_AGENTS } from '../../helpers/known-agents.js'

/**
 * Registers the `skills update` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSkillsUpdate(parent: Command): void {
  parent
    .command('update')
    .allowExcessArguments(false)
    .description('Update installed skills from the skills registry')
    .option('--agent <id>', 'restrict update to one agent')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  Array<{ name: string, path: string, status: "updated" | "skipped", warning?: string }>
`,
    )
    .action(async (opts: { agent?: string; format: string; config?: string }) => {
      try {
        if (opts.agent !== undefined && !(opts.agent in KNOWN_AGENTS)) {
          cliError(`unknown agent '${opts.agent}'`, opts.format)
        }

        const { config, kernel } = await resolveCliContext({ configPath: opts.config })
        const fmt = parseFormat(opts.format)

        const manifest = await kernel.project.getSkillsManifest.execute({
          configPath: path.join(config.projectRoot, 'specd.yaml'),
        })

        /** Shape of an individual skill update result. */
        type SkillResult = {
          name: string
          path: string
          status: 'updated' | 'skipped'
          warning?: string
        }
        const results: SkillResult[] = []

        for (const [agentId, skillNames] of Object.entries(manifest)) {
          if (opts.agent !== undefined && agentId !== opts.agent) continue

          if (!(agentId in KNOWN_AGENTS)) {
            process.stderr.write(`warning: unknown agent '${agentId}' in manifest — skipped\n`)
            continue
          }

          const agentConfig = KNOWN_AGENTS[agentId]!
          const commandsDir = agentConfig.projectDir(config.projectRoot)
          await fs.mkdir(commandsDir, { recursive: true })

          for (const name of skillNames) {
            const skill = getSkill(name)
            if (skill === undefined) {
              process.stderr.write(`warning: skill ${name} is no longer available — skipped\n`)
              results.push({
                name,
                path: path.join(commandsDir, `${name}.md`),
                status: 'skipped',
                warning: `skill '${name}' is no longer available`,
              })
              continue
            }
            const filePath = path.join(commandsDir, `${name}.md`)
            await fs.writeFile(filePath, skill.content, 'utf8')
            results.push({ name, path: filePath, status: 'updated' })
          }
        }

        if (results.length === 0) {
          if (fmt === 'text') {
            output('no skills to update', 'text')
          } else {
            output([], fmt)
          }
          return
        }

        if (fmt === 'text') {
          for (const r of results.filter((r) => r.status === 'updated')) {
            output(`updated ${r.name} → ${r.path}`, 'text')
          }
        } else {
          output(
            results.map((r) => ({
              name: r.name,
              path: r.path,
              status: r.status,
              ...(r.warning !== undefined ? { warning: r.warning } : {}),
            })),
            fmt,
          )
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
