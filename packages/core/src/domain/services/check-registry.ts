import type { ChangeState } from '../value-objects/change-state.js'
import {
  DuplicateCheckBindingError,
  DuplicateCheckError,
  InvalidCheckKindError,
  InvalidPluginNameError,
} from '../errors/check-registry-errors.js'
import {
  applyBindingSpecs,
  type Check,
  type CheckBinding,
  type CheckBindingSpec,
  type CustomCheckDefinition,
  type TransitionAlong,
} from './transition-checks.js'
import { InvalidInputError } from '../errors/invalid-input-error.js'
import { ARCHIVE_BINDINGS, DOMAIN_CHECKS, TRANSITION_BINDINGS } from './check-bindings.js'

const PLUGIN_NAME_REGEX = /^[a-zA-Z0-9_-]+$/

/** Governance rules recorded for a registered check. */
export interface CheckGovernance {
  readonly canonicalId: string
  readonly allowSchemaEmbedding: boolean
  readonly allowBindingOverride: boolean
  readonly allowConfigOverride: boolean
  readonly allowDisable: boolean
  readonly defaultConfig?: Readonly<Record<string, unknown>>
}

/** Options supplied when registering a plugin check. */
export interface PluginCheckRegistrationOptions {
  readonly defaultConfig?: Readonly<Record<string, unknown>>
  readonly allowSchemaEmbedding?: boolean
  readonly allowConfigOverride?: boolean
  readonly allowBindingOverride?: boolean
  readonly allowDisable?: boolean
}

/**
 * Builds a string summary of a coordinate for diagnostic error reporting.
 *
 * @param checkId - Canonical check identifier
 * @param scope - Scope name ('transition', 'archive', or 'step-skip')
 * @param to - Optional destination step
 * @param along - Optional transition direction
 * @param step - Optional bypassed step for step-skip scope
 * @returns Diagnostic coordinate key string
 */
function coordinateKey(
  checkId: string,
  scope: string,
  to?: string,
  along?: string,
  step?: string,
): string {
  if (scope === 'step-skip') {
    return `${checkId}::step-skip::${step ?? '*'}`
  }
  return `${checkId}::${scope}::${to ?? '*'}::${along ?? '*'}`
}

/**
 * Domain service cataloging and querying transition checks, bindings, and governance locks.
 */
export class CheckRegistry {
  private readonly _catalog: Map<string, Check> = new Map()
  private readonly _bindings: CheckBinding[] = []
  private readonly _governance: Map<string, CheckGovernance> = new Map()
  private readonly _boundCoordinates: Set<string> = new Set()
  private readonly _builtinIds: Set<string> = new Set()

  /**
   * Initializes the registry with built-in checks and baseline bindings.
   *
   * @param builtins - Built-in checks (cannot be unregistered or mutated)
   * @param defaultBindings - Default system transition & archive bindings
   */
  constructor(
    builtins: readonly Check[] = Object.values(DOMAIN_CHECKS),
    defaultBindings: readonly CheckBinding[] = [...TRANSITION_BINDINGS, ...ARCHIVE_BINDINGS],
  ) {
    const nonEmbeddableBuiltins = new Set([
      // Category A: Protocol & State Invariants
      'protocol.edge',
      'verification.current',
      'archive.archivable',
      'schema.nameMatch',
      'hook.pre',
      'hook.post',
      // Category B: Native Step Attributes
      'workflow.requires',
      'workflow.taskCompletion',
      'workflow.tasksEmpty',
      'approval.spec',
      'approval.signoff',
    ])

    for (const check of builtins) {
      const isEmbeddable = !nonEmbeddableBuiltins.has(check.id)
      this._catalog.set(check.id, check)
      this._builtinIds.add(check.id)
      this._governance.set(check.id, {
        canonicalId: check.id,
        allowSchemaEmbedding: isEmbeddable,
        allowBindingOverride: isEmbeddable,
        allowConfigOverride: isEmbeddable,
        allowDisable: isEmbeddable,
      })
    }

    for (const binding of defaultBindings) {
      this._bindings.push(binding)
      for (const app of binding.applicability) {
        const to = app.scope === 'transition' ? app.to : undefined
        const along = app.scope === 'transition' ? app.along : undefined
        const step = app.scope === 'step-skip' ? app.step : undefined
        const key = coordinateKey(binding.check.id, app.scope, to, along, step)
        this._boundCoordinates.add(key)
      }
    }
  }

