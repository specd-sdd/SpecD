import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SchemaMismatchError } from '../errors/schema-mismatch-error.js'
import { SpecNotInChangeError } from '../errors/spec-not-in-change-error.js'
import { type ChangeRepository } from '../ports/change-repository.js'
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
}

/** A single artifact file in the preview result. */
export interface PreviewSpecFileEntry {
  /** The artifact filename (e.g. `spec.md`, `verify.md`). */
  readonly filename: string
  /** The original base content (before delta application). `null` for new specs. */
  readonly base: string | null
  /** The merged content (after delta application). */
  readonly merged: string
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
   */
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemaProvider: SchemaProvider,
    parsers: ArtifactParserRegistry,
  ) {
    this._changes = changes
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
      if (artifact === undefined) continue

      const file = artifact.getFile(input.specId)
      if (file === undefined || file.status === 'missing') continue

      try {
        const content = await this._changes.artifact(change, file.filename)
        if (content === null) continue

        if (file.filename.endsWith('.delta.yaml')) {
          // Delta file — parse, apply to base, serialize
          const yamlParser = this._parsers.get('yaml')
          if (yamlParser === undefined) {
            warnings.push(`No YAML parser registered — skipping ${file.filename}`)
            continue
          }

          const deltaEntries = yamlParser.parseDelta(content.content)
          if (deltaEntries.length === 0) continue
          if (deltaEntries.every((e) => e.op === 'no-op')) continue

          // Derive output basename: strip deltas/<ws>/<capPath>/ prefix and .delta.yaml suffix
          const deltaYamlSuffix = '.delta.yaml'
          const basenameWithSuffix = file.filename.slice(file.filename.lastIndexOf('/') + 1)
          const outputBasename = basenameWithSuffix.slice(
            0,
            basenameWithSuffix.length - deltaYamlSuffix.length,
          )

          // Load base artifact
          if (spec === null || specRepo === undefined) {
            warnings.push(`Base spec not found for '${input.specId}' — skipping ${outputBasename}`)
            continue
          }
          const baseArtifact = await specRepo.artifact(spec, outputBasename)
          if (baseArtifact === null) {
            warnings.push(
              `Base artifact '${outputBasename}' not found for '${input.specId}' — skipping`,
            )
            continue
          }

          const format = artifactType.format ?? inferFormat(outputBasename) ?? 'plaintext'
          const parser = this._parsers.get(format)
          if (parser === undefined) {
            warnings.push(`No parser for format '${format}' — skipping ${outputBasename}`)
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
          })
        } else {
          // New spec file — content is the merged result, base is null
          const outputBasename = file.filename.slice(file.filename.lastIndexOf('/') + 1)
          files.push({
            filename: outputBasename,
            base: null,
            merged: content.content,
          })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        warnings.push(`Failed to preview ${file.filename}: ${message}`)
      }
    }

    // Sort: spec.md first, then alphabetical
    files.sort((a, b) => {
      if (a.filename === 'spec.md') return -1
      if (b.filename === 'spec.md') return 1
      return a.filename.localeCompare(b.filename)
    })

    return {
      specId: input.specId,
      changeName: change.name,
      files,
      warnings,
    }
  }
}
