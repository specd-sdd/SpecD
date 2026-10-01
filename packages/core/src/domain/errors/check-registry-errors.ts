import { SpecdError } from './specd-error.js'

/**
 * Thrown when a plugin name does not match `^[a-zA-Z0-9_-]+$` or is empty.
 */
export class InvalidPluginNameError extends SpecdError {
  /**
   * Diagnostic error code.
   *
   * @returns Stable machine-readable error code
   */
  override get code(): string {
    return 'INVALID_PLUGIN_NAME'
  }

  /**
   * Creates an InvalidPluginNameError.
   *
   * @param pluginName - Invalid plugin name that failed regex validation
   */
  constructor(public readonly pluginName: string) {
    super(
      `Invalid plugin name '${pluginName}'. Plugin names must be non-empty and contain only alphanumeric characters, underscores, and hyphens (^[a-zA-Z0-9_-]+$).`,
    )
    this.name = 'InvalidPluginNameError'
  }
}

/**
 * Thrown when attempting to register a check with a canonical identifier that already exists.
 */
export class DuplicateCheckError extends SpecdError {
  /**
   * Diagnostic error code.
   *
   * @returns Stable machine-readable error code
   */
  override get code(): string {
    return 'DUPLICATE_CHECK'
  }

  /**
   * Creates a DuplicateCheckError.
   *
   * @param canonicalId - Canonical identifier that is already registered
   */
  constructor(public readonly canonicalId: string) {
    super(`Check '${canonicalId}' is already registered.`)
    this.name = 'DuplicateCheckError'
  }
}

/**
 * Thrown when attempting to register or declare a duplicate binding for the exact same coordinate.
 */
export class DuplicateCheckBindingError extends SpecdError {
  /**
   * Diagnostic error code.
   *
   * @returns Stable machine-readable error code
   */
  override get code(): string {
    return 'DUPLICATE_CHECK_BINDING'
  }

  /**
   * Creates a DuplicateCheckBindingError.
   *
   * @param checkId - Canonical check identifier
   * @param coordinateSummary - Summary of duplicate lifecycle coordinates
   */
  constructor(
    public readonly checkId: string,
    public readonly coordinateSummary: string,
  ) {
    super(`Duplicate check binding for check '${checkId}' at coordinate [${coordinateSummary}].`)
    this.name = 'DuplicateCheckBindingError'
  }
}

/**
 * Thrown when an untyped registration provides an invalid check kind (kind !== 'predicate').
 */
export class InvalidCheckKindError extends SpecdError {
  /**
   * Diagnostic error code.
   *
   * @returns Stable machine-readable error code
   */
  override get code(): string {
    return 'INVALID_CHECK_KIND'
  }

  /**
   * Creates an InvalidCheckKindError.
   *
   * @param checkId - Canonical check identifier
   * @param kind - Invalid kind string supplied
   */
  constructor(
    public readonly checkId: string,
    public readonly kind: string,
  ) {
    super(
      `Invalid check kind '${kind}' for check '${checkId}'. Custom checks must have kind 'predicate'.`,
    )
    this.name = 'InvalidCheckKindError'
  }
}

/**
 * Thrown when a check with check-level allowBindingOverride: false is embedded in a workflow step outside its declared bindings.
 */
export class CheckEmbeddingForbiddenError extends SpecdError {
  /**
   * Diagnostic error code.
   *
   * @returns Stable machine-readable error code
   */
  override get code(): string {
    return 'CHECK_EMBEDDING_FORBIDDEN'
  }

  /**
   * Creates a CheckEmbeddingForbiddenError.
   *
   * @param checkId - Canonical check identifier
   * @param stepName - Target workflow step name
   */
  constructor(
    public readonly checkId: string,
    public readonly stepName: string,
  ) {
    super(
      `Check '${checkId}' has allowBindingOverride: false and cannot be embedded in workflow step '${stepName}'.`,
    )
    this.name = 'CheckEmbeddingForbiddenError'
  }
}

