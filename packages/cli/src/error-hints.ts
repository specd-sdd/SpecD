/** Canonical CLI command identifiers used to select command-appropriate error hints. */
export type CliCommandId =
  | 'specs.generate-metadata'
  | 'specs.validate'
  | 'specs.deps'
  | 'change.invalidate'
  | 'change.transition'
  | 'change.draft'
  | 'change.discard'
  | 'change.archive'
  | 'change.deps'

/** Reusable semantic hint identifiers rendered by the CLI presentation layer. */
export type CliHintId =
  | 'force.overwrite-deps'
  | 'deps.repair-or-force-generate'
  | 'force.bypass-impl-guard'
  | 'force.revoke-consent'
  | 'transition.explicit-step'
  | 'spec.show-canonical'
  | 'lock.repair-deps'
  | 'deps.operation-flags'
  | 'invalidate.target-flags'
  | 'checks.skip-impl-links-in-scope'
  | 'checks.skip-hooks-instead'

/** Context passed by CLI command handlers when resolving an error hint. */
export interface CliHintContext {
  /** Invoked CLI command identifier. */
  readonly command?: CliCommandId
  /** Backward-compatible opt-in for `specs deps` lock repair hints. */
  readonly lockRepairHint?: boolean
}

/** Structured error metadata used by hint formatters and rule predicates. */
export type CliHintMetadata = Readonly<Record<string, unknown>>

/** Declarative rule mapping an error code, optional command scope, and predicate to a hint ID. */
export interface CliHintRule {
  /** Machine-readable error or check code (e.g. `DEPENDS_ON_OVERWRITE` or `impl.linksInScope`). */
  readonly code: string
  /** Optional command whitelist; omitted means the rule applies to any CLI command. */
  readonly commands?: readonly CliCommandId[]
  /** Optional runtime predicate evaluated against command context and error metadata. */
  readonly when?: (context: CliHintContext, metadata: CliHintMetadata) => boolean
  /** Reusable hint template identifier in {@link CLI_ERROR_HINTS}. */
  readonly hintId: CliHintId
}

/**
 * Checks whether an invalid-lock `fieldPath` targets `dependsOn` or one of its entries.
 *
 * @param fieldPath - Metadata `fieldPath` value from `InvalidSpecLockError`
 * @returns `true` when the failing lock field is under `dependsOn`
 */
function isDependsOnFieldPath(fieldPath: unknown): boolean {
  return (
    typeof fieldPath === 'string' &&
    (fieldPath === 'dependsOn' || fieldPath.startsWith('dependsOn.'))
  )
}

/**
 * Catalog of reusable CLI error hint formatters keyed by {@link CliHintId}.
 */
export const CLI_ERROR_HINTS: Readonly<
  Record<CliHintId, (metadata: CliHintMetadata) => string | undefined>
> = {
  'force.overwrite-deps': () => 'Re-run with --force to overwrite curated dependsOn entries',
  'deps.repair-or-force-generate': () =>
    'Repair with: specd specs deps add <spec-id> / specd specs deps set <spec-id>, or re-run specd specs generate-metadata --force',
  'force.bypass-impl-guard': () => 'Re-run with --force to proceed anyway',
  'force.revoke-consent': () => 'Re-run with --force to revoke the affected approval gate(s)',
  'transition.explicit-step': () =>
    'Specify an explicit target <step> instead of --next, or check available transitions with: specd changes status <name>',
  'spec.show-canonical': (metadata) => {
    const rawSpecId = typeof metadata.specId === 'string' ? metadata.specId.trim() : ''
    const specId = rawSpecId.length > 0 ? rawSpecId : '<spec-path>'
    return `Run: specd specs show ${specId} to view the canonical spec`
  },
  'lock.repair-deps': () =>
    'Repair with: specd specs deps remove <spec-id>, specd specs deps set <spec-id>, or specd specs deps clear <spec-id>',
  'deps.operation-flags': () =>
    'Use one of --add, --remove, --set, or --clear (--set and --clear cannot be combined with --add or --remove)',
  'invalidate.target-flags': () =>
    'Pass --target <spec-id> when targeting spec-scoped artifacts, or omit --target for global/none policies',
  'checks.skip-impl-links-in-scope': () =>
    'Re-run with --skip-checks impl.linksInScope (or --allow-out-of-scope) if intentional',
  'checks.skip-hooks-instead': () =>
    'Use --skip-hooks <phases> instead of --skip-checks for hook checks',
}

/**
 * Declarative routing table mapping `(code, context, metadata)` to a reusable {@link CliHintId}.
 */
export const CLI_ERROR_HINT_RULES: readonly CliHintRule[] = [
  {
    code: 'DEPENDS_ON_OVERWRITE',
    commands: ['specs.generate-metadata'],
    hintId: 'force.overwrite-deps',
  },
  {
    code: 'DEPENDS_ON_OVERWRITE',
    commands: ['specs.validate'],
    hintId: 'deps.repair-or-force-generate',
  },
  {
    code: 'IMPLEMENTATION_DETECTED',
    commands: ['change.draft', 'change.discard'],
    hintId: 'force.bypass-impl-guard',
  },
  {
    code: 'INVALIDATE_REQUIRES_FORCE',
    commands: ['change.invalidate'],
    hintId: 'force.revoke-consent',
  },
  {
    code: 'HAPPY_PATH_NEXT_UNAVAILABLE',
    commands: ['change.transition'],
    hintId: 'transition.explicit-step',
  },
  {
    code: 'SPEC_NOT_IN_CHANGE',
    hintId: 'spec.show-canonical',
  },
  {
    code: 'INVALID_SPEC_LOCK',
    when: (context, metadata) =>
      (context.lockRepairHint === true || context.command === 'specs.deps') &&
      isDependsOnFieldPath(metadata.fieldPath),
    hintId: 'lock.repair-deps',
  },
  {
    code: 'INVALID_INPUT',
    commands: ['change.deps'],
    hintId: 'deps.operation-flags',
  },
  {
    code: 'INVALID_INVALIDATE_TARGET',
    commands: ['change.invalidate'],
    hintId: 'invalidate.target-flags',
  },
  {
    code: 'INVALID_INPUT',
    commands: ['change.invalidate'],
    hintId: 'invalidate.target-flags',
  },
  {
    code: 'impl.linksInScope',
    commands: ['change.transition', 'change.archive'],
    when: (_context, metadata) => metadata.isSkippable === true,
    hintId: 'checks.skip-impl-links-in-scope',
  },
  {
    code: 'CHECK_NOT_SKIPPABLE',
    commands: ['change.transition', 'change.archive'],
    when: (_context, metadata) =>
      typeof metadata.checkId === 'string' && metadata.checkId.startsWith('hook.'),
    hintId: 'checks.skip-hooks-instead',
  },
]

/**
 * Resolves a command-aware CLI repair hint for a core error or check code.
 *
 * @param code - Machine-readable error or check code
 * @param context - Invoked CLI command context
 * @param metadata - Structured error or check metadata
 * @returns Rendered CLI hint string, or `undefined` when no rule matches
 */
export function resolveCliErrorHint(
  code: string,
  context: CliHintContext = {},
  metadata: CliHintMetadata = {},
): string | undefined {
  for (const rule of CLI_ERROR_HINT_RULES) {
    if (rule.code !== code) continue
    if (rule.commands !== undefined) {
      if (context.command === undefined || !rule.commands.includes(context.command)) continue
    }
    if (rule.when !== undefined && !rule.when(context, metadata)) continue
    return CLI_ERROR_HINTS[rule.hintId](metadata)
  }
  return undefined
}
