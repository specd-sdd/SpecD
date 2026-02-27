import { type HookRunner } from '../application/ports/hook-runner.js'
import { NodeHookRunner } from '../infrastructure/node/hook-runner.js'

/**
 * Discriminated union of all supported `HookRunner` adapter configurations.
 */
export type CreateHookRunnerConfig = {
  /** Adapter type discriminant. */
  readonly type: 'node'
}

/**
 * Constructs a `HookRunner` implementation for the given adapter type.
 *
 * Returns the abstract `HookRunner` port type — callers never see the
 * concrete class.
 *
 * @param config - Discriminated union config identifying the adapter type
 * @returns A fully constructed `HookRunner`
 */
export function createHookRunner(config: CreateHookRunnerConfig): HookRunner {
  switch (config.type) {
    case 'node':
      return new NodeHookRunner()
  }
}
