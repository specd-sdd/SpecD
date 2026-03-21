import { type ChangeState, VALID_TRANSITIONS } from '../../domain/value-objects/change-state.js'
import { StepNotValidError } from '../../domain/errors/step-not-valid-error.js'
import { HookNotFoundError } from '../../domain/errors/hook-not-found-error.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { type TemplateExpander } from '../template-expander.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'
import { SchemaMismatchError } from '../errors/schema-mismatch-error.js'

/** Valid `ChangeState` values for step validation. */
const CHANGE_STATES = Object.keys(VALID_TRANSITIONS) as ChangeState[]

/** Input for the {@link GetHookInstructions} use case. */
export interface GetHookInstructionsInput {
  readonly name: string
  readonly step: string
  readonly phase: 'pre' | 'post'
  readonly only?: string | undefined
}

/** Result returned by {@link GetHookInstructions}. */
export interface GetHookInstructionsResult {
  readonly phase: 'pre' | 'post'
  readonly instructions: readonly { readonly id: string; readonly text: string }[]
}

/**
 * Returns instruction text for `instruction:` hooks at a given step and phase.
 *
 * Read-only — never executes commands or modifies state.
 */
export class GetHookInstructions {
  private readonly _changes: ChangeRepository
  private readonly _schemaProvider: SchemaProvider
  private readonly _templates: TemplateExpander

  /**
   * Creates a new `GetHookInstructions` use case.
   *
   * @param changes - Repository for loading change entities
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param templates - Template expander for variable substitution
   */
  constructor(
    changes: ChangeRepository,
    schemaProvider: SchemaProvider,
    templates: TemplateExpander,
  ) {
    this._changes = changes
    this._schemaProvider = schemaProvider
    this._templates = templates
  }

  /**
   * Returns instruction text for `instruction:` hooks at the given step and phase.
   *
   * @param input - The step name, phase, and optional hook filter
   * @returns The phase and collected instruction texts
   */
  async execute(input: GetHookInstructionsInput): Promise<GetHookInstructionsResult> {
    const change = await this._changes.get(input.name)
    if (change === null) throw new ChangeNotFoundError(input.name)

    const schema = await this._schemaProvider.get()
    if (schema === null) throw new SchemaNotFoundError('(provider)')

    if (schema.name() !== change.schemaName) {
      throw new SchemaMismatchError(change.name, change.schemaName, schema.name())
    }

    if (!(CHANGE_STATES as string[]).includes(input.step)) {
      throw new StepNotValidError(input.step)
    }

    const workflowStep = schema.workflowStep(input.step)
    if (workflowStep === null) {
      return { phase: input.phase, instructions: [] }
    }

    // Collect schema hooks filtered to instruction: type
    const schemaHooks = workflowStep.hooks[input.phase]
    let instrHooks = schemaHooks.filter((h) => h.type === 'instruction')

    // --only filter
    if (input.only !== undefined) {
      const match = instrHooks.find((h) => h.id === input.only)
      if (match === undefined) {
        const runMatch = schemaHooks.find((h) => h.id === input.only && h.type === 'run')
        if (runMatch !== undefined) {
          throw new HookNotFoundError(input.only, 'wrong-type')
        }
        throw new HookNotFoundError(input.only, 'not-found')
      }
      instrHooks = [match]
    }

    if (instrHooks.length === 0) {
      return { phase: input.phase, instructions: [] }
    }

    // Build contextual variables for template expansion
    const workspace = change.workspaces[0] ?? 'default'
    const contextVars = {
      change: { name: change.name, workspace, path: this._changes.changePath(change) },
    }

    const instructions = instrHooks.map((h) => ({
      id: h.id,
      text: this._templates.expand(h.text, contextVars),
    }))

    return { phase: input.phase, instructions }
  }
}
