import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when a bundle UI plugin has no built `index.html` under its static root.
 */
export class UiPluginBundleMissingError extends SpecdError {
  private readonly _staticRoot: string

  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'UI_PLUGIN_BUNDLE_MISSING'
  }

  /** Absolute path that was expected to contain `index.html`. */
  get staticRoot(): string {
    return this._staticRoot
  }

  /**
   * Creates a {@link UiPluginBundleMissingError}.
   *
   * @param staticRoot - Directory checked for `index.html`.
   */
  constructor(staticRoot: string) {
    super(
      `Studio UI bundle missing at ${staticRoot}/index.html. Run: pnpm --filter @specd/studio-web build`,
    )
    this._staticRoot = staticRoot
  }
}