  /**
   * Returns a copy whose built-in catalog entries are replaced by executable instances.
   * Plugin checks, bindings, governance, and bound coordinates are preserved.
   *
   * @param instances - Executable check instances keyed by built-in canonical id
   * @returns New registry with the built-in catalog entries replaced
   * @throws {@link InvalidInputError} When an instance id is not a built-in or its kind differs
   */
  withExecutableBuiltins(instances: Readonly<Partial<Record<string, Check>>>): CheckRegistry {
    const copy = new CheckRegistry([], [])
    for (const [id, check] of this._catalog) copy._catalog.set(id, check)
    copy._bindings.push(...this._bindings)
    for (const [id, gov] of this._governance) copy._governance.set(id, gov)
    for (const key of this._boundCoordinates) copy._boundCoordinates.add(key)

    for (const [id, instance] of Object.entries(instances)) {
      if (instance === undefined) continue
      const existing = this._catalog.get(id)
      if (existing === undefined || !this._builtinIds.has(id)) {
        throw new InvalidInputError(`Cannot replace '${id}': not a built-in check`)
      }
      if (instance.kind !== existing.kind) {
        throw new InvalidInputError(
          `Cannot replace '${id}': kind '${instance.kind}' differs from '${existing.kind}'`,
        )
      }
      copy._catalog.set(id, instance)
    }
    for (const id of this._builtinIds) copy._builtinIds.add(id)
    return copy
  }

  /**
   * Retrieves a registered check by its canonical identifier.
   *
   * @param canonicalId - Canonical check id (e.g. 'protocol.edge' or '@plugin.check-name')
   * @returns Check instance or undefined if not registered
   */
  get(canonicalId: string): Check | undefined {
    return this._catalog.get(canonicalId)
  }

  /**
   * Checks whether a check is registered.
   *
   * @param canonicalId - Canonical check id
   * @returns True if registered
   */
  has(canonicalId: string): boolean {
    return this._catalog.has(canonicalId)
  }

  /**
   * Lists all registered checks in catalog order.
   *
   * @returns Readonly array of checks
   */
  list(): readonly Check[] {
    return Array.from(this._catalog.values())
  }

  /**
   * Lists all active check bindings.
   *
   * @returns Readonly array of check bindings
   */
  bindings(): readonly CheckBinding[] {
    return [...this._bindings]
  }

  /**
   * Retrieves all bindings for a given canonical check identifier.
   *
   * @param canonicalId - Canonical check id
   * @returns Array of bindings for the specified check
   */
  getBindings(canonicalId: string): readonly CheckBinding[] {
    return this._bindings.filter((b) => b.check.id === canonicalId)
  }

  /**
   * Retrieves governance rules for a registered check.
   *
   * @param canonicalId - Canonical check id
   * @returns Governance record or undefined
   */
  getGovernance(canonicalId: string): CheckGovernance | undefined {
    return this._governance.get(canonicalId)
  }

