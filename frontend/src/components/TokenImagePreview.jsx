// Full-size preview for a token image.
//
// Rendered through a portal on document.body so it is never affected by the
// table's overflow/sticky containers. Opening it does not touch the row: the
// original small icon stays exactly where it is, the row does not resize, and
// nothing scales on hover.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function TokenImagePreview({ token, onClose }) {
  const imageUrl = token?.iconUrl;
  const label = token?.name || token?.symbol || 'Token';

  useEffect(() => {
    if (!imageUrl) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    window.addEventListener('keydown', handleKeyDown);
    // Stop the page behind the overlay from scrolling while it is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [imageUrl, onClose]);

  if (!imageUrl) return null;

  return createPortal(
    <div
      className="token-preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${label} preview`}
      onClick={onClose}
    >
      <div className="token-preview-card" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="token-preview-close"
          onClick={onClose}
          aria-label="Close preview"
        >
          <X className="w-5 h-5" />
        </button>

        <img src={imageUrl} alt={label} className="token-preview-image" />

        <div className="token-preview-meta">
          <p className="token-preview-title">{label}</p>
          {token.symbol ? <p className="token-preview-symbol">{token.symbol}</p> : null}
          {token.address ? (
            <p className="token-preview-address" title={token.address}>
              {token.address}
            </p>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
