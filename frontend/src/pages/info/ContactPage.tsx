import { lazy, Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, Mail, MapPin, Phone, Send } from 'lucide-react';
import { miscApi } from '@/api/endpoints';
import { useAuth } from '@/stores/auth';
import { useT, useTd } from '@/i18n';
import { applyFieldErrors, errorMessage } from '@/lib/errors';
import { SUPPORT } from '@/lib/constants';
import { Breadcrumbs, Card, Spinner } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';

const PointMap = lazy(() => import('@/components/maps').then((m) => ({ default: m.PointMap })));

const schema = z.object({
  name: z.string().trim().min(2, 'MIN_LENGTH'),
  email: z.string().trim().email('INVALID_EMAIL'),
  subject: z.string(),
  message: z.string().trim().min(10, 'MIN_LENGTH').max(2000),
});
type Form = z.infer<typeof schema>;

export default function ContactPage() {
  const t = useT();
  const td = useTd();
  const user = useAuth((s) => s.user);
  const { register, handleSubmit, formState, reset, setError } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { name: user?.fullName ?? '', email: user?.email ?? '', subject: 'general', message: '' },
  });
  const m = useMutation({
    mutationFn: (v: Form) => miscApi.contact({ ...v, subject: td(`contact.subjects.${v.subject}`) }),
    onSuccess: () => {
      toast.success(t('contact.sent'));
      reset({ name: user?.fullName ?? '', email: user?.email ?? '', subject: 'general', message: '' });
    },
    onError: (e) => {
      if (!applyFieldErrors(e, setError)) toast.error(errorMessage(e));
    },
  });
  const err = (k: keyof Form) => (formState.errors[k]?.message ? td(`validation.${formState.errors[k]?.message}`) : undefined);

  const cards = [
    { icon: <Phone />, title: t('contact.phone'), value: SUPPORT.phone, href: SUPPORT.phoneHref },
    { icon: <Mail />, title: 'Email', value: SUPPORT.email, href: `mailto:${SUPPORT.email}` },
    { icon: <Clock />, title: t('contact.hours'), value: t('contact.hoursValue') },
    { icon: <MapPin />, title: t('contact.address'), value: SUPPORT.address },
  ];

  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: t('nav.home'), to: '/' }, { label: t('nav.contact') }]} />
      <div className="mt-3 mb-8 max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight">{t('contact.title')}</h1>
        <p className="mt-2 text-fg-muted">{t('contact.subtitle')}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const inner = (
            <>
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-fg [&_svg]:size-5">{c.icon}</span>
              <div className="mt-3 text-sm text-fg-muted">{c.title}</div>
              <div className="mt-0.5 font-semibold">{c.value}</div>
            </>
          );
          return c.href ? (
            <a key={c.title} href={c.href} className="card p-5 transition-shadow hover:shadow-(--shadow-pop)">
              {inner}
            </a>
          ) : (
            <Card key={c.title} className="p-5">
              {inner}
            </Card>
          );
        })}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-semibold">{t('contact.formTitle')}</h2>
          <form className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => m.mutate(v))} noValidate>
            <Field label={t('contact.name')} required error={err('name')}>
              {(id) => <Input id={id} {...register('name')} invalid={!!formState.errors.name} />}
            </Field>
            <Field label="Email" required error={err('email')}>
              {(id) => <Input id={id} type="email" {...register('email')} invalid={!!formState.errors.email} />}
            </Field>
            <Field label={t('contact.subject')} className="sm:col-span-2">
              {(id) => (
                <Select id={id} {...register('subject')}>
                  {(['general', 'order', 'seller', 'partnership', 'complaint'] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`contact.subjects.${s}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('contact.message')} required error={err('message')} className="sm:col-span-2">
              {(id) => <Textarea id={id} rows={6} {...register('message')} invalid={!!formState.errors.message} />}
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" loading={m.isPending} leftIcon={<Send />}>
                {t('contact.send')}
              </Button>
            </div>
          </form>
        </Card>
        <Suspense
          fallback={
            <div className="flex min-h-80 items-center justify-center rounded-xl bg-surface-2">
              <Spinner />
            </div>
          }
        >
          <PointMap point={SUPPORT.location} label={`B2B Bozor — ${SUPPORT.address}`} className="h-full min-h-80" />
        </Suspense>
      </div>
    </div>
  );
}
