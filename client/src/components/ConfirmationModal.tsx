interface ConfirmationModalProps {
  eyebrow: string
  title: string
  message: string
  cancelLabel?: string
  confirmLabel: string
  confirmTone?: 'primary' | 'danger'
  disabled?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmationModal({
  eyebrow,
  title,
  message,
  cancelLabel = 'Cancel',
  confirmLabel,
  confirmTone = 'primary',
  disabled = false,
  onCancel,
  onConfirm,
}: ConfirmationModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="confirmation-modal premium-card" role="dialog" aria-modal="true" aria-labelledby="confirmation-modal-title">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id="confirmation-modal-title">{title}</h2>
        </div>
        <p className="panel-copy">{message}</p>
        <div className="modal-actions">
          <button type="button" className="button ghost" onClick={onCancel} disabled={disabled}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`button ${confirmTone === 'danger' ? 'danger' : 'primary'}`}
            onClick={onConfirm}
            disabled={disabled}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
