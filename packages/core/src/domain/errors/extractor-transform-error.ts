import { SpecdError } from './specd-error.js'

/**
 * Typed extraction failure raised when transform lookup or execution fails.
 */
export class ExtractorTransformError extends SpecdError {
  private readonly _transformName: string
  private readonly _extractorOwner: 'extractor' | 'field'
  private readonly _fieldName: string | undefined

  /** Registered transform name that failed. */
  get transformName(): string {
    return this._transformName
  }

  /** Whether the failure happened on the extractor or a field mapping. */
  get extractorOwner(): 'extractor' | 'field' {
    return this._extractorOwner
  }

  /** Field name when the failure happened on a `FieldMapping.transform`. */
  get fieldName(): string | undefined {
    return this._fieldName
  }

  /**
   * Machine-readable error code.
   *
   * @returns The stable extractor transform failure code
   */
  get code(): string {
    return 'EXTRACTOR_TRANSFORM_ERROR'
  }

  /**
   * Creates a new extractor transform failure.
   *
   * @param transformName - Registered transform name that failed
   * @param extractorOwner - Whether the failure happened on the extractor or a field
   * @param message - Human-readable error message
   * @param options - Optional field metadata and original cause
   * @param options.fieldName - Field name when the failure belongs to a field transform
   * @param options.cause - Original callback failure being wrapped
   */
  constructor(
    transformName: string,
    extractorOwner: 'extractor' | 'field',
    message: string,
    options?: {
      fieldName?: string
      cause?: unknown
    },
  ) {
    super(message)
    this._transformName = transformName
    this._extractorOwner = extractorOwner
    this._fieldName = options?.fieldName
    if (options?.cause !== undefined) {
      this.cause = options.cause
    }
  }
}
