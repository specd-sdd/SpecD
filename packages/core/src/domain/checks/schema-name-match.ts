import {
  CHECK_LABELS,
  fail,
  pass,
  type Check,
  type CheckExecutionContext,
  type CheckResult,
} from '../services/transition-checks.js'

/** Facts for `schema.nameMatch`. */
export interface SchemaNameMatchFacts {
  readonly schemaName: string
  readonly changeSchemaName: string
  readonly changeName?: string
}

/**
 * `schema.nameMatch` runner. Archive (or later reuse) is a registry binding.
 *
 * @param facts - Active vs recorded schema names
 * @returns Check result
 */
export function runSchemaNameMatch(facts: SchemaNameMatchFacts): CheckResult {
  if (facts.schemaName === facts.changeSchemaName) {
    return pass('schema.nameMatch')
  }
  return fail(
    'schema.nameMatch',
    'SCHEMA_MISMATCH',
    `Schema '${facts.schemaName}' does not match change schema '${facts.changeSchemaName}'`,
    {
      ...(facts.changeName !== undefined ? { changeName: facts.changeName } : {}),
      changeSchemaName: facts.changeSchemaName,
      schemaName: facts.schemaName,
    },
  )
}

/**
 * Predicate body.
 *
 * @param facts - Active vs recorded schema names
 * @returns Check result
 */
export function run(facts: SchemaNameMatchFacts): CheckResult {
  return runSchemaNameMatch(facts)
}

/**
 * Domain stub execute. Application `create*` owns I/O.
 *
 * @param ctx - Host attempt context
 * @returns Check result
 */
function execute(ctx: CheckExecutionContext): Promise<CheckResult> {
  return Promise.resolve(
    run({
      schemaName: ctx.schema.name(),
      changeSchemaName: ctx.change.schemaName,
      changeName: ctx.change.name,
    }),
  )
}

/** Reusable `schema.nameMatch` check. */
export const schemaNameMatch: Check = {
  id: 'schema.nameMatch',
  label: CHECK_LABELS['schema.nameMatch'],
  kind: 'predicate',
  execute,
}
