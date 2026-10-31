import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Toast } from 'flowbite-react';
import { HiCheck, HiExclamation } from 'react-icons/hi';

type ToastKind = 'success' | 'error';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="fixed bottom-4 left-1/2 z-[100] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2 sm:left-auto sm:right-4 sm:translate-x-0">
        {toasts.map((t) => (
          <Toast key={t.id} className="max-w-none shadow-lg">
            <div
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                t.kind === 'success'
                  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300'
                  : 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300'
              }`}
            >
              {t.kind === 'success' ? <HiCheck className="h-5 w-5" /> : <HiExclamation className="h-5 w-5" />}
            </div>
            <div className="ml-3 text-sm font-medium text-gray-800 dark:text-gray-200">{t.message}</div>
          </Toast>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
