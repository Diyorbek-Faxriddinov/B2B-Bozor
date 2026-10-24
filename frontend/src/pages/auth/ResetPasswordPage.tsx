import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { authApi } from '@/api/endpoints';
import { ApiError } from '@/api/client';
import { useT } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field, PasswordInput } from '@/components/ui/form';
import { AuthShell } from './AuthShell';

/** Opened from the reset link in the email: /reset-password?token=… */
export default function ResetPasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const token = useSearchParams()[0].get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string>();

  const m = useMutation({
    mutationFn: () => authApi.resetPassword(token, password),
    onSuccess: () => {
      toast.success(t('auth.resetDone'));
      navigate('/login', { replace: true });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'INVALID_TOKEN') setError(t('auth.resetInvalid'));
      else toast.error(errorMessage(e));
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError(t('validation.PASSWORD_MIN'));
    if (password !== confirm) return setError(t('validation.PASSWORD_MISMATCH'));
    setError(undefined);
    m.mutate();
  };

  return (
    <AuthShell
      title={t('auth.resetTitle')}
      subtitle={t('auth.resetSubtitle')}
      footer={
        <Link to="/login" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
          <ArrowLeft className="size-4" /> {t('auth.backToLogin')}
        </Link>
      }
    >
      {!token ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-fg-muted">{t('auth.resetInvalid')}</p>
          <ButtonLink to="/forgot-password" className="w-full">
            {t('auth.sendLink')}
          </ButtonLink>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <Field label={t('profile.newPassword')}>
            {(id) => <PasswordInput id={id} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!error} />}
          </Field>
          <Field label={t('auth.confirmPassword')} error={error}>
            {(id) => <PasswordInput id={id} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} invalid={!!error} />}
          </Field>
          <Button type="submit" size="lg" className="w-full" leftIcon={<KeyRound />} loading={m.isPending}>
            {t('auth.resetSubmit')}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
