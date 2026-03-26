import { type Command } from 'commander'
import { getSkill, listSkills } from '@specd/skills'
import { createVcsAdapter } from '@specd/core'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { KNOWN_AGENTS } from '../../helpers/known-agents.js'

/**
 * Registers the `skills install` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSkillsInstall(parent: Command): void {
  parent
    .command('install <name>')
    .allowExcessArguments(false)
    .description(
      'Install one or all specd agent skills into the configured location for the target AI agent (e.g. Claude, Copilot, Codex).',
    )
    .option('--agent <id>', 'agent to install for (e.g. claude)', 'claude')
    .option('--global', 'install globally to the user-level commands directory')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (
        skillName: string,
        opts: { agent: string; global?: boolean; format: string; config?: string },
      ) => {
        try {
          if (!(opts.agent in KNOWN_AGENTS)) {
            cliError(`unknown agent '${opts.agent}'`, opts.format)
          }

          const agentConfig = KNOWN_AGENTS[opts.agent]!
          const fmt = parseFormat(opts.format)

          // Resolve skills to install
          const allSkills = listSkills()
          const skillsToInstall =
            skillName === 'all'
              ? allSkills
              : (() => {
                  const s = getSkill(skillName)
                  if (s === undefined) {
                    cliError(`skill '${skillName}' not found`, opts.format)
                  }
                  return [s]
                })()

          if (skillsToInstall.length === 0) {
            output('no skills to install', 'text')
            return
          }

          if (opts.global) {
            // Global install: write to user-level commands directory
            const globalDir = agentConfig.globalDir
            await fs.mkdir(globalDir, { recursive: true })

            const results: Array<{ name: string; path: string }> = []
            for (const skill of skillsToInstall) {
              const filePath = path.join(globalDir, `${skill.name}.md`)
              await fs.writeFile(filePath, skill.content, 'utf8')
              results.push({ name: skill.name, path: filePath })
            }

            if (fmt === 'text') {
              for (const r of results) {
                output(`installed ${r.name} → ${r.path}`, 'text')
              }
            } else {
              output(results, fmt)
            }
          } else {
            // Project-level install: check VCS, validate config, write files + record in specd.yaml
            try {
              const vcs = await createVcsAdapter()
              await vcs.rootDir()
            } catch {
              cliError(
                'not inside a VCS repository — use --global or run from inside a repo',
                opts.format,
              )
            }

            const { config, kernel } = await resolveCliContext({ configPath: opts.config })

            // Validate specd.yaml exists before writing skill files
            const configPath = path.join(config.projectRoot, 'specd.yaml')
            try {
              await fs.stat(configPath)
            } catch {
              cliError('specd.yaml not found — run specd project init first', opts.format)
            }

            const commandsDir = agentConfig.projectDir(config.projectRoot)
            await fs.mkdir(commandsDir, { recursive: true })

            const results: Array<{ name: string; path: string }> = []
            for (const skill of skillsToInstall) {
              const filePath = path.join(commandsDir, `${skill.name}.md`)
              await fs.writeFile(filePath, skill.content, 'utf8')
              results.push({ name: skill.name, path: filePath })
            }

            await kernel.project.recordSkillInstall.execute({
              configPath,
              agent: opts.agent,
              skillNames: skillsToInstall.map((s) => s.name),
            })

            if (fmt === 'text') {
              for (const r of results) {
                output(`installed ${r.name} → ${r.path}`, 'text')
              }
            } else {
              output(results, fmt)
            }
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}
