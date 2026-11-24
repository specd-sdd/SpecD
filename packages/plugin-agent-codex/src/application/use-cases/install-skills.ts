import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SpecdConfig } from '@specd/core'
import {
  addSharedOwner,
  createSkillRepository,
  injectSpecdBlock,
  renderBaseAgentInstruction,
  ResolveBundle,
} from '@specd/skills'
import type {
  AgentInstallOptions,
  AgentInstallResult,
  TemplateVariable,
} from '@specd/plugin-manager'
import type { Frontmatter } from '../../domain/types/frontmatter.js'
import { skillFrontmatter, agentFrontmatter } from '../../domain/frontmatter/index.js'
import { resolveSharedFolder } from '@specd/skills'

/**
 * Installs selected skills into Codex's project-local skills directory.
 */
export class InstallSkills {
  /**
   * Installs one or more skills for Codex.
   *
   * @param config - Project configuration.
   * @param options - Install options.
   * @returns Install summary.
   */
  async execute(config: SpecdConfig, options?: AgentInstallOptions): Promise<AgentInstallResult> {
    const repository = createSkillRepository()
    const availableItems = await repository.list()

    const requestedSkills =
      options?.skills !== undefined && options.skills.length > 0
        ? options.skills
        : availableItems.filter((s) => s.kind === 'skill').map((skill) => skill.name)

    const requestedAgents =
      options?.agents !== undefined && options.agents.length > 0
        ? options.agents
        : availableItems.filter((s) => s.kind === 'agent').map((agent) => agent.name)

    const requestedNames = [...requestedSkills, ...requestedAgents]

    const skillsTargetDir = path.join(config.projectRoot, '.codex', 'skills')
    const resolvedSharedFolder = resolveSharedFolder(
      config.projectRoot,
      config.configPath,
      typeof options?.variables?.['sharedFolder'] === 'string'
        ? options.variables['sharedFolder']
        : undefined,
    )
    const sharedDir = resolvedSharedFolder.absolutePath
    const capabilities = options?.capabilities ?? ['mcp', 'agents', 'frontmatter']
    const supportsAgents = capabilities.includes('agents')
    const agentsTargetDir = supportsAgents
      ? path.join(config.projectRoot, '.codex', 'agents')
      : sharedDir

    await mkdir(skillsTargetDir, { recursive: true })
    if (supportsAgents) {
      await mkdir(agentsTargetDir, { recursive: true })
    }

    const installed: Array<{ skill: string; path: string }> = []
    const skipped: Array<{ skill: string; reason: string }> = []
    let ownerRegistered = false

    for (const name of requestedNames) {
      const item = await repository.get(name)
      if (item === undefined) {
        skipped.push({ skill: name, reason: 'item not found' })
        continue
      }

      const resolveBundle = new ResolveBundle(repository)
      const { bundle } = await resolveBundle.execute({
        name,
        config,
        context: {
          variables: {
            ...(options?.variables ?? {}),
            // Frontmatter only for standard skills
            ...(item.kind === 'skill'
              ? {
                  frontmatter: toTemplateVariables(
                    skillFrontmatter[name] ??
                      ({ name, description: item.description } satisfies Frontmatter),
                  ),
                }
              : {}),
          },
          capabilities,
        },
      })
      if (bundle.files.length === 0) {
        skipped.push({ skill: name, reason: 'bundle has no files' })
        continue
      }

      let itemTargetDir: string
      if (item.kind === 'skill') {
        itemTargetDir = path.join(skillsTargetDir, name)
        const legacyFile = path.join(skillsTargetDir, `${name}.md`)
        await mkdir(itemTargetDir, { recursive: true })
        await rm(legacyFile, { force: true })
      } else {
        itemTargetDir = agentsTargetDir
      }

      for (const file of bundle.files) {
        const isAgentInAgentsDir = item.kind === 'agent' && !file.shared
        const baseDir = file.shared === true ? sharedDir : itemTargetDir

        let finalFilename = file.filename
        let content = file.content

        if (isAgentInAgentsDir && supportsAgents) {
          finalFilename = `${name}.toml`

          const metadata =
            agentFrontmatter[name] ??
            ({ name, description: item.description } satisfies Frontmatter)
          const tomlLines = [
            `name = ${escapeTomlBasicString(metadata.name ?? name)}`,
            `description = ${escapeTomlBasicString(metadata.description ?? item.description)}`,
            'developer_instructions = """',
            escapeTomlBasicMultiline(content),
            '"""',
          ]
          content = tomlLines.join('\n')
        } else if (isAgentInAgentsDir) {
          finalFilename = `${name}.agent.md`
        }

        const outputPath = path.join(baseDir, finalFilename)
        if ((file.shared === true || baseDir === sharedDir) && !ownerRegistered) {
          // Register ownership before the first shared write so a partial failure still leaves the marker.
          await addSharedOwner(sharedDir, 'codex')
          ownerRegistered = true
        }
        await mkdir(path.dirname(outputPath), { recursive: true })
        await writeFile(outputPath, content, 'utf8')
      }

      installed.push({
        skill: name,
        path:
          item.kind === 'skill'
            ? path.join(skillsTargetDir, name)
            : path.join(agentsTargetDir, supportsAgents ? `${name}.toml` : `${name}.agent.md`),
      })
    }

    // Inject prompt block into AGENTS.md with registered plugin tag
    const agentsMdPath = path.join(config.projectRoot, 'AGENTS.md')
    const prompt = await renderBaseAgentInstruction()
    await injectSpecdBlock(agentsMdPath, prompt, 'codex')

    return { installed, skipped }
  }
}