  /**
   * Registers a custom check from an external plugin.
   *
   * @param pluginName - Plugin namespace matching ^[a-z][a-z0-9-]*$
   * @param check - Custom check definition
   * @param defaultBindings - Optional default bindings for this check
   * @param options - Check-level governance and configuration options
   * @returns The assigned canonical identifier (`@${pluginName}.${check.id}`)
   * @throws {@link InvalidPluginNameError} When pluginName is invalid
   * @throws {@link DuplicateCheckError} When check is already registered
   * @throws {@link InvalidCheckKindError} When check kind is not 'predicate'
   */
  register(
    pluginName: string,
    check: CustomCheckDefinition,
    defaultBindings?: readonly (
      | CheckBindingSpec
      | (Record<string, unknown> & {
          scope: string
          from?: string
          to?: string
          along?: string
          skippable?: boolean
        })
    )[],
    options?: PluginCheckRegistrationOptions,
  ): string {
    if (!pluginName || !PLUGIN_NAME_REGEX.test(pluginName)) {
      throw new InvalidPluginNameError(pluginName)
    }

    const canonicalId = `@${pluginName}.${check.id}`

    if (this._catalog.has(canonicalId)) {
      throw new DuplicateCheckError(canonicalId)
    }

    const untypedCheck = check as unknown as Record<string, unknown>
    if (untypedCheck.kind !== undefined && untypedCheck.kind !== 'predicate') {
      const rawKind = untypedCheck.kind
      const kindStr =
        typeof rawKind === 'string'
          ? rawKind
          : typeof rawKind === 'number' || typeof rawKind === 'boolean'
            ? String(rawKind)
            : (JSON.stringify(rawKind) ?? '')
      throw new InvalidCheckKindError(canonicalId, kindStr)
    }

    const adaptedCheck: Check = {
      id: canonicalId,
      label: check.label,
      kind: 'predicate',
      ...(check.command !== undefined ? { command: check.command } : {}),
      execute: (ctx) => check.execute(ctx),
    }

    // Normalize defaultBindings into CheckBindingSpec[]
    const normalizedSpecs: CheckBindingSpec[] = []
    if (defaultBindings && defaultBindings.length > 0) {
      for (const item of defaultBindings) {
        if ('scope' in item && typeof item.scope === 'string') {
          const rawApp = item as {
            scope: string
            from?: string
            to?: string
            along?: string
            skippable?: boolean
            allowDisable?: boolean
            allowBindingOverride?: boolean
            allowConfigOverride?: boolean
            config?: Readonly<Record<string, unknown>>
          }
          normalizedSpecs.push({
            id: canonicalId,
            applicability: [
              rawApp.scope === 'archive'
                ? { scope: 'archive' }
                : rawApp.scope === 'step-skip'
                  ? {
                      scope: 'step-skip',
                      step: ((rawApp as { step?: string }).step ?? '*') as ChangeState | '*',
                    }
                  : {
                      scope: 'transition',
                      from: (rawApp.from ?? '*') as ChangeState | '*',
                      to: (rawApp.to ?? '*') as ChangeState | '*',
                      along: (rawApp.along ?? '*') as TransitionAlong | '*',
                    },
            ],
            ...(rawApp.skippable !== undefined ? { skippable: rawApp.skippable } : {}),
            ...(rawApp.allowDisable !== undefined ? { allowDisable: rawApp.allowDisable } : {}),
            ...(rawApp.allowBindingOverride !== undefined
              ? { allowBindingOverride: rawApp.allowBindingOverride }
              : {}),
            ...(rawApp.allowConfigOverride !== undefined
              ? { allowConfigOverride: rawApp.allowConfigOverride }
              : {}),
            ...(rawApp.config !== undefined ? { config: rawApp.config } : {}),
          })
        } else if ('applicability' in item) {
          normalizedSpecs.push(item as CheckBindingSpec)
        }
      }
    }

    // Validate coordinate duplicates in normalized defaultBindings
    if (normalizedSpecs.length > 0) {
      const seenInBatch = new Set<string>()
      for (const spec of normalizedSpecs) {
        for (const app of spec.applicability) {
          const to = app.scope === 'transition' ? app.to : undefined
          const along = app.scope === 'transition' ? app.along : undefined
          const step = app.scope === 'step-skip' ? app.step : undefined
          const key = coordinateKey(canonicalId, app.scope, to, along, step)
          if (this._boundCoordinates.has(key) || seenInBatch.has(key)) {
            const coordDesc =
              app.scope === 'step-skip'
                ? `scope: step-skip, step: ${step ?? '*'}`
                : `scope: ${app.scope}${to ? `, to: ${to}` : ''}${along ? `, along: ${along}` : ''}`
            throw new DuplicateCheckBindingError(canonicalId, coordDesc)
          }
          seenInBatch.add(key)
        }
      }
    }

    // Check-level confinement lock defaults:
    // If defaultBindings provided and allowBindingOverride omitted -> false
    // If defaultBindings omitted and allowBindingOverride omitted -> true
    const allowBindingOverride =
      options?.allowBindingOverride !== undefined
        ? options.allowBindingOverride
        : normalizedSpecs.length > 0
          ? false
          : true

    // A check with code-defined default bindings is not freely embeddable in schemas
    const allowSchemaEmbedding =
      options?.allowSchemaEmbedding ?? (normalizedSpecs.length > 0 ? false : true)
    const allowConfigOverride = options?.allowConfigOverride ?? true
    const allowDisable = options?.allowDisable ?? true

    this._catalog.set(canonicalId, adaptedCheck)
    this._governance.set(canonicalId, {
      canonicalId,
      allowSchemaEmbedding,
      allowBindingOverride,
      allowConfigOverride,
      allowDisable,
      ...(options?.defaultConfig !== undefined ? { defaultConfig: options.defaultConfig } : {}),
    })

    if (normalizedSpecs.length > 0) {
      const materialized = applyBindingSpecs(
        normalizedSpecs,
        { [canonicalId]: adaptedCheck },
        (id) => this._governance.get(id),
      )
      for (const spec of normalizedSpecs) {
        for (const app of spec.applicability) {
          const to = app.scope === 'transition' ? app.to : undefined
          const along = app.scope === 'transition' ? app.along : undefined
          const step = app.scope === 'step-skip' ? app.step : undefined
          const key = coordinateKey(canonicalId, app.scope, to, along, step)
          this._boundCoordinates.add(key)
        }
      }
      this._bindings.push(...materialized)
    }

    return canonicalId
  }
}
