import * as path from 'node:path'
import { ValidateSpecs } from '../../application/use-cases/validate-specs.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { createSpecRepository } from '../spec-repository.js'
import { createSchemaRegistry } from '../schema-registry.js'
import { createArtifactParserRegistry } from '../../infrastructure/artifact-parser/registry.js'

/** Filesystem adapter options for `createValidateSpecs(options)`. */
export interface FsValidateSpecsOptions {
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
  readonly nodeModulesPaths: readonly string[]
  readonly configDir: string
  readonly schemaRef: string
  readonly workspaceSchemasPaths: ReadonlyMap<string, string>
}

/**
 * Constructs a `ValidateSpecs` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @param kernelOpts - Optional kernel options for schema resolution
 * @param kernelOpts.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createValidateSpecs(
  config: SpecdConfig,
  kernelOpts?: { extraNodeModulesPaths?: readonly string[] },
): ValidateSpecs
/**
 * Constructs a `ValidateSpecs` use case with explicit adapter options.
 *
 * @param options - Spec repositories and node_modules paths
 * @returns The pre-wired use case instance
 */
export function createValidateSpecs(options: FsValidateSpecsOptions): ValidateSpecs
/**
 * Constructs a `ValidateSpecs` instance wired with filesystem adapters.
 *
 * @param configOrOptions - A fully-resolved `SpecdConfig` or explicit adapter options
 * @param kernelOpts - Optional kernel options; only used with `SpecdConfig`
 * @param kernelOpts.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createValidateSpecs(
  configOrOptions: SpecdConfig | FsValidateSpecsOptions,
  kernelOpts?: { extraNodeModulesPaths?: readonly string[] },
): ValidateSpecs {
  if (isSpecdConfig(configOrOptions)) {
    const config = configOrOptions
    const specRepos = new Map(
      config.workspaces.map((ws) => [
        ws.name,
        createSpecRepository(
          'fs',
          { workspace: ws.name, ownership: ws.ownership, isExternal: ws.isExternal },
          { specsPath: ws.specsPath, ...(ws.prefix !== undefined ? { prefix: ws.prefix } : {}) },
        ),
      ]),
    )
    const workspaceSchemasPaths = new Map<string, string>()
    for (const ws of config.workspaces) {
      if (ws.schemasPath !== null) {
        workspaceSchemasPaths.set(ws.name, ws.schemasPath)
      }
    }
    return createValidateSpecs({
      specRepositories: specRepos,
      nodeModulesPaths: [
        path.join(config.projectRoot, 'node_modules'),
        ...(kernelOpts?.extraNodeModulesPaths ?? []),
      ],
      configDir: config.projectRoot,
      schemaRef: config.schemaRef,
      workspaceSchemasPaths,
    })
  }
  const schemas = createSchemaRegistry('fs', {
    nodeModulesPaths: configOrOptions.nodeModulesPaths,
    configDir: configOrOptions.configDir,
  })
  const parsers = createArtifactParserRegistry()
  return new ValidateSpecs(
    configOrOptions.specRepositories,
    schemas,
    parsers,
    configOrOptions.schemaRef,
    configOrOptions.workspaceSchemasPaths,
  )
}
