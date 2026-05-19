import { useEffect } from 'react';

export default function Modal({ open, onClose, title, children, width = 480, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modal-shell" style={{ width }}>
        {title && (
          <div className="modal-head">
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>{title}</h2>
            <button onClick={onClose} className="icon-btn" aria-label="Cerrar">✕</button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmModal({ open, onClose, onConfirm, title = '¿Estás seguro?', message, confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false, loading = false }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={400}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>{cancelText}</button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <span className="spin" style={{ width: 14, height: 14 }} /> : confirmText}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--text2)', lineHeight: 1.6 }}>{message}</p>
    </Modal>
  );
}
