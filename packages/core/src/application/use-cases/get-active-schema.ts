import { type Schema } from '../../domain/value-objects/schema.js'
import { type SchemaYamlData } from '../../domain/services/build-schema.js'
import { type SchemaRegistry, type SchemaRawResult } from '../ports/schema-registry.js'
import { type ResolveSchema } from './resolve-schema.js'
import { resolveExtendsChain } from './resolve-extends-chain.js'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'

/**
 * Optional input for {@link GetActiveSchema.execute}.
 *
 * When omitted, the use case resolves the project's active schema.
 * When provided, it resolves the schema identified by ref or file path.
 */
export type GetActiveSchemaInput =
  | { readonly mode: 'ref'; readonly ref: string }
  | { readonly mode: 'file'; readonly filePath: string }

/**
 * Resolves and returns a schema — either the project's active schema
 * or an arbitrary schema identified by reference or file path.
 *
 * For project mode, delegates to {@link ResolveSchema}. For ref and file
 * modes, resolves through the {@link SchemaRegistry} with extends chain
 * resolution, without applying project plugins or overrides.
 */
export class GetActiveSchema {
  private readonly _resolveSchema: ResolveSchema
  private readonly _schemas: SchemaRegistry
  private readonly _buildSchema: (
    ref: string,
    data: SchemaYamlData,
    templates: ReadonlyMap<string, string>,
  ) => Schema

  /**
   * Creates a new `GetActiveSchema` use case instance.
   *
   * @param resolveSchema - The use case that orchestrates the full schema resolution pipeline
   * @param schemas - Registry port for resolving schema references (ref and file modes)
   * @param buildSchemaFn - Domain service for building the Schema entity (ref and file modes)
   */
  constructor(
    resolveSchema: ResolveSchema,
    schemas: SchemaRegistry,
    buildSchemaFn: (
      ref: string,
      data: SchemaYamlData,
      templates: ReadonlyMap<string, string>,
    ) => Schema,
  ) {
    this._resolveSchema = resolveSchema
    this._schemas = schemas
    this._buildSchema = buildSchemaFn
  }

  /**
   * Executes the use case.
   *
   * @param input - Optional input specifying ref or file mode. When omitted, resolves the project's active schema.
   * @returns The resolved schema
   */
  async execute(input?: GetActiveSchemaInput): Promise<Schema> {
    if (input === undefined) {
      return this._resolveSchema.execute()
    }
    switch (input.mode) {
      case 'ref':
        return this._resolveByRef(input.ref)
      case 'file':
        return this._resolveByFile(input.filePath)
    }
  }

  /**
   * Resolves a schema by reference through the registry with extends chain resolution.
   *
   * @param ref - The schema reference to resolve
   * @returns The resolved schema
   */
  private async _resolveByRef(ref: string): Promise<Schema> {
    const raw = await this._schemas.resolveRaw(ref)
    if (raw === null) {
      throw new SchemaNotFoundError(ref)
    }
    return this._buildFromRaw(ref, raw)
  }

  /**
   * Resolves a schema from a file path with extends chain resolution.
   *
   * @param filePath - The file path to resolve
   * @returns The resolved schema
   */
  private async _resolveByFile(filePath: string): Promise<Schema> {
    const raw = await this._schemas.resolveRaw(filePath)
    if (raw === null) {
      throw new SchemaNotFoundError(filePath)
    }
    return this._buildFromRaw(filePath, raw)
  }

  /**
   * Resolves the extends chain and builds a Schema from raw data.
   *
   * @param ref - The schema reference or file path (used as the Schema name)
   * @param raw - The raw schema resolution result
   * @returns The built Schema entity
   */
  private async _buildFromRaw(ref: string, raw: SchemaRawResult): Promise<Schema> {
    const { cascadedData, templates: extendsTemplates } = await resolveExtendsChain(
      this._schemas,
      raw,
    )

    const finalTemplates = new Map<string, string>(extendsTemplates)
    for (const [k, v] of raw.templates) {
      finalTemplates.set(k, v)
    }

    return this._buildSchema(ref, cascadedData, finalTemplates)
  }
}