/**
 * Thrown when a binding coordinate has allowBindingOverride: false and schema.yaml attempts to override onFailure or skippable.
 */
export class CheckBindingOverrideForbiddenError extends SpecdError {
  /**
   * Diagnostic error code.
   *
   * @returns Stable machine-readable error code
   */
  override get code(): string {
    return 'CHECK_BINDING_OVERRIDE_FORBIDDEN'
  }

  /**
   * Creates a CheckBindingOverrideForbiddenError.
   *
   * @param checkId - Canonical check identifier
   * @param field - Overridden field name (e.g. skippable, onFailure)
   * @param coordinateSummary - Coordinate description
   */
  constructor(
    public readonly checkId: string,
    public readonly field: string,
    public readonly coordinateSummary: string,
  ) {
    super(
      `Binding for check '${checkId}' at [${coordinateSummary}] has allowBindingOverride: false. Overriding '${field}' is forbidden.`,
    )
    this.name = 'CheckBindingOverrideForbiddenError'
  }
}

/**
 * Thrown when schema.yaml attempts to supply or override config on a check or binding with allowConfigOverride: false.
 */
export class CheckConfigOverrideForbiddenError extends SpecdError {
  /**
   * Diagnostic error code.
   *
   * @returns Stable machine-readable error code
   */
  override get code(): string {
    return 'CHECK_CONFIG_OVERRIDE_FORBIDDEN'
  }

  /**
   * Creates a CheckConfigOverrideForbiddenError.
   *
   * @param checkId - Canonical check identifier
   * @param contextSummary - Configuration location summary
   */
  constructor(
    public readonly checkId: string,
    public readonly contextSummary: string,
  ) {
    super(
      `Check '${checkId}' has allowConfigOverride: false. Overriding configuration in ${contextSummary} is forbidden.`,
    )
    this.name = 'CheckConfigOverrideForbiddenError'
  }
}

/**
 * Thrown when a user attempts to bypass a check that is mandatory (skippable: false) or is an effect check.
 */
export class CheckNotSkippableError extends SpecdError {
  /**
   * Diagnostic error code.
   *
   * @returns Stable machine-readable error code
   */
  override get code(): string {
    return 'CHECK_NOT_SKIPPABLE'
  }

  /**
   * Creates a CheckNotSkippableError.
   *
   * @param checkId - Canonical check identifier
   * @param reason - Optional explanation for non-skippability
   */
  constructor(
    public readonly checkId: string,
    public readonly reason?: string,
  ) {
    super(
      `Check '${checkId}' cannot be skipped${reason ? `: ${reason}` : '. This check is mandatory and cannot be bypassed.'}`,
    )
    this.name = 'CheckNotSkippableError'
  }
}

/**
 * Thrown when a referenced check identifier is not registered in the active CheckRegistry.
 */
export class UnknownCheckError extends SpecdError {
  /**
   * Diagnostic error code.
   *
   * @returns Stable machine-readable error code
   */
  override get code(): string {
    return 'UNKNOWN_CHECK'
  }

  /**
   * Creates an UnknownCheckError.
   *
   * @param checkId - Unregistered check identifier
   */
  constructor(public readonly checkId: string) {
    super(`Check '${checkId}' is not registered in the check registry.`)
    this.name = 'UnknownCheckError'
  }
}

/**
 * Thrown when a check with allowDisable: false is disabled in a workflow step or schema.
 */
export class CheckDisableForbiddenError extends SpecdError {
  /**
   * Diagnostic error code.
   *
   * @returns Stable machine-readable error code
   */
  override get code(): string {
    return 'CHECK_DISABLE_FORBIDDEN'
  }

  /**
   * Creates a CheckDisableForbiddenError.
   *
   * @param checkId - Canonical check identifier
   * @param stepName - Target workflow step name
   */
  constructor(
    public readonly checkId: string,
    public readonly stepName: string,
  ) {
    super(
      `Check '${checkId}' has allowDisable: false and cannot be disabled in workflow step '${stepName}'.`,
    )
    this.name = 'CheckDisableForbiddenError'
  }
}
