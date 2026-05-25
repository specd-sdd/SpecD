import * as React from 'react'

type StudioErrorBoundaryProps = {
  children: React.ReactNode
}

type StudioErrorBoundaryState = {
  error: Error | undefined
}

/** Catches render errors so the shell does not go fully blank. */
export class StudioErrorBoundary extends React.Component<
  StudioErrorBoundaryProps,
  StudioErrorBoundaryState
> {
  override state: StudioErrorBoundaryState = { error: undefined }

  static getDerivedStateFromError(error: Error): StudioErrorBoundaryState {
    return { error }
  }

  override render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background p-6 text-xs">
          <p className="font-medium text-destructive">Studio crashed</p>
          <pre className="max-w-lg overflow-auto rounded border border-border bg-panel p-3 font-mono text-muted-foreground">
            {this.state.error.message}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}
