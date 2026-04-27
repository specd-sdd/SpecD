import { type Command } from 'commander'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { parseSpecId } from '../../helpers/spec-path.js'

/** Validation file states emitted by `change validate`. */
type ValidationFileStatus = 'validated' | 'missing' | 'skipped'

/** Structured validation failure entry emitted by core validation. */
interface ValidateFailure {
  readonly artifactId: string
  readonly description: string
  readonly filename?: string
}

/** Structured validation note entry emitted by core validation. */
interface ValidateNote {
  readonly artifactId: string
  readonly description: string
}

/** Structured per-file validation metadata emitted by core validation. */
interface ValidationFileEntry {
  readonly artifactId: string
  readonly key: string
  readonly filename: string
  readonly status: ValidationFileStatus
}

/** Normalized validation response consumed by CLI rendering paths. */
interface ValidateResult {
  readonly passed: boolean
  readonly failures: ValidateFailure[]
  readonly notes: ValidateNote[]
  readonly files: ValidationFileEntry[]
}

/**
 * Returns true when the value is a plain object record.
 *
 * @param value - Value to test
 * @returns Whether the value is a non-null object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Normalizes unknown kernel output into a safe `ValidateResult`.
 *
 * @param value - Raw value returned by the kernel
 * @returns Normalized validation result
 */
function toValidateResult(value: unknown): ValidateResult {
  if (!isRecord(value)) {
    return { passed: false, failures: [], notes: [], files: [] }
  }

  const failures: ValidateFailure[] = Array.isArray(value['failures'])
    ? value['failures']
        .map((entry): ValidateFailure | null => {
          if (!isRecord(entry)) return null
          const artifactId = entry['artifactId']
          const description = entry['description']
          if (typeof artifactId !== 'string' || typeof description !== 'string') return null
          const filename = entry['filename']
          return typeof filename === 'string'
            ? { artifactId, description, filename }
            : { artifactId, description }
        })
        .filter((entry): entry is ValidateFailure => entry !== null)
    : []

  const notes: ValidateNote[] =
    Array.isArray(value['warnings']) || Array.isArray(value['notes'])
      ? ((value['notes'] ?? value['warnings']) as unknown[])
          .map((entry): ValidateNote | null => {
            if (!isRecord(entry)) return null
            const artifactId = entry['artifactId']
            const description = entry['description']
            if (typeof artifactId !== 'string' || typeof description !== 'string') return null
            return { artifactId, description }
          })
          .filter((entry): entry is ValidateNote => entry !== null)
      : []

  const files: ValidationFileEntry[] = Array.isArray(value['files'])
    ? value['files']
        .map((entry): ValidationFileEntry | null => {
          if (!isRecord(entry)) return null
          const artifactId = entry['artifactId']
          const key = entry['key']
          const filename = entry['filename']
          const status = entry['status']
          if (
            typeof artifactId !== 'string' ||
            typeof key !== 'string' ||
            typeof filename !== 'string'
          ) {
            return null
          }
          if (status !== 'validated' && status !== 'missing' && status !== 'skipped') {
            return null
          }
          return { artifactId, key, filename, status }
        })
        .filter((entry): entry is ValidationFileEntry => entry !== null)
    : []

  const passed = typeof value['passed'] === 'boolean' ? value['passed'] : failures.length === 0
  return { passed, failures, notes, files }
}

/**
 * Registers the `change validate` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeValidate(parent: Command): void {
  parent
    .command('validate <name> [specPath]')
    .allowExcessArguments(false)
    .description(
      'Validate artifacts in a change against their spec scenarios and the active schema, reporting any violations.',
    )
    .option('--all', 'validate all specIds in the change')
    .option('--artifact <artifactId>', 'validate only this artifact')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    passed: boolean
    failures: Array<{ artifactId: string, description: string, filename?: string }>
    notes: Array<{ artifactId: string, description: string }>
    files: Array<{ artifactId: string, key: string, filename: string, status: "validated" | "missing" | "skipped" }>
  }
`,
    )
    .action(
      async (
        name: string,
        specPath: string | undefined,
        opts: { format: string; config?: string; artifact?: string; all?: boolean },
      ) => {
        try {
          // --- Flag validation ---
          if (opts.all === true && specPath !== undefined) {
            cliError('--all and <specPath> are mutually exclusive', opts.format)
          }
          // specPath is required unless --all or --artifact targets a scope: change artifact
          if (opts.all !== true && specPath === undefined && opts.artifact === undefined) {
            cliError('either <specPath> or --all is required', opts.format)
          }

          const { config, kernel } = await resolveCliContext({
            configPath: opts.config,
          })

          // If no specPath but --artifact provided, check if it's scope: change
          let finalSpecPath: string | undefined = specPath
          if (specPath === undefined && opts.artifact !== undefined) {
            const schemaResult = await kernel.specs.getActiveSchema.execute()
            if (schemaResult.raw) {
              cliError('Cannot validate: schema resolved in raw mode', opts.format)
            }
            const schema = schemaResult.schema
            const artifactType = schema.artifacts().find((a) => a.id === opts.artifact)
            if (artifactType !== undefined && artifactType.scope === 'change') {
              // scope: change artifact - specPath is optional
              // Use first spec in change as placeholder, or let ValidateArtifacts handle it
              const change = await kernel.changes.list.execute()
              const targetChange = change.find((c) => c.name === name)
              if (targetChange !== undefined && targetChange.specIds.length > 0) {
                finalSpecPath = targetChange.specIds[0]
              }
            } else if (artifactType !== undefined && artifactType.scope === 'spec') {
              // scope: spec artifact - specPath is required
              cliError('<specPath> is required for scope: spec artifacts', opts.format)
            }
          }

          if (opts.all === true) {
            await executeBatch(kernel, name, opts)
          } else {
            await executeSingle(kernel, config, name, finalSpecPath!, opts)
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}

/**
 * Validates a single spec (existing behaviour).
 *
 * @param kernel - The wired kernel instance
 * @param config - The loaded specd configuration
 * @param name - The change name
 * @param specPath - The spec ID to validate
 * @param opts - Command options
 * @param opts.format - Output format
 * @param opts.artifact - Optional artifact ID to validate
 */
