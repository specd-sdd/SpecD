import { type Command } from 'commander'
import { getSkill } from '@specd/skills'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'

/**
 * Registers the `skills show` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSkillsShow(parent: Command): void {
  parent
    .command('show <name>')
    .allowExcessArguments(false)
    .description('Show the content of a skill')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .action((name: string, opts: { format: string }) => {
      try {
        const skill = getSkill(name)
        if (skill === undefined) {
          cliError(`skill '${name}' not found`, opts.format)
        }
        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          output(`--- ${name} ---\n${skill.content}`, 'text')
        } else {
          output({ name: skill.name, description: skill.description, content: skill.content }, fmt)
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
