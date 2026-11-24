import {
  type SpecdConfig,
  type SpecdContextEntry,
  type SpecdStorageConfig,
  type SpecdWorkspaceConfig,
} from '@specd/sdk'

/** One documented key of a config shape: its displayed type and optionality. */
export interface ConfigShapeKey {
  /** Type text rendered in the help output. */
  readonly type: string
  /** Whether the key may be omitted. */
  readonly optional?: true
}

/** Union of every key that appears in any member of a union type. */
type AllKeys<T> = T extends unknown ? keyof T : never

const ADAPTER = '{ adapter: string, config: object }'

/**
 * Documented keys of a workspace entry. `Record<keyof ...>` makes a new or
 * removed `SpecdWorkspaceConfig` field a compile error here.
 */
export const WORKSPACE_KEYS = {
  name: { type: 'string' },
  prefix: { type: 'string', optional: true },
  specsPath: { type: 'string' },
  specsAdapter: { type: ADAPTER },
  schemasPath: { type: 'string | null' },
  schemasAdapter: { type: `${ADAPTER} | null` },
  codeRoot: { type: 'string' },
  ownership: { type: "'owned' | 'shared' | 'readOnly'" },
  isExternal: { type: 'boolean' },
  contextIncludeSpecs: { type: 'string[]', optional: true },
  contextExcludeSpecs: { type: 'string[]', optional: true },
  graph: { type: 'object', optional: true },
} as const satisfies Record<keyof SpecdWorkspaceConfig, ConfigShapeKey>

/** Documented keys of the `storage` section. */
export const STORAGE_KEYS = {
  changesPath: { type: 'string' },
  changesAdapter: { type: ADAPTER },
  draftsPath: { type: 'string' },
  draftsAdapter: { type: ADAPTER },
  discardedPath: { type: 'string' },
  discardedAdapter: { type: ADAPTER },
  archivePath: { type: 'string' },
  archiveAdapter: { type: ADAPTER },
  archivePattern: { type: 'string', optional: true },
} as const satisfies Record<keyof SpecdStorageConfig, ConfigShapeKey>

/** Documented keys of a `context` entry (either `file` or `instruction`). */
export const CONTEXT_ENTRY_KEYS = {
  id: { type: 'string', optional: true },
  file: { type: 'string' },
  instruction: { type: 'string' },
} as const satisfies Record<AllKeys<SpecdContextEntry>, ConfigShapeKey>

/** Documented keys of the resolved project-level `SpecdConfig`. */
export const PROJECT_KEYS = {
  warnings: { type: 'string[]', optional: true },
  projectRoot: { type: 'string' },
  specdPath: { type: 'string', optional: true },
  configPath: { type: 'string' },
  schemaRef: { type: 'string' },
  workspaces: { type: 'WORKSPACES' },
  storage: { type: 'STORAGE' },
  approvals: { type: '{ spec: boolean, signoff: boolean }' },
  graph: { type: 'object', optional: true },
  logging: { type: 'object', optional: true },
  context: { type: 'CONTEXT', optional: true },
  contextIncludeSpecs: { type: 'string[]', optional: true },
  contextExcludeSpecs: { type: 'string[]', optional: true },
  contextMode: { type: "'list' | 'summary' | 'full' | 'hybrid'", optional: true },
  llmOptimizedContext: { type: 'boolean', optional: true },
  actorProvider: { type: 'string', optional: true },
  privacy: { type: 'object', optional: true },
  schemaPlugins: { type: 'string[]', optional: true },
  schemaOverrides: { type: 'object', optional: true },
  invalidation: { type: '{ artifacts: string, workflow: string }' },
  plugins: {
    type: 'Array<{ name: string, config?: object, contributions?: string[] }>',
    optional: true,
  },
} as const satisfies Record<keyof SpecdConfig, ConfigShapeKey>

/**
 * Renders a key table as `key?: type` pairs.
 *
 * @param keys - Key table to render
 * @returns Comma-separated key declarations
 */
function renderKeys(keys: Record<string, ConfigShapeKey>): string {
  return Object.entries(keys)
    .map(([key, spec]) => `${key}${spec.optional === true ? '?' : ''}: ${spec.type}`)
    .join(', ')
}

/**
 * Renders the JSON/TOON output shape of `config show` for `--help`,
 * generated from the typed key tables above.
 *
 * @returns Multi-line help text describing the resolved `SpecdConfig`
 */
export function renderConfigShapeHelp(): string {
  const workspace = `{ ${renderKeys(WORKSPACE_KEYS)} }`
  const storage = `{ ${renderKeys(STORAGE_KEYS)} }`
  const { id, file, instruction } = CONTEXT_ENTRY_KEYS
  const context = `Array<${[
    `{ ${renderKeys({ id, file })} }`,
    `{ ${renderKeys({ id, instruction })} }`,
  ].join(' | ')}>`
  const lines = Object.entries(PROJECT_KEYS).map(([key, spec]) => {
    const type = spec.type
    const rendered =
      type === 'WORKSPACES'
        ? `Array<${workspace}>`
        : type === 'STORAGE'
          ? storage
          : type === 'CONTEXT'
            ? context
            : type
    const optional = 'optional' in spec && spec.optional === true ? '?' : ''
    return `  ${key}${optional}: ${rendered}`
  })
  return ['{', ...lines, '}'].join('\n')
}
