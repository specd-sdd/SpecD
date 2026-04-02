import { type Command } from 'commander'
import { resolve } from 'node:path'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { cliError, handleError } from '../../handle-error.js'
import { type Schema } from '@specd/core'

/**
 * Serializes a resolved Schema entity to a plain object for JSON output.
 *
 * @param schema - The resolved Schema entity
 * @param mode - How the schema was resolved
 * @param includeTemplates - Whether to resolve template content
 * @returns A plain object suitable for JSON serialization
 */
function serializeSchema(
  schema: Schema,
  mode: string,
  includeTemplates: boolean,
): Record<string, unknown> {
  return {
    schema: {
      name: schema.name(),
      version: schema.version(),
      kind: schema.kind(),
      ...(schema.extendsRef() !== undefined ? { extends: schema.extendsRef() } : {}),
    },
    mode,
    plugins: [] as string[],
    artifacts: schema.artifacts().map((a) => ({
      id: a.id,
      scope: a.scope,
      optional: a.optional,
      requires: [...a.requires],
      format: a.format ?? null,
      delta: a.delta,
      description: a.description ?? null,
      output: a.output,
      template: includeTemplates ? (a.template ?? null) : (a.templateRef ?? null),
      instruction: a.instruction ?? null,
      deltaInstruction: a.deltaInstruction ?? null,
      rules: a.rules
        ? {
            pre: a.rules.pre.map((r) => ({ id: r.id, instruction: r.instruction })),
            post: a.rules.post.map((r) => ({ id: r.id, instruction: r.instruction })),
          }
        : null,
      validations: a.validations.length > 0 ? a.validations : null,
      deltaValidations: a.deltaValidations.length > 0 ? a.deltaValidations : null,
      preHashCleanup: a.preHashCleanup.length > 0 ? a.preHashCleanup : null,
      taskCompletionCheck: a.taskCompletionCheck ?? null,
    })),
    workflow: schema.workflow().map((s) => ({
      step: s.step,
      requires: [...s.requires],
      requiresTaskCompletion: [...s.requiresTaskCompletion],
      hooks: {
        pre: s.hooks.pre.map((h) =>
          h.type === 'run'
            ? { id: h.id, type: h.type, command: h.command }
            : h.type === 'instruction'
              ? { id: h.id, type: h.type, text: h.text }
              : { id: h.id, type: h.type, externalType: h.externalType, config: h.config },
        ),
        post: s.hooks.post.map((h) =>
          h.type === 'run'
            ? { id: h.id, type: h.type, command: h.command }
            : h.type === 'instruction'
              ? { id: h.id, type: h.type, text: h.text }
              : { id: h.id, type: h.type, externalType: h.externalType, config: h.config },
        ),
      },
    })),
    metadataExtraction: schema.metadataExtraction() ?? null,
  }
}

/**
 * Formats a resolved Schema entity as human-readable text.
 *
 * @param schema - The resolved Schema entity
 * @param mode - How the schema was resolved
 * @param includeTemplates - Whether to resolve template content
 * @returns A formatted text string
 */
function formatSchemaText(schema: Schema, mode: string, includeTemplates: boolean): string {
  const lines: string[] = []

  // Header
  lines.push(`schema: ${schema.name()}  version: ${schema.version()}  kind: ${schema.kind()}`)
  if (schema.extendsRef() !== undefined) {
    lines.push(`extends: ${schema.extendsRef()}`)
  }
  if (mode === 'project') {
    // Plugins line — currently no plugin tracking in Schema entity
  }

  // Artifacts
  lines.push('')
  lines.push('artifacts:')
  for (const a of schema.artifacts()) {
    const label = a.optional ? 'optional' : 'required'
    const reqStr = a.requires.length > 0 ? `  requires=[${a.requires.join(',')}]` : ''
    const outStr = `  output=${a.output}`
    const descStr = a.description !== undefined ? `  [${a.description}]` : ''
    lines.push(`  ${a.id}  ${a.scope}  ${label}${reqStr}${outStr}${descStr}`)

    // Template
    const templateVal = includeTemplates ? a.template : a.templateRef
    if (templateVal !== undefined) {
      if (includeTemplates) {
        const tplLines = templateVal.split('\n')
        lines.push(`    template: |`)
        for (const tl of tplLines.slice(0, 5)) {
          lines.push(`      ${tl}`)
        }
        if (tplLines.length > 5) lines.push(`      (+${tplLines.length - 5} more lines)`)
      } else {
        lines.push(`    template: ${templateVal}`)
      }
    }

    // Instruction
    if (a.instruction !== undefined) {
      const instrLines = a.instruction.split('\n')
      const firstLine = instrLines[0] ?? ''
      const hasMore = instrLines.length > 1
      const truncated = firstLine.length > 80 ? firstLine.slice(0, 77) : firstLine
      const suffix = hasMore ? `... (+${instrLines.length - 1} more lines)` : ''
      lines.push(`    instruction: ${truncated}${suffix}`)
    }

    // Delta instruction
    if (a.deltaInstruction !== undefined) {
      const diLines = a.deltaInstruction.split('\n')
      const firstLine = diLines[0] ?? ''
      const hasMore = diLines.length > 1
      const truncated = firstLine.length > 80 ? firstLine.slice(0, 77) : firstLine
      const suffix = hasMore ? `... (+${diLines.length - 1} more lines)` : ''
      lines.push(`    deltaInstruction: ${truncated}${suffix}`)
    }

    // Rules
    if (a.rules) {
      const preIds = a.rules.pre.map((r) => r.id).join(', ')
      const postIds = a.rules.post.map((r) => r.id).join(', ')
      lines.push(`    rules.pre: ${preIds || '(none)'}`)
      lines.push(`    rules.post: ${postIds || '(none)'}`)
    }

    // Validations
    if (a.validations.length > 0) {
      lines.push(`    validations: ${a.validations.length} rules`)
    }
    if (a.deltaValidations.length > 0) {
      lines.push(`    deltaValidations: ${a.deltaValidations.length} rules`)
    }

    // PreHashCleanup
    if (a.preHashCleanup.length > 0) {
      lines.push(`    preHashCleanup: ${a.preHashCleanup.length} rules`)
    }

    // Task completion check
    if (a.taskCompletionCheck !== undefined) {
      lines.push(`    taskCompletionCheck: configured`)
    }
  }

  // Workflow
  lines.push('')
  lines.push('workflow:')
  for (const s of schema.workflow()) {
    const reqStr = `requires=[${s.requires.join(',')}]`
    lines.push(`  ${s.step}  ${reqStr}`)

    if (s.requiresTaskCompletion.length > 0) {
      lines.push(`    requiresTaskCompletion: [${s.requiresTaskCompletion.join(',')}]`)
    }

    if (s.hooks.pre.length > 0) {
      lines.push(`    hooks.pre: ${s.hooks.pre.map((h) => h.id).join(', ')}`)
    }
    if (s.hooks.post.length > 0) {
      lines.push(`    hooks.post: ${s.hooks.post.map((h) => h.id).join(', ')}`)
    }
  }

  // Metadata extraction
  const me = schema.metadataExtraction()
  if (me !== undefined) {
    lines.push('')
    lines.push('metadataExtraction:')
    const fields = ['title', 'description', 'dependsOn', 'keywords'] as const
    for (const f of fields) {
      const entry = me[f]
      if (entry !== undefined) {
        lines.push(`  ${f}: ${entry.artifact}`)
      }
    }
    const arrayFields = ['context', 'rules', 'constraints', 'scenarios'] as const
    for (const f of arrayFields) {
      const entries = me[f]
      if (entries !== undefined && entries.length > 0) {
        lines.push(`  ${f}: ${entries.length} extractors`)
      }
    }
  }

  return lines.join('\n')
}

