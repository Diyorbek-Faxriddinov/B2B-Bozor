import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BadgeCheck, Camera, ExternalLink, ShieldAlert, Warehouse } from 'lucide-react';
import { sellerApi, uploadImage } from '@/api/endpoints';
import { qk } from '@/api/hooks';
import { useT, useTd } from '@/i18n';
import { applyFieldErrors, errorMessage } from '@/lib/errors';
import { REGIONS } from '@/lib/constants';
import type { Address } from '@/types';
import { CategoryIcon } from '@/components/catalog';
import { Card, CardHeader, ErrorState, PageHeader, PageLoader, Spinner } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';

const LocationPicker = lazy(() => import('@/components/maps').then((m) => ({ default: m.LocationPicker })));

const schema = z.object({
  name: z.string().trim().min(2, 'MIN_LENGTH'),
  description: z.string().max(2000),
  region: z.string().min(1, 'REQUIRED'),
  address: z.string().trim().min(3, 'MIN_LENGTH'),
  phone: z.string().trim().min(9, 'INVALID_PHONE'),
  email: z.string().trim().email('INVALID_EMAIL'),
  website: z.string().trim().optional(),
  employees: z.string(),
  foundedYear: z.coerce.number<number>().int().min(1950, 'RANGE').max(new Date().getFullYear(), 'RANGE'),
});
type Form = z.infer<typeof schema>;

export default function CompanyPage() {
  const t = useT();
  const td = useTd();
  const qc = useQueryClient();
  const { data: company, isLoading, isError } = useQuery({ queryKey: qk.seller('company'), queryFn: sellerApi.company });
  const [pickup, setPickup] = useState<Address | undefined>();
  const [logoUploading, setLogoUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { register, handleSubmit, formState, reset, setError } = useForm<Form>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!company) return;
    reset({
      name: company.name,
      description: company.description,
      region: company.region,
      address: company.address,
      phone: company.phone,
      email: company.email,
      website: company.website ?? '',
      employees: company.employees,
      foundedYear: company.foundedYear,
    });
    setPickup(company.pickupPoint);
  }, [company, reset]);

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof sellerApi.updateCompany>[0]) => sellerApi.updateCompany(patch),
    onSuccess: (c) => {
      qc.setQueryData(qk.seller('company'), c);
      qc.invalidateQueries({ queryKey: qk.company(c.id) });
      toast.success(t('common.saved'));
    },
    onError: (e) => {
      if (!applyFieldErrors(e, setError)) toast.error(errorMessage(e));
    },
  });

  const onLogo = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error(t('errors.imageOnly'));
    setLogoUploading(true);
    try {
      save.mutate({ logo: await uploadImage(file) });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLogoUploading(false);
    }
  };

  if (isLoading) return <PageLoader />;
  if (isError || !company) return <ErrorState />;
  const err = (k: keyof Form) => (formState.errors[k]?.message ? td(`validation.${formState.errors[k]?.message}`) : undefined);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('seller.nav.company')}
        description={t('seller.company.subtitle')}
        actions={
          <Link to={`/suppliers/${company.id}`} target="_blank" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            {t('seller.company.viewPublic')} <ExternalLink className="size-4" />
          </Link>
        }
      />

      <Card className="flex flex-wrap items-center gap-5 p-5">
        <div className="relative">
          <span className="flex size-20 items-center justify-center overflow-hidden rounded-2xl bg-surface-2 text-fg-muted">
            {company.logo ? <img src={company.logo} alt="" className="size-full object-cover" /> : <CategoryIcon slug={company.mainCategories[0] ?? 'food'} className="size-9" />}
          </span>
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute -right-1 -bottom-1 flex size-8 items-center justify-center rounded-full border-2 border-surface bg-primary text-primary-fg"
            aria-label={t('seller.company.changeLogo')}
          >
            {logoUploading ? <Spinner className="size-4 text-white" /> : <Camera className="size-4" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onLogo(e.target.files?.[0])} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xl font-bold">{company.name}</div>
          <div className="text-sm text-fg-muted">
            {t('company.tin')}: {company.tin}
          </div>
        </div>
        {company.verified ? (
          <div className="flex items-center gap-2 rounded-xl bg-primary-soft px-4 py-2.5 text-sm font-medium text-primary-soft-fg">
            <BadgeCheck className="size-5" /> {t('company.verifiedSupplier')}
          </div>
        ) : (
          <div className="flex max-w-sm items-start gap-2 rounded-xl bg-warning-soft px-4 py-2.5 text-sm text-warning">
            <ShieldAlert className="mt-0.5 size-5 shrink-0" />
            <span>{t('seller.unverifiedText')}</span>
          </div>
        )}
      </Card>

      <form onSubmit={handleSubmit((v) => save.mutate({ ...v, website: v.website || undefined }))} noValidate>
        <Card>
          <CardHeader title={t('seller.company.info')} />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label={t('auth.companyName')} required error={err('name')}>
              {(id) => <Input id={id} {...register('name')} invalid={!!formState.errors.name} />}
            </Field>
            <Field label={t('auth.region')} required error={err('region')}>
              {(id) => (
                <Select id={id} {...register('region')}>
                  {REGIONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('seller.company.description')} className="sm:col-span-2" hint={t('seller.company.descriptionHint')}>
              {(id) => <Textarea id={id} rows={5} {...register('description')} />}
            </Field>
            <Field label={t('seller.company.address')} required error={err('address')} className="sm:col-span-2">
              {(id) => <Input id={id} {...register('address')} invalid={!!formState.errors.address} />}
            </Field>
            <Field label={t('auth.phone')} required error={err('phone')}>
              {(id) => <Input id={id} {...register('phone')} invalid={!!formState.errors.phone} />}
            </Field>
            <Field label="Email" required error={err('email')}>
              {(id) => <Input id={id} type="email" {...register('email')} invalid={!!formState.errors.email} />}
            </Field>
            <Field label={t('seller.company.website')}>{(id) => <Input id={id} {...register('website')} placeholder="https://" />}</Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('company.employees')}>
                {(id) => (
                  <Select id={id} {...register('employees')}>
                    {['1–10', '10–50', '50–100', '100–250', '250–500', '500+'].map((e) => (
                      <option key={e}>{e}</option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t('seller.company.founded')} error={err('foundedYear')}>
                {(id) => <Input id={id} type="number" {...register('foundedYear')} invalid={!!formState.errors.foundedYear} />}
              </Field>
            </div>
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" loading={save.isPending && !logoUploading}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        </Card>
      </form>

      <Card>
        <CardHeader title={t('seller.company.pickup')} description={t('seller.company.pickupText')} />
        <div className="p-5">
          <Suspense fallback={<div className="flex h-80 items-center justify-center"><Spinner /></div>}>
            <LocationPicker value={pickup} onChange={setPickup} className="h-80" />
          </Suspense>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Warehouse className="size-4 text-fg-subtle" />
            <Input className="flex-1" value={pickup?.text ?? ''} onChange={(e) => pickup && setPickup({ ...pickup, text: e.target.value })} disabled={!pickup} />
            <Button
              disabled={!pickup || pickup.text === t('map.resolving')}
              loading={save.isPending}
              onClick={() => pickup && save.mutate({ pickupPoint: { ...pickup, label: t('seller.company.warehouse') } })}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
