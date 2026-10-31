import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HiX } from 'react-icons/hi';

/**
 * A panel that slides in from the right (full screen on phones) or up from the bottom.
 */
export default function Sheet({
  open,
  onClose,
  title,
  side = 'right',
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  side?: 'right' | 'bottom';
  children: ReactNode;
  footer?: ReactNode;
}) {
  // Keep mounted during the closing animation.
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), 200);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!mounted) return null;

  const panel =
    side === 'right'
      ? `inset-y-0 right-0 w-full sm:max-w-xl ${visible ? 'translate-x-0' : 'translate-x-full'}`
      : `inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)] ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`;

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div
        className={`absolute inset-0 bg-gray-900/50 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`absolute flex flex-col bg-white shadow-xl transition-transform duration-200 ease-out dark:bg-gray-800 ${panel}`}
      >
        {side === 'bottom' && <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />}
        {(title || side === 'right') && (
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-700">
            <div className="min-w-0 text-lg font-semibold text-gray-900 dark:text-white">{title}</div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-700 dark:hover:text-white"
            >
              <HiX className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <div className="border-t border-gray-100 px-5 py-3 dark:border-gray-700">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
