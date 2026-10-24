import { Link, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LogIn, Mail, Sparkles } from 'lucide-react';
import { authApi } from '@/api/endpoints';
import { USE_MOCK } from '@/api/client';
import { useAuth, homePathFor } from '@/stores/auth';
import { useT, useTd } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, PasswordInput } from '@/components/ui/form';
import { AuthShell } from './AuthShell';

const schema = z.object({
  email: z.string().trim().email('INVALID_EMAIL'),
  password: z.string().min(1, 'REQUIRED'),
  remember: z.boolean().optional(),
});
type Form = z.infer<typeof schema>;

export default function LoginPage() {
  const t = useT();
  const td = useTd();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setSession = useAuth((s) => s.setSession);
  const { register, handleSubmit, formState, setValue } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { remember: true } });

  const m = useMutation({
    mutationFn: (v: Form) => authApi.login(v.email, v.password),
    onSuccess: ({ token, user }) => {
      setSession(token, user);
      toast.success(t('auth.welcomeBack', { name: user.fullName.split(' ')[0] }));
      const next = params.get('next');
      navigate(next && next.startsWith('/') ? next : homePathFor(user), { replace: true });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const err = (k: keyof Form) => (formState.errors[k]?.message ? td(`validation.${formState.errors[k]?.message}`) : undefined);

  return (
    <AuthShell
      title={t('auth.loginTitle')}
      subtitle={t('auth.loginSubtitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="font-semibold text-primary hover:underline">
            {t('auth.register')}
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit((v) => m.mutate(v))} noValidate>
        <Field label="Email" error={err('email')}>
          {(id) => <Input id={id} type="email" autoComplete="email" leftIcon={<Mail />} placeholder="email@kompaniya.uz" {...register('email')} invalid={!!formState.errors.email} />}
        </Field>
        <Field label={t('auth.password')} error={err('password')}>
          {(id) => <PasswordInput id={id} autoComplete="current-password" {...register('password')} invalid={!!formState.errors.password} />}
        </Field>
        <div className="flex items-center justify-between">
          <Checkbox label={t('auth.remember')} {...register('remember')} />
          <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            {t('auth.forgot')}
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={m.isPending} leftIcon={<LogIn />}>
          {t('auth.login')}
        </Button>
      </form>

      {USE_MOCK && (
        <div className="mt-8 rounded-xl border border-dashed border-border-strong bg-surface-2/60 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-accent" /> {t('auth.demoTitle')}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setValue('email', a.email);
                  setValue('password', DEMO_PASSWORD);
                  m.mutate({ email: a.email, password: DEMO_PASSWORD });
                }}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-primary"
              >
                <div className="text-sm font-semibold">{td(`roles.${a.role}`)}</div>
                <div className="truncate text-xs text-fg-subtle">{a.email}</div>
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-xs text-fg-subtle">{t('auth.demoPassword', { password: DEMO_PASSWORD })}</p>
        </div>
      )}
    </AuthShell>
  );
}
