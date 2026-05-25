import * as React from 'react'
import { Input } from '../components/ui/input.js'

/** Shared HTML `datalist` id for spec-id autocomplete in scope dialog. */
export const SCOPE_SPEC_SUGGESTIONS_LIST_ID = 'studio-scope-dialog-spec-suggestions'

/**
 * Renders once per dialog; multiple inputs use `list={SCOPE_SPEC_SUGGESTIONS_LIST_ID}`.
 */
export function ScopeSpecSuggestionsDatalist({
  specIds,
}: {
  specIds: readonly string[]
}): React.ReactElement {
  return (
    <datalist id={SCOPE_SPEC_SUGGESTIONS_LIST_ID}>
      {specIds.map((id) => (
        <option key={id} value={id} />
      ))}
    </datalist>
  )
}

export function ScopeSpecIdInput({
  value,
  onChange,
  placeholder,
  disabled,
  onFocus,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  disabled?: boolean
  onFocus?: () => void
  className?: string
}): React.ReactElement {
  return (
    <Input
      className={className ? `font-mono ${className}` : 'font-mono'}
      list={SCOPE_SPEC_SUGGESTIONS_LIST_ID}
      placeholder={placeholder}
      value={value}
      disabled={disabled}
      onFocus={onFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
