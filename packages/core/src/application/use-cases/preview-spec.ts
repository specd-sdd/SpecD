import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SchemaMismatchError } from '../errors/schema-mismatch-error.js'
import { SpecNotInChangeError } from '../errors/spec-not-in-change-error.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { DiffGenerationError, type DiffGenerator } from '../ports/diff-generator.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'

/** Input for the {@link PreviewSpec} use case. */
export interface PreviewSpecInput {
  /** The change name. */
  readonly name: string
  /** The fully-qualified spec ID to preview (e.g. `core:core/compile-context`). */
  readonly specId: string
  /**
   * Unsaved change-directory filenames → content.
   * Overrides disk content for matching files during preview (Studio draft).
   */
  readonly artifactOverrides?: Readonly<Record<string, string>>
  /** Whether unified diff output should be included for merged entries. */
  readonly includeDiff?: boolean
}

/** A single artifact file in the preview result. */
export interface PreviewSpecFileEntry {
  /** The artifact filename (e.g. `spec.md`, `verify.md`). */
  readonly filename: string
  /** The original base content (before delta application). `null` for new specs. */
  readonly base: string | null
  /** The merged content (after delta application). */
  readonly merged: string
  /** Optional unified diff generated from `base` and `merged`. */
  readonly diff?: string
  /**
   * The preview status of this file.
   * - 'merged': delta applied successfully with changes, or new spec file
   * - 'no-op': delta applied but resulted in no changes to base content
   * - 'missing': delta file or base artifact not found, or delta application failed
   */
  readonly status: 'merged' | 'no-op' | 'missing'
}

/** Result returned by a successful {@link PreviewSpec} execution. */
export interface PreviewSpecResult {
  /** The spec ID that was previewed. */
  readonly specId: string
  /** The change name. */
  readonly changeName: string
  /** Per-file preview entries, ordered per the artifact file ordering requirement. */
  readonly files: readonly PreviewSpecFileEntry[]
  /** Warnings encountered during preview (e.g. parser errors, missing base). */
  readonly warnings: readonly string[]
}

/**
 * Applies a change's delta artifacts to the base spec content and returns
 * the merged result per artifact file, without mutating anything.
 *
 * Consumed by `CompileContext` (for materialized views) and by the CLI
 * `change spec-preview` command (for human review).
 */
export class PreviewSpec {
  private readonly _changes: ChangeRepository
  private readonly _diffGenerator: DiffGenerator
  private readonly _specs: ReadonlyMap<string, SpecRepository>
  private readonly _schemaProvider: SchemaProvider
  private readonly _parsers: ArtifactParserRegistry

