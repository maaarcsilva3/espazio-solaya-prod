import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Flowbite } from 'flowbite-react';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import { theme } from './theme';
import { ROUTER_BASENAME } from './lib/basePath';
import '@fontsource-variable/inter';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <Flowbite theme={{ theme }}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter basename={ROUTER_BASENAME}>
            <ToastProvider>
              <AuthProvider>
                <App />
              </AuthProvider>
            </ToastProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </Flowbite>
    </ThemeProvider>
  </React.StrictMode>,
);