async function executeSingle(
  kernel: import('@specd/core').Kernel,
  config: import('@specd/core').SpecdConfig,
  name: string,
  specPath: string,
  opts: { format: string; artifact?: string },
): Promise<void> {
  const parsed = parseSpecId(specPath, config)
  const fullSpecPath = `${parsed.workspace}:${parsed.capabilityPath}`

  const result = toValidateResult(
    await kernel.changes.validate.execute({
      name,
      specPath: fullSpecPath,
      ...(opts.artifact !== undefined ? { artifactId: opts.artifact } : {}),
    }),
  )

  const fmt = parseFormat(opts.format)
  const passed = result.failures.length === 0

  if (fmt === 'text') {
    const fileLines = result.files.map((file) =>
      file.status === 'missing' ? `missing: ${file.filename}` : `file: ${file.filename}`,
    )
    const previewNote = `note: verify merged output with: specd change spec-preview ${name} ${fullSpecPath}`

    if (passed) {
      if (result.notes.length > 0) {
        const noteLines = result.notes.map((n) => `note: ${n.artifactId} — ${n.description}`)
        output(
          `validated ${name}/${fullSpecPath}: pass (${result.notes.length} note(s))\n${[...fileLines, ...noteLines, previewNote].join('\n')}`,
          'text',
        )
      } else {
        output(
          `validated ${name}/${fullSpecPath}: all artifacts pass\n${[...fileLines, previewNote].join('\n')}`,
          'text',
        )
      }
    } else {
      const errorLines = result.failures.map((f) => `  error: ${f.artifactId} — ${f.description}`)
      const noteLines = result.notes.map((n) => `  note: ${n.artifactId} — ${n.description}`)
      const allLines = [...fileLines, ...errorLines, ...noteLines, previewNote]
      output(`validation failed ${name}/${fullSpecPath}:\n${allLines.join('\n')}`, 'text')
      process.exitCode = 1
    }
  } else {
    output(
      {
        passed,
        failures: result.failures,
        notes: result.notes,
        files: result.files,
      },
      fmt,
    )
    if (!passed) {
      process.exitCode = 1
    }
  }
}

/**
 * Validates all specIds in the change.
 *
 * @param kernel - The wired kernel instance
 * @param name - The change name
 * @param opts - Command options
 * @param opts.format - Output format
 * @param opts.artifact - Optional artifact ID to validate per spec
 */
async function executeBatch(
  kernel: import('@specd/core').Kernel,
  name: string,
  opts: { format: string; artifact?: string },
): Promise<void> {
  const { change } = await kernel.changes.status.execute({ name })
  const specIds = change.specIds

  if (specIds.length === 0) {
    const fmt = parseFormat(opts.format)
    if (fmt === 'text') {
      output(`${name}: no specIds declared`, 'text')
    } else {
      output({ passed: true, total: 0, results: [] }, fmt)
    }
    return
  }

  const results: Array<{
    spec: string
    passed: boolean
    failures: ValidateFailure[]
    notes: ValidateNote[]
    files: readonly ValidationFileEntry[]
  }> = []
  let totalPassed = 0

  for (const specId of specIds) {
    const result = toValidateResult(
      await kernel.changes.validate.execute({
        name,
        specPath: specId,
        ...(opts.artifact !== undefined ? { artifactId: opts.artifact } : {}),
      }),
    )

    const passed = result.failures.length === 0
    if (passed) totalPassed++
    results.push({
      spec: specId,
      passed,
      failures: result.failures,
      notes: result.notes,
      files: result.files,
    })
  }

  const allPassed = totalPassed === specIds.length
  const fmt = parseFormat(opts.format)

  if (fmt === 'text') {
    for (const r of results) {
      const fileLines = r.files.map((file) =>
        file.status === 'missing' ? `missing: ${file.filename}` : `file: ${file.filename}`,
      )
      const previewNote = `note: verify merged output with: specd change spec-preview ${name} ${r.spec}`

      if (r.passed) {
        if (r.notes.length > 0) {
          const noteLines = r.notes.map((n) => `note: ${n.artifactId} — ${n.description}`)
          output(
            `validated ${name}/${r.spec}: pass (${r.notes.length} note(s))\n${[...fileLines, ...noteLines, previewNote].join('\n')}`,
            'text',
          )
        } else {
          output(
            `validated ${name}/${r.spec}: all artifacts pass\n${[...fileLines, previewNote].join('\n')}`,
            'text',
          )
        }
      } else {
        const errorLines = r.failures.map((f) => `  error: ${f.artifactId} — ${f.description}`)
        const noteLines = r.notes.map((n) => `  note: ${n.artifactId} — ${n.description}`)
        const allLines = [...fileLines, ...errorLines, ...noteLines, previewNote]
        output(`validation failed ${name}/${r.spec}:\n${allLines.join('\n')}`, 'text')
      }
    }
    output(`validated ${totalPassed}/${specIds.length} specs`, 'text')
  } else {
    output(
      {
        passed: allPassed,
        total: specIds.length,
        results,
      },
      fmt,
    )
  }

  if (!allPassed) {
    process.exitCode = 1
  }
}
