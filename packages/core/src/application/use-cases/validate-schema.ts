import { type Schema } from '../../domain/value-objects/schema.js'
import { type SchemaYamlData } from '../../domain/services/build-schema.js'
import { type SchemaRegistry } from '../ports/schema-registry.js'
import { type ResolveSchema } from './resolve-schema.js'
import { resolveExtendsChain } from './resolve-extends-chain.js'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'
import { SchemaValidationError } from '../../domain/errors/schema-validation-error.js'

/**
 * Input for the {@link ValidateSchema} use case.
 */
export type ValidateSchemaInput =
  | { readonly mode: 'project' }
  | { readonly mode: 'project-raw' }
  | { readonly mode: 'file'; readonly filePath: string }
  | { readonly mode: 'ref'; readonly ref: string }

/**
 * Structured result from the {@link ValidateSchema} use case.
 */
export type ValidateSchemaResult =
  | { readonly valid: true; readonly schema: Schema; readonly warnings: string[] }
  | { readonly valid: false; readonly errors: string[]; readonly warnings: string[] }

/**
 * Validates a schema via one of four modes: project (fully resolved),
 * project-raw (base only, no plugins/overrides), file (external file
 * with extends chain resolution), or ref (schema reference resolved
 * through the registry with extends chain resolution).
 *
 * Returns structured results — never throws for validation failures.
 */
export class ValidateSchema {
  private readonly _schemas: SchemaRegistry
  private readonly _schemaRef: string
  private readonly _buildSchema: (
    ref: string,
    data: SchemaYamlData,
    templates: ReadonlyMap<string, string>,
  ) => Schema
  private readonly _resolveSchema: ResolveSchema

  /**
   * Creates a new ValidateSchema use case.
   *
   * @param schemas - Registry port for resolving schema references
   * @param schemaRef - The project's base schema reference
   * @param buildSchemaFn - Domain service for semantic validation
   * @param resolveSchema - Pre-wired ResolveSchema for project mode
   */
  constructor(
    schemas: SchemaRegistry,
    schemaRef: string,
    buildSchemaFn: (
      ref: string,
      data: SchemaYamlData,
      templates: ReadonlyMap<string, string>,
    ) => Schema,
    resolveSchema: ResolveSchema,
  ) {
    this._schemas = schemas
    this._schemaRef = schemaRef
    this._buildSchema = buildSchemaFn
    this._resolveSchema = resolveSchema
  }

  /**
   * Executes schema validation.
   *
   * @param input - The validation mode and parameters
   * @returns A structured result — success with Schema, or failure with errors
   */
  async execute(input: ValidateSchemaInput): Promise<ValidateSchemaResult> {
    switch (input.mode) {
      case 'project':
        return this._validateProject()
      case 'project-raw':
        return this._validateProjectRaw()
      case 'file':
        return this._validateFile(input.filePath)
      case 'ref':
        return this._validateRef(input.ref)
    }
  }

  /**
   * Validates the project's fully-resolved schema (extends + plugins + overrides).
   *
   * @returns Validation result
   */
  private async _validateProject(): Promise<ValidateSchemaResult> {
    try {
      const schema = await this._resolveSchema.execute()
      return { valid: true, schema, warnings: [] }
    } catch (err) {
      return this._catchValidationError(err)
    }
  }

  /**
   * Validates the project's base schema without plugins or overrides.
   *
   * @returns Validation result
   */
  private async _validateProjectRaw(): Promise<ValidateSchemaResult> {
    try {
      const baseRaw = await this._schemas.resolveRaw(this._schemaRef)
      if (baseRaw === null) {
        return { valid: false, errors: [`Schema '${this._schemaRef}' not found`], warnings: [] }
      }

      const { cascadedData, templates: extendsTemplates } = await resolveExtendsChain(
        this._schemas,
        baseRaw,
      )

      const finalTemplates = new Map<string, string>(extendsTemplates)
      for (const [k, v] of baseRaw.templates) {
        finalTemplates.set(k, v)
      }

      const schema = this._buildSchema(this._schemaRef, cascadedData, finalTemplates)
      return { valid: true, schema, warnings: [] }
    } catch (err) {
      return this._catchValidationError(err)
    }
  }

