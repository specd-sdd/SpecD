/** Port for computing content hashes. */
export abstract class ContentHasher {
  /** Compute a deterministic hash of the given content. Returns `algorithm:hex` format. */
  abstract hash(content: string): string
}
