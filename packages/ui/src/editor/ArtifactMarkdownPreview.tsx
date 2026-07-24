import * as React from 'react'
import { StudioMarkdownPreview } from './StudioMarkdownPreview.js'

/**
 * Renders markdown artifact content for inspector Preview mode.
 */
export function ArtifactMarkdownPreview({
  content,
}: {
  content: string
}): React.ReactElement {
  if (!content.trim()) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">
        (empty)
      </div>
    )
  }

  return (
    <div className="studio-scrollbar h-full overflow-y-auto p-4">
      <StudioMarkdownPreview content={content} />
    </div>
  )
}