  /**
   * Validates an external schema file with extends chain resolution.
   *
   * @param filePath - Absolute path to the schema file
   * @returns Validation result with extends resolution warnings
   */
  private async _validateFile(filePath: string): Promise<ValidateSchemaResult> {
    const warnings: string[] = []

    try {
      const fileRaw = await this._schemas.resolveRaw(filePath)
      if (fileRaw === null) {
        return { valid: false, errors: [`file not found: ${filePath}`], warnings: [] }
      }

      const {
        cascadedData,
        templates: extendsTemplates,
        resolvedPaths,
      } = await resolveExtendsChain(this._schemas, fileRaw)

      // Add warnings for each resolved parent in the extends chain
      if (fileRaw.data.extends !== undefined) {
        let currentData = fileRaw.data
        let pathIndex = 0
        while (currentData.extends !== undefined && pathIndex < resolvedPaths.length) {
          warnings.push(
            `extends '${currentData.extends}' resolved from ${resolvedPaths[pathIndex]}`,
          )
          // Walk the chain to get next extends ref
          const parentRaw = await this._schemas.resolveRaw(currentData.extends)
          if (parentRaw === null) break
          currentData = parentRaw.data
          pathIndex++
        }
      }

      const finalTemplates = new Map<string, string>(extendsTemplates)
      for (const [k, v] of fileRaw.templates) {
        finalTemplates.set(k, v)
      }

      const schema = this._buildSchema(filePath, cascadedData, finalTemplates)
      return { valid: true, schema, warnings }
    } catch (err) {
      return this._catchValidationError(err, warnings)
    }
  }

  /**
   * Validates a schema resolved by reference through the registry.
   *
   * @param ref - The schema reference to resolve and validate
   * @returns Validation result with extends resolution warnings
   */
  private async _validateRef(ref: string): Promise<ValidateSchemaResult> {
    const warnings: string[] = []

    try {
      const refRaw = await this._schemas.resolveRaw(ref)
      if (refRaw === null) {
        return { valid: false, errors: [`schema '${ref}' not found`], warnings: [] }
      }

      const {
        cascadedData,
        templates: extendsTemplates,
        resolvedPaths,
      } = await resolveExtendsChain(this._schemas, refRaw)

      // Add warnings for each resolved parent in the extends chain
      if (refRaw.data.extends !== undefined) {
        let currentData = refRaw.data
        let pathIndex = 0
        while (currentData.extends !== undefined && pathIndex < resolvedPaths.length) {
          warnings.push(
            `extends '${currentData.extends}' resolved from ${resolvedPaths[pathIndex]}`,
          )
          const parentRaw = await this._schemas.resolveRaw(currentData.extends)
          if (parentRaw === null) break
          currentData = parentRaw.data
          pathIndex++
        }
      }

      const finalTemplates = new Map<string, string>(extendsTemplates)
      for (const [k, v] of refRaw.templates) {
        finalTemplates.set(k, v)
      }

      const schema = this._buildSchema(ref, cascadedData, finalTemplates)
      return { valid: true, schema, warnings }
    } catch (err) {
      return this._catchValidationError(err, warnings)
    }
  }

  /**
   * Catches SchemaValidationError and SchemaNotFoundError, returning them
   * as structured failure results. Re-throws unexpected errors.
   *
   * @param err - The caught error
   * @param warnings - Warnings accumulated before the error
   * @returns A failure result
   * @throws {Error} Re-throws unexpected errors that are not validation or not-found errors
   */
  private _catchValidationError(err: unknown, warnings: string[] = []): ValidateSchemaResult {
    if (err instanceof SchemaValidationError || err instanceof SchemaNotFoundError) {
      return { valid: false, errors: [err.message], warnings }
    }
    throw err
  }
}
