import { isRouteErrorResponse, useRouteError } from 'react-router';
import { AlertTriangle } from 'lucide-react';
import { useT } from '@/i18n';
import { Button } from '@/components/ui/button';

export function RouteError() {
  const t = useT();
  const err = useRouteError();
  const isChunk = err instanceof Error && /dynamically imported module|Failed to fetch/i.test(err.message);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg p-6 text-center">
      <span className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <AlertTriangle className="size-8" />
      </span>
      <h1 className="text-2xl font-bold">{isRouteErrorResponse(err) && err.status === 404 ? t('notFound.title') : t('errors.unexpected')}</h1>
      <p className="mt-2 max-w-md text-fg-muted">{isChunk ? t('errors.newVersion') : t('errors.unexpectedText')}</p>
      <div className="mt-6 flex gap-2">
        <Button onClick={() => window.location.reload()}>{t('common.reload')}</Button>
        <Button variant="outline" onClick={() => (window.location.href = '/')}>
          {t('notFound.home')}
        </Button>
      </div>
    </div>
  );
}
