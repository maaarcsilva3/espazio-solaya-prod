import type { ReactNode } from 'react';
import { Button, Modal, type CustomFlowbiteTheme } from 'flowbite-react';
import { HiExclamation } from 'react-icons/hi';

// Small confirmations stay a centered card on phones instead of going full screen.
const compactTheme: CustomFlowbiteTheme['modal'] = {
  content: {
    base: 'relative w-full p-4',
    inner: 'relative flex max-h-[90dvh] flex-col rounded-xl bg-white shadow-xl dark:bg-gray-800',
  },
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  confirmDisabled,
  loading,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal show={open} size="md" onClose={onClose} theme={compactTheme} dismissible>
      <Modal.Body className="px-6 pb-4 pt-6">
        <div className="flex gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400">
            <HiExclamation className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
            <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">{message}</div>
            {children && <div className="mt-4">{children}</div>}
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer className="justify-end border-t-0 bg-gray-50 dark:bg-gray-800/60 sm:rounded-b-xl">
        <Button color="secondary" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button color="danger" onClick={onConfirm} isProcessing={loading} disabled={loading || confirmDisabled}>
          {confirmLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
