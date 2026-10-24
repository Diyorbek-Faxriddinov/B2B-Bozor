import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { MotionConfig } from 'motion/react';
import { queryClient } from '@/api/hooks';
import { router } from '@/app/router';
import { bindSettingsToDocument, resolveDark, useSettings } from '@/stores/settings';
import { ConfirmProvider } from '@/components/ui/overlay';
import './index.css';

bindSettingsToDocument();

function ThemedToaster() {
  const theme = useSettings((s) => s.theme);
  return <Toaster position="top-right" richColors closeButton theme={resolveDark(theme) ? 'dark' : 'light'} toastOptions={{ className: 'font-sans' }} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
        <ThemedToaster />
      </QueryClientProvider>
    </MotionConfig>
  </StrictMode>,
);
