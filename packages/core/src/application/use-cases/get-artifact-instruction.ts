import * as path from 'node:path'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { type ArtifactParserRegistry, type OutlineEntry } from '../ports/artifact-parser.js'
import { type TemplateExpander } from '../template-expander.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'
import { SchemaMismatchError } from '../errors/schema-mismatch-error.js'
import { ArtifactNotFoundError } from '../errors/artifact-not-found-error.js'
import { ParserNotRegisteredError } from '../errors/parser-not-registered-error.js'
import { Spec } from '../../domain/entities/spec.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { inferFormat } from '../../domain/services/format-inference.js'

/** Input for the {@link GetArtifactInstruction} use case. */
export interface GetArtifactInstructionInput {
  readonly name: string
  /**
   * The artifact ID from the schema (e.g. `specs`, `verify`, `tasks`).
   *
   * When omitted, the use case auto-resolves the next artifact to work on
   * by walking the schema's artifact dependency graph: the first artifact
   * (in declaration order) whose `requires` are all satisfied (complete or
   * skipped) but that is itself not yet complete or skipped.
   */
  readonly artifactId?: string
}

/** Result returned by {@link GetArtifactInstruction}. */
export interface GetArtifactInstructionResult {
  readonly artifactId: string
  readonly rulesPre: readonly string[]
  readonly instruction: string | null
  readonly template: string | null
  readonly delta: {
    readonly formatInstructions: string
    readonly domainInstructions: string | null
    readonly outlines: readonly {
      readonly specId: string
      readonly outline: readonly OutlineEntry[]
    }[]
  } | null
  readonly rulesPost: readonly string[]
}

/**
 * Returns artifact-specific instructions: the schema instruction, composition
 * rules (`rules.pre`/`rules.post`), and delta guidance with existing artifact outlines.
 *
 * Read-only — never modifies state or executes commands.
 */
export class GetArtifactInstruction {
  private readonly _changes: ChangeRepository
  private readonly _specs: ReadonlyMap<string, SpecRepository>
  private readonly _schemaProvider: SchemaProvider
  private readonly _parsers: ArtifactParserRegistry
  private readonly _templates: TemplateExpander

  /**
   * Creates a new `GetArtifactInstruction` use case.
   *
   * @param changes - Repository for loading change entities
   * @param specs - Map of workspace names to spec repositories
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param parsers - Registry of artifact parsers by format
   * @param templates - Template expander for variable substitution
   */
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemaProvider: SchemaProvider,
    parsers: ArtifactParserRegistry,
    templates: TemplateExpander,
  ) {
    this._changes = changes
    this._specs = specs
    this._schemaProvider = schemaProvider
    this._parsers = parsers
    this._templates = templates
  }

  /**
   * Returns artifact-specific instructions for the given change and artifact.
   *
   * @param input - The change name and optional artifact ID
   * @returns Structured instruction with rules, instruction text, and delta guidance
   */
  async execute(input: GetArtifactInstructionInput): Promise<GetArtifactInstructionResult> {
    const change = await this._changes.get(input.name)
    if (change === null) throw new ChangeNotFoundError(input.name)

    const schema = await this._schemaProvider.get()
    if (schema === null) throw new SchemaNotFoundError('(provider)')

    if (schema.name() !== change.schemaName) {
      throw new SchemaMismatchError(change.name, change.schemaName, schema.name())
    }

    // Resolve artifact ID — explicit or auto-detected from dependency graph
    const resolvedId = input.artifactId ?? this._resolveNextArtifact(change, schema)
    if (resolvedId === null) {
      throw new ArtifactNotFoundError('(auto)', change.name)
    }

    const artifactType = schema.artifact(resolvedId)
    if (artifactType === null) {
      throw new ArtifactNotFoundError(resolvedId, change.name)
    }

    // Build contextual variables for template expansion
    const workspace = change.workspaces[0] ?? 'default'
    const contextVars = {
      change: { name: change.name, workspace, path: this._changes.changePath(change) },
    }

    // rules.pre
    const rulesPre = (artifactType.rules?.pre ?? []).map((r) =>
      this._templates.expand(r.text, contextVars),
    )

    // instruction
    const instruction =
      artifactType.instruction !== undefined
        ? this._templates.expand(artifactType.instruction, contextVars)
        : null

    // template
    const template =
      artifactType.template !== undefined
        ? this._templates.expand(artifactType.template, contextVars)
        : null

    // delta
    let delta: GetArtifactInstructionResult['delta'] = null
    if (artifactType.delta) {
      const outputBasename = path.basename(artifactType.output)
      const format = artifactType.format ?? inferFormat(outputBasename) ?? 'plaintext'
      const parser = this._parsers.get(format)
      if (parser === undefined) {
        throw new ParserNotRegisteredError(format, `artifact '${artifactType.id}'`)
      }

      const formatInstructions = parser.deltaInstructions()
      const domainInstructions =
        artifactType.deltaInstruction !== undefined
          ? this._templates.expand(artifactType.deltaInstruction, contextVars)
          : null

      // Build outlines from existing spec artifacts
      const outlines: { specId: string; outline: readonly OutlineEntry[] }[] = []
      for (const specId of change.specIds) {
        const { workspace: specWorkspace, capPath } = parseSpecId(specId)
        const specRepo = this._specs.get(specWorkspace)
        if (specRepo === undefined) continue

        const spec = new Spec(specWorkspace, SpecPath.parse(capPath), [])
        const artifact = await specRepo.artifact(spec, outputBasename)
        if (artifact === null) continue

        const ast = parser.parse(artifact.content)
        const outline = parser.outline(ast)
        outlines.push({ specId, outline })
      }

      delta = { formatInstructions, domainInstructions, outlines }
    }

    // rules.post
    const rulesPost = (artifactType.rules?.post ?? []).map((r) =>
      this._templates.expand(r.text, contextVars),
    )

    return {
      artifactId: resolvedId,
      rulesPre,
      instruction,
      template,
      delta,
      rulesPost,
    }
  }

  /**
   * Walks the schema's artifact list in declaration order and returns the ID
   * of the first artifact whose dependencies are all satisfied (complete or
   * skipped) but that is itself not yet complete or skipped.
   *
   * @param change - The active change entity
   * @param schema - The resolved schema
   * @returns The next artifact ID, or `null` when all are complete/skipped
   */
  private _resolveNextArtifact(
    change: import('../../domain/entities/change.js').Change,
    schema: import('../../domain/value-objects/schema.js').Schema,
  ): string | null {
    for (const art of schema.artifacts()) {
      const status = change.effectiveStatus(art.id)
      if (status === 'complete' || status === 'skipped') continue

      // Check that all requires are satisfied
      const depsOk = art.requires.every((req) => {
        const reqStatus = change.effectiveStatus(req)
        return reqStatus === 'complete' || reqStatus === 'skipped'
      })
      if (depsOk) return art.id
    }
    return null
  }
}
