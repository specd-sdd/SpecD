import { join } from 'node:path'

/**
 * Abstract base for immutable, validated domain path value objects.
 *
 * Stores a non-empty sequence of path segments and provides the common
 * navigation and comparison operations shared by all concrete path types.
 *
 * Subclasses are responsible for:
 * - Validating and constructing paths via their own static factory methods
 * - Guaranteeing that `segments` is always non-empty
 * - Implementing `_withSegments` to produce new instances of the concrete type
 *
 * @example
 * ```ts
 * class ArchivePath extends DomainPath {
 *   private constructor(segments: readonly string[]) { super(segments) }
 *
 *   protected _withSegments(segments: readonly string[]): this {
 *     return new ArchivePath(segments) as this
 *   }
 *
 *   static parse(path: string): ArchivePath {
 *     // validate and construct...
 *     return new ArchivePath(path.split('/'))
 *   }
 * }
 *
 * const p = ArchivePath.parse('2024/my-feature')
 * p.leaf           // → "my-feature"
 * p.parent         // → ArchivePath("2024")
 * p.child('v2')    // → ArchivePath("2024/my-feature/v2")
 * ```
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

  /**
   * Creates a new instance of the concrete subtype wrapping the given segments.
   *
   * This method exists because `parent` and `child` need to return the same
   * concrete type as the receiver (e.g. `SpecPath.parent` must return a
   * `SpecPath`, not a `DomainPath`), but the base class cannot call a subclass
   * constructor directly — those constructors are private by design.
   *
   * Each subclass implements this as a one-liner that calls its own private
   * constructor. Implementations must NOT re-validate the segments — they are
   * already trusted (they come from the current instance or from `parse`).
   *
   * @example
   * ```ts
   * // In SpecPath:
   * protected _withSegments(segments: readonly string[]): this {
   *   return new SpecPath(segments) as this
   * }
   * ```
   *
   * @param segments - Pre-validated, non-empty array of path segments
   * @returns A new instance of the concrete subtype
   */
  protected abstract _withSegments(segments: readonly string[]): this

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
   * The parent path, or `null` if this is a top-level (single-segment) path.
   *
   * Returns the same concrete type as the receiver.
   *
   * @example `SpecPath.parse("auth/oauth").parent` → `SpecPath("auth")`
   */
  get parent(): this | null {
    if (this._segments.length <= 1) return null
    return this._withSegments(this._segments.slice(0, -1))
  }

  /**
   * Returns a new path with `segment` appended.
   *
   * The base implementation does not validate the segment — subclasses that
   * enforce segment constraints (e.g. `SpecPath`) should override this method
   * and apply their own validation before delegating to `_withSegments`.
   *
   * @param segment - The segment to append
   * @returns A new path one level deeper, of the same concrete type
   */
  child(segment: string): this {
    return this._withSegments([...this._segments, segment])
  }

  /**
   * Returns whether this path is a strict ancestor of `other`.
   *
   * A path is an ancestor of `other` if `other` starts with all of this
   * path's segments and has at least one additional segment.
   *
   * @param other - The path to test against
   * @returns `true` if `other` starts with this path and has more segments
   */
  isAncestorOf(other: DomainPath): boolean {
    if (other._segments.length <= this._segments.length) return false
    return this._segments.every((s, i) => s === other._segments[i])
  }

  /**
   * Returns whether this path is structurally equal to `other`.
   *
   * Equality is determined by string representation.
   *
   * @param other - The path to compare against
   * @returns `true` if both paths have the same string representation
   */
  equals(other: DomainPath): boolean {
    return this.toString() === other.toString()
  }

  /**
   * Returns the canonical slash-separated representation (e.g. `"auth/oauth"`).
   *
   * This is the domain identity of the path — always `'/'`-separated regardless
   * of the host operating system. It is suitable for serialisation, display, and
   * use as a map key, but NOT for filesystem operations on Windows.
   *
   * Infrastructure adapters that need a real filesystem path must use
   * {@link toFsPath} instead of this method.
   *
   * @returns The canonical path string
   */
  toString(): string {
    return this._segments.join('/')
  }

  /**
   * Returns a native filesystem path suitable for disk operations.
   *
   * Uses `node:path`'s `join` so the separator is correct on every platform
   * (`/` on POSIX, `\` on Windows). Use this method — not {@link toString} —
   * whenever you need to pass the path to `fs.*` calls or other OS APIs.
   *
   * @example
   * ```ts
   * // In an infrastructure adapter:
   * const fullPath = path.resolve(root, specPath.toFsPath())
   * await fs.readFile(fullPath, 'utf8')
   * ```
   *
   * @returns The OS-native path string
   */
  toFsPath(): string {
    return join(...this._segments)
  }
}
