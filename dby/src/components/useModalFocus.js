import { useEffect, useRef } from 'react';

// Keep keyboard focus inside an open overlay and restore it to its trigger.
export default function useModalFocus(open, onClose, canClose = true) {
  const ref = useRef(null);
  const options = useRef({ onClose, canClose });
  useEffect(() => { options.current = { onClose, canClose }; }, [onClose, canClose]);
  useEffect(() => {
    const panel = ref.current;
    if (!open || !panel) return;
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const hidden = [];
    // Disable background interaction, including screen-reader navigation.
    for (let node = panel; node.parentElement && node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling === node || sibling.hasAttribute('data-modal-backdrop') || ['SCRIPT', 'STYLE'].includes(sibling.tagName)) continue;
        hidden.push([sibling, sibling.inert]);
        sibling.inert = true;
      }
    }
    const focusable = () => [...panel.querySelectorAll('a[href],button,input,select,textarea,iframe,[tabindex]')]
      .filter(node => node.tabIndex >= 0 && !node.disabled && !node.closest('[inert]') && node.getClientRects().length);
    const focusFirst = () => (focusable()[0] || panel).focus({ preventScroll: true });
    focusFirst();
    const keydown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (options.current.canClose) options.current.onClose();
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (!first) { event.preventDefault(); panel.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) {
        event.preventDefault(); first.focus();
      }
    };
    const focusin = event => { if (!panel.contains(event.target)) focusFirst(); };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', focusin);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', focusin);
      hidden.forEach(([node, inert]) => { node.inert = inert; });
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [open]);
  return ref;
}
