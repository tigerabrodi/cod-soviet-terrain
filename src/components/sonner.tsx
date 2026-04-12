import { Toaster as SonnerToaster } from 'sonner'

// CUSTOMIZE: Replace the LoadingSpinner with your own or remove to use Sonner's default
function LoadingSpinner() {
  return (
    <svg
      className="animate-spin"
      fill="none"
      height="18"
      viewBox="0 0 18 18"
      width="18"
    >
      <circle cx="9" cy="9" r="7" stroke="var(--color-border)" strokeWidth="2" />
      <path
        d="M9 2a7 7 0 0 1 7 7"
        stroke="var(--color-accent)"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  )
}

/**
 * CUSTOMIZE: This Toaster uses unstyled mode — you own all the styling.
 *
 * Key things to customize:
 * - Toast width, background, border colors in `classNames.toast`
 * - Variant rail colors (border-l) in `classNames.success/error/info`
 * - Action/cancel button styles in `classNames.actionButton/cancelButton`
 * - Position, gap, visible count as props on SonnerToaster
 * - Animation speed in app.css (search for `--toast-animation-duration`)
 */
export function Toaster() {
  return (
    <SonnerToaster
      theme="dark"
      position="top-right"
      visibleToasts={5}
      gap={8}
      icons={{ loading: <LoadingSpinner /> }}
      toastOptions={{
        unstyled: true,
        classNames: {
          // CUSTOMIZE: Base toast container
          toast:
            'flex items-center gap-3 w-[356px] rounded-xl border border-border bg-surface px-4 py-3.5 shadow-lg',
          title: 'text-[13px] font-semibold text-text-primary',
          description: 'text-[11px] text-text-muted',

          // CUSTOMIZE: Action & cancel button styles
          actionButton:
            'text-[11px] font-semibold px-3 py-1.5 rounded-md bg-accent/15 text-accent hover:bg-accent/25 transition-colors',
          cancelButton:
            'text-[11px] font-medium text-text-muted hover:text-text-secondary transition-colors',
          closeButton:
            'text-text-muted hover:text-text-secondary transition-colors',

          // CUSTOMIZE: Per-variant left rail colors and icon colors
          success:
            'border-l-[3px] !border-l-green-500 [&_[data-icon]]:text-green-500',
          info: 'border-l-[3px] !border-l-blue-500 [&_[data-icon]]:text-blue-500',
          error:
            'border-l-[3px] !border-l-red-500 [&_[data-icon]]:text-red-500',
        },
      }}
    />
  )
}
