import * as path from 'node:path'
import { type OutlineEntry, type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SpecPath } from '../../domain/value-objects/spec-path.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { type Schema } from '../../domain/value-objects/schema.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import { WorkspaceNotFoundError } from '../errors/workspace-not-found-error.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'
import { ParserNotRegisteredError } from '../errors/parser-not-registered-error.js'

/** Input for the {@link GetSpecOutline} use case. */
export interface GetSpecOutlineInput {
  readonly workspace: string
  readonly specPath: SpecPath
  readonly artifactId?: string
  readonly filename?: string
}

/** Result entry for the {@link GetSpecOutline} use case. */
export interface SpecOutlineResult {
  readonly filename: string
  readonly outline: readonly OutlineEntry[]
}

/**
 * Resolves parsed outlines for spec artifacts.
 */
export class GetSpecOutline {
  /**
   * Creates the use case.
   *
   * @param specs - Workspace spec repositories.
   * @param schemaProvider - Active schema provider.
   * @param parsers - Artifact parser registry.
   */
  constructor(
    private readonly specs: ReadonlyMap<string, SpecRepository>,
    private readonly schemaProvider: SchemaProvider,
    private readonly parsers: ArtifactParserRegistry,
  ) {}

  /**
   * Loads and outlines matching artifact files for a given spec.
   *
   * @param input - Outline query input.
   * @returns Parsed outlines grouped by filename.
   */
  async execute(input: GetSpecOutlineInput): Promise<readonly SpecOutlineResult[]> {
    const specRepo = this.specs.get(input.workspace)
    if (!specRepo) {
      throw new WorkspaceNotFoundError(input.workspace)
    }

    const spec = await specRepo.get(input.specPath)
    if (spec === null) {
      throw new SpecNotFoundError(`${input.workspace}:${input.specPath.toFsPath('/')}`)
    }

    const schema = await this.schemaProvider.get()
    const targetFilenames = this.resolveTargetFilenames(input, schema)
    const explicitRequest = input.artifactId !== undefined || input.filename !== undefined

    const results: SpecOutlineResult[] = []

    for (const filename of targetFilenames) {
      const artifact = await specRepo.artifact(spec, filename)
      if (artifact === null) {
        if (explicitRequest) {
          throw new SpecNotFoundError(
            `file '${filename}' not found for spec '${input.workspace}:${input.specPath.toFsPath('/')}'`,
          )
        }
        continue
      }

      const format = inferFormat(filename)
      if (!format) {
        throw new ParserNotRegisteredError(
          `unknown`,
          `unrecognised extension for file '${filename}'`,
        )
      }

      const parser = this.parsers.get(format)
      if (!parser) {
        throw new ParserNotRegisteredError(format, `file: ${filename}`)
      }

      const ast = parser.parse(artifact.content)
      const outline = parser.outline(ast)

      results.push({ filename, outline })
    }

    return results
  }

  /**
   * Resolves target filenames from explicit options or schema defaults.
   *
   * @param input - Outline query input.
   * @param schema - Active project schema.
   * @returns Unique filenames to outline.
   * @throws {SpecNotFoundError} When the requested artifact ID is unknown or has non-spec scope.
   */
  private resolveTargetFilenames(input: GetSpecOutlineInput, schema: Schema): string[] {
    const filenames = new Set<string>()

    if (input.artifactId) {
      const artifactDef = schema.artifact(input.artifactId)
      if (!artifactDef) {
        throw new SpecNotFoundError(`unknown artifact ID '${input.artifactId}'`)
      }
      if (artifactDef.scope !== 'spec') {
        throw new SpecNotFoundError(
          `artifact '${input.artifactId}' has scope '${artifactDef.scope}' (must be 'spec')`,
        )
      }
      filenames.add(path.basename(artifactDef.output))
    }

    if (input.filename) {
      filenames.add(input.filename)
    }

    if (filenames.size === 0) {
      for (const at of schema.artifacts()) {
        if (at.scope === 'spec') {
          filenames.add(path.basename(at.output))
        }
      }
    }

    return [...filenames]
  }
}
