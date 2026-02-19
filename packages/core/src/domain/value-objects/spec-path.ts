import { InvalidSpecPathError } from '../errors/invalid-spec-path-error.js'

export class SpecPath {
  private readonly _segments: readonly string[]

  private constructor(segments: readonly string[]) {
    this._segments = segments
  }

  static parse(path: string): SpecPath {
    const trimmed = path.trim()
    if (trimmed === '') throw new InvalidSpecPathError('path cannot be empty')

    const segments = trimmed.split('/').filter((s) => s.length > 0)
    if (segments.length === 0) throw new InvalidSpecPathError('path cannot be empty')

    for (const segment of segments) {
      if (segment === '.' || segment === '..') {
        throw new InvalidSpecPathError(`segment '${segment}' is not allowed`)
      }
      if (/[\\:*?"<>|]/.test(segment)) {
        throw new InvalidSpecPathError(`segment '${segment}' contains invalid characters`)
      }
    }

    return new SpecPath(segments)
  }

  static fromSegments(segments: readonly string[]): SpecPath {
    if (segments.length === 0) throw new InvalidSpecPathError('segments cannot be empty')
    return new SpecPath(segments)
  }

  get segments(): readonly string[] {
    return this._segments
  }

  get parent(): SpecPath | null {
    if (this._segments.length <= 1) return null
    return new SpecPath(this._segments.slice(0, -1))
  }

  get leaf(): string {
    const last = this._segments[this._segments.length - 1]
    // segments is guaranteed non-empty by constructor
    return last as string
  }

  child(segment: string): SpecPath {
    return SpecPath.parse(`${this.toString()}/${segment}`)
  }

  isAncestorOf(other: SpecPath): boolean {
    if (other._segments.length <= this._segments.length) return false
    return this._segments.every((s, i) => s === other._segments[i])
  }

  equals(other: SpecPath): boolean {
    return this.toString() === other.toString()
  }

  toString(): string {
    return this._segments.join('/')
  }
}