/**
 * Converts plugin frontmatter data into recursive template variables.
 *
 * @param frontmatter - Runtime-specific frontmatter object.
 * @returns Recursive template variable map.
 */
function toTemplateVariables(frontmatter: Frontmatter): Readonly<Record<string, TemplateVariable>> {
  const entries = Object.entries(frontmatter)
    .map(([key, value]) => [key, normalizeTemplateVariable(value)] as const)
    .filter((entry): entry is readonly [string, TemplateVariable] => entry[1] !== undefined)

  return Object.fromEntries(entries)
}

/**
 * Normalizes a runtime value into a template-variable-compatible shape.
 *
 * @param value - Runtime metadata value.
 * @returns Recursive template variable, or `undefined` when absent.
 */
function normalizeTemplateVariable(value: unknown): TemplateVariable | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeTemplateVariable(entry))
      .filter((entry): entry is TemplateVariable => entry !== undefined)
  }
  if (typeof value === 'object' && value !== null) {
    const nestedEntries = Object.entries(value)
      .map(([key, entry]) => [key, normalizeTemplateVariable(entry)] as const)
      .filter((entry): entry is readonly [string, TemplateVariable] => entry[1] !== undefined)
    return Object.fromEntries(nestedEntries)
  }
  if (typeof value === 'bigint') {
    return value.toString()
  }
  if (typeof value === 'symbol') {
    return value.description ?? 'symbol'
  }
  if (typeof value === 'function') {
    return value.name.length > 0 ? value.name : 'function'
  }
  return undefined
}

/**
 * Escapes a string for a TOML multi-line basic string.
 *
 * Backslashes are escaped before `"""` so a prompt can round-trip. Every
 * control character (U+0000-U+001F and U+007F) except newline and tab is
 * escaped, because TOML forbids them raw inside basic strings.
 *
 * @param value - Raw instruction text
 * @returns Text safe to place between `"""` delimiters
 */
function escapeTomlBasicMultiline(value: string): string {
  let out = ''
  for (const char of value.replaceAll('\\', '\\\\').replaceAll('"""', '\\"\\"\\"')) {
    out += char === '\n' || char === '\t' ? char : escapeControlCharacter(char)
  }
  return out.trim()
}

/**
 * Escapes a control character as a TOML escape sequence.
 *
 * Uses the short escapes TOML defines (`\b \t \n \f \r`) and `\uXXXX` for
 * the rest of U+0000-U+001F and U+007F. Other characters are returned as-is.
 *
 * @param char - Single character
 * @returns The escape sequence, or the character itself when not a control character
 */
function escapeControlCharacter(char: string): string {
  switch (char) {
    case '\b':
      return '\\b'
    case '\t':
      return '\\t'
    case '\n':
      return '\\n'
    case '\f':
      return '\\f'
    case '\r':
      return '\\r'
    default: {
      const code = char.codePointAt(0) ?? 0
      return code < 0x20 || code === 0x7f
        ? `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`
        : char
    }
  }
}

/**
 * Renders a value as a single-line TOML basic string, including the quotes.
 *
 * Escapes backslash, double quote and control characters using only the
 * escapes TOML defines (`\b \t \n \f \r \" \\` and `\uXXXX`).
 *
 * @param value - Raw string value
 * @returns A quoted, TOML-valid basic string
 */
export function escapeTomlBasicString(value: string): string {
  let out = '"'
  for (const char of value) {
    if (char === '\\') out += '\\\\'
    else if (char === '"') out += '\\"'
    else out += escapeControlCharacter(char)
  }
  return `${out}"`
}
