/** A primitive value accepted by the isolated graph-index JSON boundary. */
export type GraphIndexJsonPrimitive = null | boolean | number | string

/**
 * The recursive JSON model transported between an isolated graph-index host and child.
 *
 * Generic task types intentionally remain unconstrained: runtime validation is the
 * authority because ordinary readonly result interfaces have no string index signature.
 */
export type GraphIndexJsonValue =
  | GraphIndexJsonPrimitive
  | readonly GraphIndexJsonValue[]
  | { readonly [key: string]: GraphIndexJsonValue }

/** Emits a presentation-neutral task progress value. */
export type GraphIndexTaskProgressEmitter<TProgress> = (progress: TProgress) => void

/**
 * Async entrypoint a trusted graph-index task module must export as `runGraphIndexTask`.
 */
export type GraphIndexTask<TInput, TProgress, TResult> = (
  input: TInput,
  emitProgress: GraphIndexTaskProgressEmitter<TProgress>,
) => Promise<TResult>

/** Host-facing input for one isolated graph-index execution. */
export interface RunIsolatedGraphIndexInput<TInput, TProgress> {
  /** Graph storage root used to derive the exclusive index lock. */
  readonly storageRoot: string
  /** Absolute filesystem path or `file:` URL for a trusted installed task module. */
  readonly taskModule: URL | string
  /** JSON-serializable input passed unchanged to the task. */
  readonly taskInput: TInput
  /** Optional presentation-neutral progress receiver. */
  readonly onProgress?: (progress: TProgress) => void
}

/** Application port for process-isolated graph-index task execution. */
export interface IsolatedGraphIndexRunner {
  /** Runs a trusted task and resolves with its JSON-serializable result. */
  run<TInput = GraphIndexJsonValue, TProgress = GraphIndexJsonValue, TResult = GraphIndexJsonValue>(
    input: RunIsolatedGraphIndexInput<TInput, TProgress>,
  ): Promise<TResult>
}
