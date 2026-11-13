import { z, type ZodTypeAny } from 'zod'
import { InvalidPluginConfigError } from '../errors/invalid-plugin-config-error.js'
import { UnsupportedSchemaKeywordError } from '../errors/unsupported-schema-keyword-error.js'
import type { ConfigSchemaNode, PluginConfigSchema } from '../types/plugin-manifest.js'

/** Keywords accepted anywhere in a plugin config schema. */
export const SUPPORTED_SCHEMA_KEYWORDS: readonly string[] = [
  'type',
  'properties',
  'required',
  'items',
  'enum',
  'default',
  'additionalProperties',
]

/** Maximum nesting depth of a plugin config schema (root is depth 0). */
const MAX_SCHEMA_DEPTH = 32

/**
 * Rejects keywords outside {@link SUPPORTED_SCHEMA_KEYWORDS} and a non-object root.
 *
 * @param pluginName - Plugin that declared the schema
 * @param schema - Raw `configSchema` value
 */
export function assertSupportedConfigSchema(
  pluginName: string,
  schema: unknown,
): asserts schema is PluginConfigSchema {
  walkSchema(pluginName, schema, 0, 'properties')
}

/**
 * Converts a supported schema subset into a Zod schema.
 *
 * @param schema - Validated plugin config schema
 * @param pluginName - Plugin named by a depth-limit error
 * @returns A Zod schema that applies defaults and constraints
 * @throws {UnsupportedSchemaKeywordError} When the schema nests deeper than 32 levels
 */
export function configSchemaToZod(
  schema: PluginConfigSchema,
  pluginName = '<unknown>',
): ZodTypeAny {
  return nodeToZod(schema, pluginName, 0)
}

/**
 * Validates config against the manifest schema and applies defaults.
 *
 * @param pluginName - Plugin being configured
 * @param schema - Manifest schema, when declared
 * @param config - Raw config from `specd.yaml` or `defaultConfig`
 * @returns The parsed config
 * @throws {InvalidPluginConfigError} When the value does not match the schema
 * @throws {UnsupportedSchemaKeywordError} When the schema itself is not a supported shape
 */
