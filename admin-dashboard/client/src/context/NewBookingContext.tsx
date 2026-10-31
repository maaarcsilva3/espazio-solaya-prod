import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import RequestFormModal from '../components/RequestFormModal';

const NewBookingContext = createContext<(date?: string) => void>(() => undefined);

export function NewBookingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; date?: string }>({ open: false });
  const open = useCallback((date?: string) => setState({ open: true, date }), []);

  return (
    <NewBookingContext.Provider value={open}>
      {children}
      <RequestFormModal
        open={state.open}
        request={null}
        defaultDate={state.date}
        onClose={() => setState((s) => ({ ...s, open: false }))}
      />
    </NewBookingContext.Provider>
  );
}

/** Opens the "Add booking" form, optionally starting on a given date (YYYY-MM-DD). */
export function useNewBooking() {
  return useContext(NewBookingContext);
}
