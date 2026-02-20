/**
 * Abstract base for immutable, validated domain path value objects.
 *
 * Stores a non-empty sequence of path segments and provides the common
 * read operations shared by all concrete path types (`SpecPath`, etc.).
 *
 * Subclasses are responsible for:
 * - Validating and constructing paths via their own static factory methods
 * - Guaranteeing that the `segments` array is always non-empty
 * - Throwing domain-specific errors for invalid input
 */
export abstract class DomainPath {
  /** The validated, non-empty sequence of path segments. */
  protected readonly _segments: readonly string[]

  /**
   * Stores the pre-validated segments. Must only be called from subclass
   * static factory methods after validation.
   *
   * @param segments - Non-empty, pre-validated array of path segments
   */
  protected constructor(segments: readonly string[]) {
    this._segments = segments
  }

  /** The individual path segments (e.g. `["auth", "oauth"]`). */
  get segments(): readonly string[] {
    return this._segments
  }

  /**
   * The last segment of the path (e.g. `"oauth"` for `"auth/oauth"`).
   *
   * Safe to call without null-check — subclasses guarantee non-empty segments.
   */
  get leaf(): string {
    // segments is guaranteed non-empty by subclass constructors
    return this._segments[this._segments.length - 1] as string
  }

  /**
   * Returns whether this path is structurally equal to `other`.
   *
   * Equality is determined by string representation, so two paths are equal
   * if and only if they resolve to the same slash-separated string.
   *
   * @param other - The path to compare against
   * @returns `true` if both paths have the same string representation
   */
  equals(other: DomainPath): boolean {
    return this.toString() === other.toString()
  }

  /**
   * Returns the slash-separated string representation (e.g. `"auth/oauth"`).
   *
   * @returns The path as a string
   */
  toString(): string {
    return this._segments.join('/')
  }
}