export function resolvePluginConfig(
  pluginName: string,
  schema: PluginConfigSchema | undefined,
  config: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  if (schema === undefined) {
    if (config === undefined) return {}
    throw new InvalidPluginConfigError(pluginName, ['config given but no configSchema declared'])
  }
  assertSupportedConfigSchema(pluginName, schema)
  const parsed = configSchemaToZod(schema, pluginName).safeParse(config ?? {})
  if (!parsed.success) {
    throw new InvalidPluginConfigError(
      pluginName,
      parsed.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`),
    )
  }
  return parsed.data as Readonly<Record<string, unknown>>
}

/**
 * Rejects unsupported keywords in a schema node.
 *
 * @param pluginName - Plugin that declared the schema
 * @param schema - Schema node being walked
 * @param depth - Nesting depth of this node (the root is 0)
 * @param via - Keyword through which this node was reached, named when the depth limit is hit
 * @throws {UnsupportedSchemaKeywordError} When a keyword or the root type is unsupported
 */
function walkSchema(
  pluginName: string,
  schema: unknown,
  depth: number,
  via: 'properties' | 'items',
): void {
  if (depth > MAX_SCHEMA_DEPTH) {
    throw new UnsupportedSchemaKeywordError(
      pluginName,
      via,
      `nesting deeper than ${MAX_SCHEMA_DEPTH} levels is not supported`,
    )
  }
  const isRoot = depth === 0
  if (!isRecord(schema)) {
    throw new UnsupportedSchemaKeywordError(
      pluginName,
      isRoot ? 'configSchema' : 'type',
      'a schema node must be an object',
    )
  }
  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED_SCHEMA_KEYWORDS.includes(keyword)) {
      throw new UnsupportedSchemaKeywordError(pluginName, keyword)
    }
  }
  if (
    typeof schema['type'] !== 'string' ||
    !['string', 'number', 'integer', 'boolean', 'array', 'object'].includes(schema['type'])
  ) {
    throw new UnsupportedSchemaKeywordError(
      pluginName,
      'type',
      'every schema node must declare type as one of string, number, integer, boolean, array or object',
    )
  }
  if (isRoot && schema['type'] !== 'object') {
    throw new UnsupportedSchemaKeywordError(pluginName, 'type', 'the root type must be object')
  }
  if (schema['required'] !== undefined) {
    const required = schema['required']
    if (!Array.isArray(required) || required.some((entry) => typeof entry !== 'string')) {
      throw new UnsupportedSchemaKeywordError(
        pluginName,
        'required',
        'it must be an array of strings',
      )
    }
  }
  if (schema['enum'] !== undefined) {
    const values = schema['enum']
    if (
      !Array.isArray(values) ||
      values.length === 0 ||
      values.some((entry) => !['string', 'number', 'boolean'].includes(typeof entry))
    ) {
      throw new UnsupportedSchemaKeywordError(
        pluginName,
        'enum',
        'it must be a non-empty array of strings, numbers or booleans',
      )
    }
  }
  if (
    schema['additionalProperties'] !== undefined &&
    typeof schema['additionalProperties'] !== 'boolean'
  ) {
    throw new UnsupportedSchemaKeywordError(
      pluginName,
      'additionalProperties',
      'it must be a boolean',
    )
  }
  const properties = schema['properties']
  if (properties !== undefined) {
    if (!isRecord(properties)) {
      throw new UnsupportedSchemaKeywordError(pluginName, 'properties', 'it must be an object')
    }
    if (Object.prototype.hasOwnProperty.call(properties, '__proto__')) {
      throw new UnsupportedSchemaKeywordError(
        pluginName,
        'properties',
        "a property named '__proto__' is not allowed",
      )
    }
    for (const child of Object.values(properties)) {
      walkSchema(pluginName, child, depth + 1, 'properties')
    }
  }
  if (schema['items'] !== undefined) {
    if (!isRecord(schema['items'])) {
      throw new UnsupportedSchemaKeywordError(
        pluginName,
        'items',
        'it must be a single schema, not an array',
      )
    }
    walkSchema(pluginName, schema['items'], depth + 1, 'items')
  }
}

/**
 * Converts one schema node into Zod.
 *
 * @param node - Schema node
 * @param pluginName - Plugin named by a depth-limit error
 * @param depth - Nesting depth of this node
 * @returns The Zod schema for that node
 * @throws {UnsupportedSchemaKeywordError} When the node nests deeper than the supported limit
 */
function nodeToZod(
  node: ConfigSchemaNode | PluginConfigSchema,
  pluginName: string,
  depth: number,
): ZodTypeAny {
  if (depth > MAX_SCHEMA_DEPTH) {
    throw new UnsupportedSchemaKeywordError(
      pluginName,
      'properties',
      `nesting deeper than ${MAX_SCHEMA_DEPTH} levels is not supported`,
    )
  }
  const schemaNode = node as ConfigSchemaNode
  if (schemaNode.enum !== undefined && schemaNode.enum.length > 0) {
    return applyDefault(enumToZod(schemaNode.enum), schemaNode.default)
  }
  let schema: ZodTypeAny
  switch (node.type) {
    case 'string':
      schema = z.string()
      break
    case 'number':
      schema = z.number()
      break
    case 'integer':
      schema = z.number().int()
      break
    case 'boolean':
      schema = z.boolean()
      break
    case 'array':
      schema = z.array(
        node.items !== undefined ? nodeToZod(node.items, pluginName, depth + 1) : z.unknown(),
      )
      break
    case 'object':
      schema = objectToZod(node, pluginName, depth)
      break
    default:
      schema = z.unknown()
  }
  return applyDefault(schema, schemaNode.default)
}

/**
 * Converts an object schema node into Zod.
 *
 * @param node - Object schema node
 * @param node.properties - Nested property schemas
 * @param node.required - Required property names
 * @param node.additionalProperties - When `false`, unknown properties are rejected
 * @param node.default - Unused at this level; defaults live on properties
 * @param pluginName - Plugin named by a depth-limit error
 * @param depth - Nesting depth of this node
 * @returns A strict or passthrough object schema
 * @throws {UnsupportedSchemaKeywordError} When a property is named `__proto__`
 */
function objectToZod(
  node: {
    readonly properties?: Readonly<Record<string, ConfigSchemaNode>>
    readonly required?: readonly string[]
    readonly additionalProperties?: boolean
    readonly default?: unknown
  },
  pluginName: string,
  depth: number,
): ZodTypeAny {
  const required = new Set(node.required ?? [])
  const shape: Record<string, ZodTypeAny> = {}
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    if (key === '__proto__') {
      throw new UnsupportedSchemaKeywordError(
        pluginName,
        'properties',
        "a property named '__proto__' is not allowed",
      )
    }
    const converted = nodeToZod(child, pluginName, depth + 1)
    shape[key] = required.has(key) || child.default !== undefined ? converted : converted.optional()
  }
  const objectSchema = z.object(shape)
  return node.additionalProperties === false ? objectSchema.strict() : objectSchema.passthrough()
}

/**
 * Converts an enum list into a Zod union of literals.
 *
 * @param values - Allowed literal values
 * @returns The literal or union schema
 */
function enumToZod(values: readonly (string | number | boolean)[]): ZodTypeAny {
  const literals = values.map((value) => z.literal(value))
  const first = literals[0]
  if (first === undefined) return z.never()
  if (literals.length === 1) return first
  return z.union(literals as unknown as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]])
}

/**
 * Applies a JSON Schema default when one is declared.
 *
 * @param schema - Schema to wrap
 * @param value - Default value, or `undefined` when absent
 * @returns The schema, with a default when `value` is defined
 */
function applyDefault(schema: ZodTypeAny, value: unknown): ZodTypeAny {
  return value === undefined ? schema : schema.default(value)
}

/**
 * Checks whether a value is a plain object.
 *
 * @param value - Candidate value
 * @returns `true` when the value is a non-array object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