  /**
   * Creates a new `PreviewSpec` use case instance.
   *
   * @param changes - Repository for loading the change
   * @param specs - Spec repositories keyed by workspace name
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param parsers - Registry of artifact format parsers
   * @param diffGenerator - Unified diff generator for merged preview entries
   */
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemaProvider: SchemaProvider,
    parsers: ArtifactParserRegistry,
    diffGenerator: DiffGenerator,
  ) {
    this._changes = changes
    this._diffGenerator = diffGenerator
    this._specs = specs
    this._schemaProvider = schemaProvider
    this._parsers = parsers
  }

  /**
   * Previews a spec by applying delta artifacts from a change.
   *
   * @param input - Preview parameters
   * @returns The preview result with per-file entries and warnings
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {SchemaMismatchError} If the change's schema differs from the active schema
   * @throws {SpecNotInChangeError} If the specId is not in the change's specIds
   */
  async execute(input: PreviewSpecInput): Promise<PreviewSpecResult> {
    const change = await this._changes.get(input.name)
    if (change === null) throw new ChangeNotFoundError(input.name)

    const schema = await this._schemaProvider.get()
    if (schema.name() !== change.schemaName) {
      throw new SchemaMismatchError(change.name, change.schemaName, schema.name())
    }

    if (!change.specIds.includes(input.specId)) {
      throw new SpecNotInChangeError(input.specId, change.name)
    }

    const { workspace, capPath } = parseSpecId(input.specId)
    const specRepo = this._specs.get(workspace)
    const spec = specRepo !== undefined ? await specRepo.get(SpecPath.parse(capPath)) : null

    const warnings: string[] = []
    const files: PreviewSpecFileEntry[] = []

    for (const artifactType of schema.artifacts()) {
      if (artifactType.scope !== 'spec') continue

      const artifact = change.artifacts.get(artifactType.id)
      const file = artifact?.getFile(input.specId)
      const outputBasename = artifactType.filename

      try {
        if (file === undefined || file.status === 'missing') {
          // Artifact missing in change — record as missing
          const baseArtifact =
            spec !== null && specRepo !== undefined
              ? await specRepo.artifact(spec, outputBasename)
              : null

          files.push({
            filename: outputBasename,
            base: baseArtifact?.content ?? null,
            merged: baseArtifact?.content ?? '',
            status: 'missing',
          })
          continue
        }

        const override = input.artifactOverrides?.[file.filename]
        const content =
          override !== undefined
            ? { content: override }
            : await this._changes.artifact(change, file.filename)
        if (content === null) {
          const baseArtifact =
            spec !== null && specRepo !== undefined
              ? await specRepo.artifact(spec, outputBasename)
              : null

          files.push({
            filename: outputBasename,
            base: baseArtifact?.content ?? null,
            merged: baseArtifact?.content ?? '',
            status: 'missing',
          })
          continue
        }

        if (file.filename.endsWith('.delta.yaml')) {
          // Delta file — parse, apply to base, serialize
          const yamlParser = this._parsers.get('yaml')
          if (yamlParser === undefined) {
            warnings.push(`No YAML parser registered — skipping ${file.filename}`)
            files.push({
              filename: outputBasename,
              base: null,
              merged: '',
              status: 'missing',
            })
            continue
          }

          const deltaEntries = yamlParser.parseDelta(content.content)

          // Load base artifact
          const baseArtifact =
            spec !== null && specRepo !== undefined
              ? await specRepo.artifact(spec, outputBasename)
              : null

          if (baseArtifact === null) {
            warnings.push(
              `Base artifact '${outputBasename}' not found for '${input.specId}' — recording as missing`,
            )
            files.push({
              filename: outputBasename,
              base: null,
              merged: '',
              status: 'missing',
            })
            continue
          }

          if (deltaEntries.length === 0 || deltaEntries.every((e) => e.op === 'no-op')) {
            files.push({
              filename: outputBasename,
              base: baseArtifact.content,
              merged: baseArtifact.content,
              status: 'no-op',
            })
            continue
          }

          const format = artifactType.format ?? inferFormat(outputBasename) ?? 'plaintext'
          const parser = this._parsers.get(format)
          if (parser === undefined) {
            warnings.push(`No parser for format '${format}' — skipping ${outputBasename}`)
            files.push({
              filename: outputBasename,
              base: baseArtifact.content,
              merged: baseArtifact.content,
              status: 'missing',
            })
            continue
          }

          const baseAst = parser.parse(baseArtifact.content)
          const mergedResult = parser.apply(baseAst, deltaEntries)
          const mergedAst = mergedResult.ast
          const merged = parser.serialize(mergedAst)

          files.push({
            filename: outputBasename,
            base: baseArtifact.content,
            merged,
            status: 'merged',
          })
        } else {
          // New spec file — content is the merged result, base is null
          files.push({
            filename: outputBasename,
            base: null,
            merged: content.content,
            status: 'merged',
          })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        warnings.push(`Failed to preview ${outputBasename}: ${message}`)

        const baseArtifact =
          spec !== null && specRepo !== undefined
            ? await specRepo.artifact(spec, outputBasename)
            : null

        files.push({
          filename: outputBasename,
          base: baseArtifact?.content ?? null,
          merged: baseArtifact?.content ?? '',
          status: 'missing',
        })
      }
    }

    // Sort: spec.md first, then alphabetical
    files.sort((a, b) => {
      if (a.filename === 'spec.md') return -1
      if (b.filename === 'spec.md') return 1
      return a.filename.localeCompare(b.filename)
    })

    if (input.includeDiff === true) {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]
        if (file === undefined || file.status !== 'merged') {
          continue
        }

        try {
          files[index] = {
            ...file,
            diff: this._diffGenerator.generate({
              filename: file.filename,
              base: file.base ?? '',
              merged: file.merged,
            }),
          }
        } catch (error) {
          if (error instanceof DiffGenerationError) {
            warnings.push(`Failed to generate diff for ${file.filename}: ${error.message}`)
            continue
          }
          const message = error instanceof Error ? error.message : String(error)
          warnings.push(`Failed to generate diff for ${file.filename}: ${message}`)
        }
      }
    }

    return {
      specId: input.specId,
      changeName: change.name,
      files,
      warnings,
    }
  }
}
