# Main Window Manager

## Purpose

Electron desktop host concern — **Main Window Manager**. Local mode runs `createKernel` in the main process and exposes IPC-backed ports; remote mode reuses the HTTP client stack. Create and manage the primary Electron `BrowserWindow` hosting the Studio renderer.

## Requirements

### Requirement: window title reflects the active project or connection

When a local project is open, the title MUST include the project name; for remote-only sessions, the title MUST include the API host or profile label.

### Requirement: window close prompts when dirty editors exist

If the artifact editor has unsaved buffers, closing the window MUST prompt the user before discarding (delegate to UI state).

### Requirement: main window uses integrated custom titlebar on desktop

The primary `BrowserWindow` MUST use platform-appropriate custom titlebar settings:

- **macOS**: `titleBarStyle: 'hiddenInset'` with `trafficLightPosition` vertically
  centered in the ~44px titlebar and horizontally leaving room for the renderer
  traffic-light slot and sidebar-toggle control after the semaphores.
- **Windows**: `titleBarOverlay` with height matching Studio titlebar (**44px**) so
  native minimize/maximize/close render in the right safe zone.

The main process MUST expose the host `platform` (`darwin`, `win32`, `linux`) to the
renderer (preload bridge) so `@specd/ui` can apply safe-area CSS without Node APIs in
the renderer.

The renderer titlebar region MUST use `-webkit-app-region: drag` for the draggable
area; interactive controls MUST use `-webkit-app-region: no-drag`.

## Spec Dependencies

- [`client:specd-data-port`](../../../../../../specs/client/specd-data-port/spec.md) — IPC data contract implemented by the desktop adapter
