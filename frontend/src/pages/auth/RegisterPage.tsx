import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Bike, Building2, ShoppingBag } from 'lucide-react';
import { authApi } from '@/api/endpoints';
import { useAuth, homePathFor } from '@/stores/auth';
import { useT, useTd } from '@/i18n';
import { applyFieldErrors, errorMessage } from '@/lib/errors';
import { REGIONS, TRANSPORTS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { RegisterPayload, TransportType } from '@/types';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, PasswordInput, RadioCard, Select } from '@/components/ui/form';
import { AuthShell } from './AuthShell';

type RegRole = RegisterPayload['role'];

const schema = z
  .object({
    role: z.enum(['buyer', 'seller', 'courier']),
    fullName: z.string().trim().min(3, 'MIN_LENGTH'),
    email: z.string().trim().email('INVALID_EMAIL'),
    phone: z.string().regex(/^\+998\d{9}$/, 'INVALID_PHONE'),
    password: z.string().min(8, 'PASSWORD_MIN').regex(/[A-Za-z]/, 'PASSWORD_WEAK').regex(/\d/, 'PASSWORD_WEAK'),
    confirm: z.string(),
    organization: z.string().optional(),
    companyName: z.string().optional(),
    tin: z.string().optional(),
    region: z.string().optional(),
    transport: z.string().optional(),
    terms: z.boolean().refine((v) => v, 'TERMS'),
  })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirm) ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'PASSWORD_MISMATCH' });
    if (v.role === 'seller') {
      if (!v.companyName || v.companyName.trim().length < 2) ctx.addIssue({ code: 'custom', path: ['companyName'], message: 'REQUIRED' });
      if (!/^\d{9}$/.test(v.tin ?? '')) ctx.addIssue({ code: 'custom', path: ['tin'], message: 'INVALID_TIN' });
      if (!v.region) ctx.addIssue({ code: 'custom', path: ['region'], message: 'REQUIRED' });
    }
    if (v.role === 'courier') {
      if (!v.transport) ctx.addIssue({ code: 'custom', path: ['transport'], message: 'REQUIRED' });
      if (!v.region) ctx.addIssue({ code: 'custom', path: ['region'], message: 'REQUIRED' });
    }
  });
type Form = z.infer<typeof schema>;

function passwordScore(p: string) {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(4, s);
}

/** Keeps "+998" prefix and digits only. */
function normalizePhone(v: string) {
  const digits = v.replace(/\D/g, '');
  const rest = digits.startsWith('998') ? digits.slice(3) : digits;
  return `+998${rest.slice(0, 9)}`;
}

