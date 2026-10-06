import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const PREVIEW_SIZE = 150;
const VIEWPORT_MARGIN = 8;

/**
 * Hover preview for a token icon.
 *
 * A floating, non-modal image rendered next to the hovered/focused icon: it
 * never dims or blurs the page, never locks body scroll and never shifts the
 * table (position: fixed, portal to <body>). It sits flush against the icon so
 * the pointer can travel from icon to preview without crossing a dead zone,
 * and flips to the left side when the right edge of the viewport is reached.
 * It is kept inside the viewport at all times and sits above the sticky DEX
 * menu and table header (z 80).
 *
 * Closes when the pointer leaves both the icon and the preview, on blur of the
 * icon, or on Escape.
 */
export default function TokenImagePreview({ token, anchorRef, onPointerEnter, onPointerLeave, onClose }) {
  const [position, setPosition] = useState(null);
  const imageUrl = token?.iconUrl;
  const label = token?.name || token?.symbol || 'Token';

  useLayoutEffect(() => {
    const anchor = anchorRef?.current;
    if (!anchor) return undefined;

    const update = () => {
      const rect = anchor.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;

      // Flush against the icon's edge (2px overlap) so the hover never breaks
      // while the pointer moves from the icon onto the preview.
      const overlap = 2;
      let left = rect.right - overlap;

      if (left + PREVIEW_SIZE + VIEWPORT_MARGIN > window.innerWidth) {
        left = rect.left - PREVIEW_SIZE + overlap;
      }

      left = Math.max(
        VIEWPORT_MARGIN,
        Math.min(left, window.innerWidth - PREVIEW_SIZE - VIEWPORT_MARGIN),
      );

      const top = rect.top + rect.height / 2 - PREVIEW_SIZE / 2;
      const clampedTop = Math.max(
        VIEWPORT_MARGIN,
        Math.min(top, window.innerHeight - PREVIEW_SIZE - VIEWPORT_MARGIN),
      );

      setPosition({ left, top: clampedTop });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef, imageUrl]);

  useEffect(() => {
    if (!imageUrl) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [imageUrl, onClose]);

  if (!imageUrl || !position) return null;

  return createPortal(
    <div
      role="tooltip"
      aria-label={`${label} preview`}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className="token-preview-float"
      style={{ top: position.top, left: position.left, zIndex: 80 }}
    >
      <img src={imageUrl} alt={label} className="token-preview-float-image" />
    </div>,
    document.body,
  );
}