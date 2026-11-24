import { isPluginName, type SpecdConfig } from '@specd/core'
import { InvalidContributionAddressError } from '../errors/invalid-contribution-address-error.js'

/**
 * Runtime context passed into plugin initialization.
 */
export interface PluginContext {
  /** Fully-resolved project configuration. */
  readonly config: SpecdConfig
  /**
   * This plugin's own config, validated against `configSchema` with defaults applied.
   * `{}` when the plugin declares no schema.
   */
  readonly pluginConfig: Readonly<Record<string, unknown>>
}

/**
 * Context passed to optional install and uninstall hooks.
 */
export interface PluginInstallContext {
  /** Fully-resolved project configuration. */
  readonly config: SpecdConfig
  /** Selected contribution ids (all declared ids when no allowlist). */
  readonly contributions: readonly string[]
  /** Optional caller options forwarded by install, uninstall, and update. */
  readonly options?: Readonly<Record<string, unknown>>
}

/**
 * Base contract implemented by all specd plugins.
 */
export interface SpecdPlugin {
  /** Scoped package name (`@scope/name`). */
  readonly name: string
  /** Plugin semantic version. */
  readonly version: string
  /**
   * Initializes plugin runtime.
   *
   * @param context - Plugin context
   */
  init(context: PluginContext): Promise<void>
  /**
   * Cleans up plugin resources.
   */
  destroy(): Promise<void>
  /**
   * Optional install hook. Not invoked during host startup.
   *
   * @param context - Install context
   */
  install?(context: PluginInstallContext): Promise<unknown>
  /**
   * Optional uninstall hook.
   *
   * @param context - Uninstall context
   */
  uninstall?(context: PluginInstallContext): Promise<void>
  /**
   * Returns the runtime value for one declared contribution.
   *
   * Required when any declared kind's handler implements `activate`.
   *
   * @param kind - Contribution kind
   * @param id - Contribution id
   */
  contribution?(kind: string, id: string): unknown
}

/** Contribution id: lowercase, no `.`. */
export const CONTRIBUTION_ID_REGEX = /^[a-z0-9][a-z0-9_-]*$/

/**
 * Builds the address `@scope/name.id`.
 *
 * @param pluginName - Scoped plugin name
 * @param id - Contribution id
 * @returns The contribution address
 * @throws {InvalidContributionAddressError} When the name or id is not valid
 */
export function buildContributionAddress(pluginName: string, id: string): string {
  if (!isPluginName(pluginName) || !CONTRIBUTION_ID_REGEX.test(id)) {
    throw new InvalidContributionAddressError(`${pluginName}.${id}`)
  }
  return `${pluginName}.${id}`
}

/**
 * Splits an address on its single `.`.
 *
 * @param address - Contribution address
 * @returns The plugin name and contribution id
 * @throws {InvalidContributionAddressError} When the address is not `<plugin name>.<id>`
 */
export function parseContributionAddress(address: string): { pluginName: string; id: string } {
  const match = /^(?<pluginName>@[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_-]*)\.(?<id>[^.]+)$/.exec(
    address,
  )
  const pluginName = match?.groups?.['pluginName']
  const id = match?.groups?.['id']
  if (
    pluginName === undefined ||
    id === undefined ||
    !isPluginName(pluginName) ||
    !CONTRIBUTION_ID_REGEX.test(id)
  ) {
    throw new InvalidContributionAddressError(address)
  }
  return { pluginName, id }
}

/**
 * Lists the base-contract fields that fail for a runtime value.
 *
 * @param value - Candidate plugin
 * @returns Failing field names, empty when the value satisfies {@link SpecdPlugin}
 */
export function baseContractFields(value: unknown): readonly string[] {
  if (typeof value !== 'object' || value === null) {
    return ['name', 'version', 'init', 'destroy']
  }
  const record = value as Record<string, unknown>
  const fields: string[] = []
  if (typeof record['name'] !== 'string' || !isPluginName(record['name'])) fields.push('name')
  if (typeof record['version'] !== 'string') fields.push('version')
  if (typeof record['init'] !== 'function') fields.push('init')
  if (typeof record['destroy'] !== 'function') fields.push('destroy')
  for (const key of ['install', 'uninstall', 'contribution'] as const) {
    if (record[key] !== undefined && typeof record[key] !== 'function') fields.push(key)
  }
  return fields
}

/**
 * Checks whether a value satisfies the base plugin contract.
 *
 * @param value - Candidate runtime value
 * @returns `true` when the value matches {@link SpecdPlugin}
 */
export function isSpecdPlugin(value: unknown): value is SpecdPlugin {
  return baseContractFields(value).length === 0
}
