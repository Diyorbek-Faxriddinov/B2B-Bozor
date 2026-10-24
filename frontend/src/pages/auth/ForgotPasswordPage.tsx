import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { authApi } from '@/api/endpoints';
import { useT } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { AuthShell } from './AuthShell';

export default function ForgotPasswordPage() {
  const t = useT();
  const [email, setEmail] = useState('');
  const m = useMutation({ mutationFn: () => authApi.forgotPassword(email), onError: (e) => toast.error(errorMessage(e)) });

  return (
    <AuthShell
      title={t('auth.forgotTitle')}
      subtitle={t('auth.forgotSubtitle')}
      footer={
        <Link to="/login" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
          <ArrowLeft className="size-4" /> {t('auth.backToLogin')}
        </Link>
      }
    >
      {m.isSuccess ? (
        <div className="rounded-xl border border-success/20 bg-success-soft p-5 text-center">
          <MailCheck className="mx-auto size-10 text-success" />
          <div className="mt-3 font-semibold">{t('auth.forgotSentTitle')}</div>
          <p className="mt-1 text-sm text-fg-muted">{t('auth.forgotSentText', { email })}</p>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          <Field label="Email">{(id) => <Input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@kompaniya.uz" />}</Field>
          <Button type="submit" size="lg" className="w-full" loading={m.isPending}>
            {t('auth.sendLink')}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
