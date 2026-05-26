import { SpecdError } from '../../domain/errors/specd-error.js'

/**
 * Thrown when `specd ui serve` runs but `specd.yaml` has no `plugins.ui` entry.
 */
export class UiPluginNotConfiguredError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'UI_PLUGIN_NOT_CONFIGURED'
  }

  /** Creates a new {@link UiPluginNotConfiguredError}. */
  constructor() {
    super(
      'No UI plugin configured. Run: specd plugins install @specd/plugin-ui-studio (embedded Studio) or specd plugins install @specd/studio-web (Vite dev).',
    )
  }
}
