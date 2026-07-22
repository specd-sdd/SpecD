import path from 'node:path'
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

/** Artifact scope supported by schema-defined artifact types. */
type ArtifactScope = 'change' | 'spec'

/** Preview entry shape consumed for inline diff review. */
interface PreviewFileEntry {
  readonly filename: string
  readonly merged: string
  readonly base: string | null
  readonly diff?: string
  readonly status: 'merged' | 'no-op' | 'missing'
}

/** Inline diff outcome for a qualifying successful validation. */
interface InlineDiffReview {
  readonly diffLines: readonly string[]
  readonly fallbackNote?: string
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
 * Builds the suggested `changes spec-preview` command for merged-content review.
 *
 * @param name - Change name
 * @param specPath - Target spec ID
 * @param previewArtifactId - Optional artifact filter for spec-scoped previews
 * @returns Preview command string
 */
function buildPreviewCommand(name: string, specPath: string, previewArtifactId?: string): string {
  if (previewArtifactId === undefined) {
    return `specd changes spec-preview ${name} ${specPath}`
  }
  return `specd changes spec-preview ${name} ${specPath} --artifact ${previewArtifactId}`
}

/**
 * Builds the suggested preview note shown in validation output.
 *
 * @param name - Change name
 * @param specPath - Target spec ID
 * @param previewArtifactId - Optional artifact filter for spec-scoped previews
 * @returns Formatted preview note
 */
function buildPreviewHint(name: string, specPath: string, previewArtifactId?: string): string {
  return `note: inspect merged spec output with \`${buildPreviewCommand(name, specPath, previewArtifactId)}\``
}

/**
 * Builds the artifact-filtered diff preview command used as inline-diff fallback.
 *
 * @param name - Change name
 * @param specPath - Target spec ID
 * @param artifactId - Validated artifact ID
 * @returns Preview command with diff flag enabled
 */
function buildDiffPreviewCommand(name: string, specPath: string, artifactId: string): string {
  return `specd changes spec-preview ${name} ${specPath} --diff --artifact ${artifactId}`
}

/**
 * Returns whether a validation result represents an existing delta-backed artifact target.
 *
 * @param result - Structured validation result
 * @param artifactId - Requested artifact ID
 * @returns Whether inline diff review should be attempted
 */
function isDeltaBackedValidatedTarget(result: ValidateResult, artifactId: string): boolean {
  return result.files.some(
    (file) =>
      file.artifactId === artifactId &&
      file.status === 'validated' &&
      file.filename.endsWith('.delta.yaml'),
  )
}

/**
 * Returns whether the value is a preview file entry.
 *
 * @param value - Candidate preview entry
 * @returns Whether the entry matches the preview shape
 */
function isPreviewFileEntry(value: unknown): value is PreviewFileEntry {
  if (!isRecord(value)) return false
  return (
    typeof value['filename'] === 'string' &&
    typeof value['merged'] === 'string' &&
    (value['base'] === null || typeof value['base'] === 'string') &&
    (value['diff'] === undefined || typeof value['diff'] === 'string') &&
    (value['status'] === 'merged' || value['status'] === 'no-op' || value['status'] === 'missing')
  )
}

/**
 * Loads inline diff output for a successful single-artifact spec validation.
 *
 * @param kernel - The wired kernel instance
 * @param name - Change name
 * @param specPath - Fully-qualified spec ID
 * @param artifactId - Validated artifact ID
 * @returns Inline diff lines or a fallback note when diff generation was unavailable
 */
async function loadInlineDiffReview(
  kernel: import('@specd/sdk').Kernel,
  name: string,
  specPath: string,
  artifactId: string,
): Promise<InlineDiffReview | null> {
  const schemaResult = await kernel.specs.getActiveSchema.execute()
  if (schemaResult.raw) {
    return null
  }

  const artifactType = schemaResult.schema.artifact(artifactId)
  if (artifactType === null || artifactType.scope !== 'spec') {
    return null
  }

  const preview = await kernel.changes.preview.execute({
    name,
    specId: specPath,
    includeDiff: true,
  })
  const targetFilename = path.basename(artifactType.output)
  const targetFile = Array.isArray(preview.files)
    ? preview.files.find(
        (file): file is PreviewFileEntry =>
          isPreviewFileEntry(file) && file.filename === targetFilename,
      )
    : undefined

  if (targetFile?.status !== 'merged' || targetFile.base === null) {
    return null
  }

  if (typeof targetFile.diff === 'string' && targetFile.diff.length > 0) {
    return { diffLines: targetFile.diff.split('\n') }
  }

  return {
    diffLines: [],
    fallbackNote: `note: inspect merged diff with \`${buildDiffPreviewCommand(name, specPath, artifactId)}\``,
  }
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
      'Validate change artifacts structurally against the active schema, reporting any violations.',
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

          let requestedArtifactScope: ArtifactScope | undefined
          if (opts.artifact !== undefined) {
            const schemaResult = await kernel.specs.getActiveSchema.execute()
            if (schemaResult.raw) {
              cliError('Cannot validate: schema resolved in raw mode', opts.format)
            }
            const artifactType = schemaResult.schema.artifacts().find((a) => a.id === opts.artifact)
            if (artifactType !== undefined) {
              requestedArtifactScope = artifactType.scope
            }
          }

          // If no specPath but --artifact provided, check if it's scope: change
          let finalSpecPath: string | undefined = specPath
          if (specPath === undefined && opts.artifact !== undefined && opts.all !== true) {
            if (requestedArtifactScope === 'change') {
              // scope: change artifact - specPath is optional
              // Use first spec in change as placeholder, or let ValidateArtifacts handle it
              const change = await kernel.changes.list.execute()
              const targetChange = change.items.find((c) => c.name === name)
              if (targetChange !== undefined && targetChange.specIds.length > 0) {
                finalSpecPath = targetChange.specIds[0]
              }
            } else if (requestedArtifactScope === 'spec') {
              // scope: spec artifact - specPath is required
              cliError('<specPath> is required for scope: spec artifacts', opts.format)
            }
          }

          if (opts.all === true) {
            await executeBatch(kernel, name, opts, requestedArtifactScope)
          } else {
            await executeSingle(kernel, config, name, finalSpecPath!, opts, requestedArtifactScope)
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
 * @param requestedArtifactScope - Optional scope for the requested artifact
 */
async function executeSingle(
  kernel: import('@specd/sdk').Kernel,
  config: import('@specd/sdk').SpecdConfig,
  name: string,
  specPath: string,
  opts: { format: string; artifact?: string },
  requestedArtifactScope?: ArtifactScope,
): Promise<void> {
  const parsed = parseSpecId(specPath, config)
  const fullSpecPath = `${parsed.workspace}:${parsed.capabilityPath}`
  const isChangeScopedArtifact = opts.artifact !== undefined && requestedArtifactScope === 'change'
  const displayTarget = isChangeScopedArtifact
    ? `${name} [artifact:${opts.artifact}]`
    : `${name}/${fullSpecPath}`

  const result = toValidateResult(
    await kernel.changes.validate.execute({
      name,
      ...(isChangeScopedArtifact ? {} : { specPath: fullSpecPath }),
      ...(opts.artifact !== undefined ? { artifactId: opts.artifact } : {}),
    }),
  )

  const fmt = parseFormat(opts.format)
  const passed = result.failures.length === 0

  if (fmt === 'text') {
    const fileLines = result.files.map((file) =>
      file.status === 'missing' ? `missing: ${file.filename}` : `file: ${file.filename}`,
    )
    const structuralNote =
      'note: validation is structural; review artifact content separately before relying on it'
    let previewNote = isChangeScopedArtifact
      ? null
      : buildPreviewHint(
          name,
          fullSpecPath,
          requestedArtifactScope === 'spec' ? opts.artifact : undefined,
        )
    let inlineDiffLines: readonly string[] = []

    if (
      passed &&
      opts.artifact !== undefined &&
      requestedArtifactScope === 'spec' &&
      isDeltaBackedValidatedTarget(result, opts.artifact)
    ) {
      const inlineDiffReview = await loadInlineDiffReview(kernel, name, fullSpecPath, opts.artifact)
      if (inlineDiffReview !== null) {
        inlineDiffLines = inlineDiffReview.diffLines
        if (inlineDiffLines.length > 0) {
          previewNote = null
        } else if (inlineDiffReview.fallbackNote !== undefined) {
          previewNote = inlineDiffReview.fallbackNote
        }
      }
    }

    if (passed) {
      const sharedLines =
        previewNote === null ? [structuralNote, ...inlineDiffLines] : [structuralNote, previewNote]
      if (result.notes.length > 0) {
        const noteLines = result.notes.map((n) => `note: ${n.artifactId} — ${n.description}`)
        output(
          `validated ${displayTarget}: pass (${result.notes.length} note(s))\n${[...fileLines, ...noteLines, ...sharedLines].join('\n')}`,
          'text',
        )
      } else {
        output(
          `validated ${displayTarget}: all artifacts pass\n${[...fileLines, ...sharedLines].join('\n')}`,
          'text',
        )
      }
    } else {
      const errorLines = result.failures.map((f) => `  error: ${f.artifactId} — ${f.description}`)
      const noteLines = result.notes.map((n) => `  note: ${n.artifactId} — ${n.description}`)
      const trailerLines = previewNote === null ? [structuralNote] : [structuralNote, previewNote]
      const allLines = [...fileLines, ...errorLines, ...noteLines, ...trailerLines]
      output(`validation failed ${displayTarget}:\n${allLines.join('\n')}`, 'text')
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
 * @param requestedArtifactScope - Optional scope for the requested artifact
 */
async function executeBatch(
  kernel: import('@specd/sdk').Kernel,
  name: string,
  opts: { format: string; artifact?: string },
  requestedArtifactScope?: ArtifactScope,
): Promise<void> {
  const statusResult = await kernel.changes.status.execute({ name })
  const change = statusResult.change
  if (change === undefined) {
    cliError(`change '${name}' is drafted; restore it before validating`, opts.format)
  }
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

  const activeSchema = await kernel.specs.getActiveSchema.execute()
  if (activeSchema.raw) {
    cliError('Active schema resolution returned raw data unexpectedly', opts.format)
  }
  const schema = activeSchema.schema
  const dag = schema.artifactDag()

  const results: Array<{
    spec: string | null
    artifact: string
    passed: boolean
    failures: ValidateFailure[]
    warnings: ValidateNote[]
    files: readonly ValidationFileEntry[]
  }> = []

  for (const artifactId of dag.topologicalOrder()) {
    if (opts.artifact !== undefined && artifactId !== opts.artifact) continue

    const artifactType = schema.artifact(artifactId)
    if (artifactType === null) continue

    if (artifactType.scope === 'change') {
      const result = toValidateResult(
        await kernel.changes.validate.execute({
          name,
          artifactId,
        }),
      )
      results.push({
        spec: null,
        artifact: artifactId,
        passed: result.failures.length === 0,
        failures: result.failures,
        warnings: result.notes,
        files: result.files,
      })
      continue
    }

    for (const specId of specIds) {
      const result = toValidateResult(
        await kernel.changes.validate.execute({
          name,
          specPath: specId,
          artifactId,
        }),
      )
      results.push({
        spec: specId,
        artifact: artifactId,
        passed: result.failures.length === 0,
        failures: result.failures,
        warnings: result.notes,
        files: result.files,
      })
    }
  }

  const allPassed = results.every((r) => r.passed)
  const fmt = parseFormat(opts.format)

  if (fmt === 'text') {
    const isChangeScopedArtifact =
      opts.artifact !== undefined && requestedArtifactScope === 'change'
    for (const r of results) {
      const target =
        r.spec === null
          ? `${name} [artifact:${r.artifact}]`
          : `${name}/${r.spec} [artifact:${r.artifact}]`
      const fileLines = r.files.map((file) =>
        file.status === 'missing' ? `missing: ${file.filename}` : `file: ${file.filename}`,
      )
      const structuralNote =
        'note: validation is structural; review artifact content separately before relying on it'
      const previewNote =
        isChangeScopedArtifact || r.spec === null
          ? null
          : buildPreviewHint(name, r.spec, r.artifact)
      const sharedLines = previewNote === null ? [structuralNote] : [structuralNote, previewNote]

      if (r.passed) {
        if (r.warnings.length > 0) {
          const noteLines = r.warnings.map((n) => `note: ${n.artifactId} — ${n.description}`)
          output(
            `validated ${target}: pass (${r.warnings.length} note(s))\n${[...fileLines, ...noteLines, ...sharedLines].join('\n')}`,
            'text',
          )
        } else {
          output(
            `validated ${target}: all artifacts pass\n${[...fileLines, ...sharedLines].join('\n')}`,
            'text',
          )
        }
      } else {
        const errorLines = r.failures.map((f) => `  error: ${f.artifactId} — ${f.description}`)
        const noteLines = r.warnings.map((n) => `  note: ${n.artifactId} — ${n.description}`)
        const allLines = [...fileLines, ...errorLines, ...noteLines, ...sharedLines]
        output(`validation failed ${target}:\n${allLines.join('\n')}`, 'text')
      }
    }
    const passedSteps = results.filter((r) => r.passed).length
    output(`validated ${passedSteps}/${results.length} steps`, 'text')
  } else {
    output(
      {
        passed: allPassed,
        total: results.length,
        results,
      },
      fmt,
    )
  }

  if (!allPassed) {
    process.exitCode = 1
  }
}