export default function RegisterPage() {
  const t = useT();
  const td = useTd();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setSession = useAuth((s) => s.setSession);
  const initialRole = (['buyer', 'seller', 'courier'] as const).find((r) => r === params.get('role'));
  const [step, setStep] = useState<1 | 2>(initialRole ? 2 : 1);

  const { register, handleSubmit, formState, watch, setValue, setError } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { role: initialRole ?? 'buyer', phone: '+998', terms: false, region: '', transport: '' },
  });
  const role = watch('role');
  const password = watch('password') ?? '';
  const score = passwordScore(password);

  const m = useMutation({
    mutationFn: (v: Form) =>
      authApi.register({
        role: v.role,
        fullName: v.fullName,
        email: v.email,
        phone: v.phone,
        password: v.password,
        organization: v.role === 'buyer' ? v.organization || undefined : undefined,
        company: v.role === 'seller' ? { name: v.companyName!, tin: v.tin!, region: v.region! } : undefined,
        courier: v.role === 'courier' ? { transport: v.transport as TransportType, region: v.region! } : undefined,
      }),
    onSuccess: ({ token, user }) => {
      setSession(token, user);
      toast.success(t('auth.registered'));
      navigate(homePathFor(user), { replace: true });
    },
    onError: (err) => {
      if (applyFieldErrors(err, (name, e) => setError((name === 'company.name' ? 'companyName' : name === 'company.tin' ? 'tin' : name) as keyof Form, e))) return;
      toast.error(errorMessage(err));
    },
  });

  const err = (k: keyof Form) => {
    const msg = formState.errors[k]?.message;
    if (!msg) return undefined;
    return /^[A-Z_]+$/.test(msg) ? td(`validation.${msg}`) : msg;
  };

  const roles: { value: RegRole; icon: React.ReactNode }[] = [
    { value: 'buyer', icon: <ShoppingBag /> },
    { value: 'seller', icon: <Building2 /> },
    { value: 'courier', icon: <Bike /> },
  ];

  return (
    <AuthShell
      title={step === 1 ? t('auth.registerTitle') : t('auth.registerAs', { role: td(`roles.${role}`).toLowerCase() })}
      subtitle={step === 1 ? t('auth.registerSubtitle') : undefined}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            {t('auth.login')}
          </Link>
        </>
      }
    >
      {step === 1 ? (
        <div className="space-y-3" role="radiogroup">
          {roles.map((r) => (
            <RadioCard
              key={r.value}
              checked={role === r.value}
              onSelect={() => setValue('role', r.value)}
              icon={r.icon}
              title={td(`roles.${r.value}`)}
              description={td(`auth.roleText.${r.value}`)}
            />
          ))}
          <Button size="lg" className="mt-3 w-full" onClick={() => setStep(2)}>
            {t('common.continue')}
          </Button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit((v) => m.mutate(v))} noValidate>
          <button type="button" onClick={() => setStep(1)} className="-mt-3 mb-1 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
            <ArrowLeft className="size-4" /> {t('auth.changeRole')}
          </button>
          <Field label={t('auth.fullName')} required error={err('fullName')}>
            {(id) => <Input id={id} autoComplete="name" placeholder={t('auth.fullNamePlaceholder')} {...register('fullName')} invalid={!!formState.errors.fullName} />}
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Email" required error={err('email')}>
              {(id) => <Input id={id} type="email" autoComplete="email" {...register('email')} invalid={!!formState.errors.email} />}
            </Field>
            <Field label={t('auth.phone')} required error={err('phone')}>
              {(id) => (
                <Input
                  id={id}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  {...register('phone', { onChange: (e) => setValue('phone', normalizePhone(e.target.value)) })}
                  invalid={!!formState.errors.phone}
                />
              )}
            </Field>
          </div>

          {role === 'buyer' && (
            <Field label={t('auth.organization')} hint={t('auth.organizationHint')}>
              {(id) => <Input id={id} {...register('organization')} placeholder="Olimov Savdo MChJ" />}
            </Field>
          )}
          {role === 'seller' && (
            <div className="grid gap-4 rounded-xl border border-border bg-surface-2/50 p-4 sm:grid-cols-2">
              <Field label={t('auth.companyName')} required error={err('companyName')} className="sm:col-span-2">
                {(id) => <Input id={id} {...register('companyName')} invalid={!!formState.errors.companyName} />}
              </Field>
              <Field label={t('auth.tin')} required error={err('tin')} hint={t('auth.tinHint')}>
                {(id) => <Input id={id} inputMode="numeric" maxLength={9} {...register('tin')} invalid={!!formState.errors.tin} />}
              </Field>
              <Field label={t('auth.region')} required error={err('region')}>
                {(id) => (
                  <Select id={id} {...register('region')} invalid={!!formState.errors.region}>
                    <option value="">—</option>
                    {REGIONS.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          )}
          {role === 'courier' && (
            <div className="grid gap-4 rounded-xl border border-border bg-surface-2/50 p-4 sm:grid-cols-2">
              <Field label={t('auth.transport')} required error={err('transport')}>
                {(id) => (
                  <Select id={id} {...register('transport')} invalid={!!formState.errors.transport}>
                    <option value="">—</option>
                    {TRANSPORTS.map((tr) => (
                      <option key={tr} value={tr}>
                        {td(`transport.${tr}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t('auth.workRegion')} required error={err('region')}>
                {(id) => (
                  <Select id={id} {...register('region')} invalid={!!formState.errors.region}>
                    <option value="">—</option>
                    {REGIONS.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          )}

          <Field label={t('auth.password')} required error={err('password')}>
            {(id) => (
              <>
                <PasswordInput id={id} autoComplete="new-password" {...register('password')} invalid={!!formState.errors.password} />
                {password && (
                  <div className="mt-2">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className={cn('h-1 flex-1 rounded-full', i < score ? (score <= 1 ? 'bg-danger' : score === 2 ? 'bg-warning' : 'bg-success') : 'bg-surface-3')}
                        />
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-fg-subtle">{td(`auth.strength.${score}`)}</p>
                  </div>
                )}
              </>
            )}
          </Field>
          <Field label={t('auth.confirmPassword')} required error={err('confirm')}>
            {(id) => <PasswordInput id={id} autoComplete="new-password" {...register('confirm')} invalid={!!formState.errors.confirm} />}
          </Field>
          <div>
            <Checkbox
              {...register('terms')}
              label={
                <span>
                  {t('auth.agreeTo')}{' '}
                  <Link to="/terms" target="_blank" className="text-primary hover:underline">
                    {t('footer.terms')}
                  </Link>
                </span>
              }
            />
            {err('terms') && <p className="mt-1 text-xs font-medium text-danger">{err('terms')}</p>}
          </div>
          <Button type="submit" size="lg" className="w-full" loading={m.isPending}>
            {t('auth.createAccount')}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
