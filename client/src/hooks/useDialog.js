import { useEffect } from 'react';

/**
 * Closes a dialog on Escape and stops the page behind it scrolling.
 *
 * None of the modals handled Escape, so a keyboard user who opened one could
 * only leave by tabbing to the close button — and on the file preview, the
 * page behind kept scrolling under the overlay.
 */
export default function useDialog(isOpen, onClose) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);
}