/**
 * Registers the `schema show` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSchemaShow(parent: Command): void {
  parent
    .command('show [ref]')
    .allowExcessArguments(false)
    .description(
      'Display the full definition of a schema, including all artifact types, fields, and extraction rules.',
    )
    .option('--file <path>', 'show a schema from a file')
    .option('--raw', 'show raw schema without resolving extends, plugins, or overrides')
    .option('--templates', 'resolve template references and show file content')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    schema: { name: string, version: number, kind: string, extends?: string }
    mode: "project" | "ref" | "file"
    plugins: string[]
    artifacts: Array<{ id, scope, optional, requires, format, delta, description, output, template, instruction, rules, validations, ... }>
    workflow: Array<{ step, requires, requiresTaskCompletion, hooks }>
    metadataExtraction: object | null
  }

  With --raw: outputs SchemaYamlData directly (no mode/plugins envelope)
`,
    )
    .action(
      async (
        ref: string | undefined,
        opts: {
          file?: string
          raw?: boolean
          templates?: boolean
          format: string
          config?: string
        },
      ) => {
        if (ref !== undefined && opts.file !== undefined) {
          cliError('[ref] and --file are mutually exclusive', opts.format)
        }

        try {
          const { kernel } = await resolveCliContext({ configPath: opts.config })

          const input =
            ref !== undefined
              ? { mode: 'ref' as const, ref }
              : opts.file !== undefined
                ? { mode: 'file' as const, filePath: resolve(opts.file) }
                : undefined

          const mode = ref !== undefined ? 'ref' : opts.file !== undefined ? 'file' : 'project'
          const includeTemplates = opts.templates ?? false

          const result = await kernel.specs.getActiveSchema.execute(input, {
            ...(opts.raw !== undefined ? { raw: opts.raw } : {}),
            resolveTemplates: includeTemplates,
          })

          const fmt = parseFormat(opts.format)

          if (result.raw) {
            // Raw mode — output SchemaYamlData directly
            if (fmt === 'text') {
              const data = result.data
              const lines: string[] = []
              lines.push(`schema: ${data.name}  version: ${data.version}  kind: ${data.kind}`)
              if (data.extends !== undefined) {
                lines.push(`extends: ${data.extends}`)
              }
              if (data.description !== undefined) {
                lines.push(`description: ${data.description}`)
              }
              lines.push('')
              lines.push('(raw — unresolved)')
              output(lines.join('\n'), 'text')
            } else {
              const data = { ...result.data } as Record<string, unknown>
              if (includeTemplates && result.templates.size > 0) {
                const artifacts = data['artifacts'] as Array<Record<string, unknown>> | undefined
                if (artifacts) {
                  for (const a of artifacts) {
                    const tRef = a['template'] as string | undefined
                    if (tRef !== undefined) {
                      const content = result.templates.get(tRef)
                      if (content !== undefined) {
                        a['template'] = content
                      }
                    }
                  }
                }
              }
              output(data, fmt)
            }
          } else {
            // Resolved mode — full schema output
            if (fmt === 'text') {
              output(formatSchemaText(result.schema, mode, includeTemplates), 'text')
            } else {
              output(serializeSchema(result.schema, mode, includeTemplates), fmt)
            }
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}
