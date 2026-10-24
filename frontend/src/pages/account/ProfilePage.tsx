import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Camera, KeyRound, MapPin, Pencil, Plus, ShieldCheck, Smartphone, Star, Trash2 } from 'lucide-react';
import { authApi, uploadImage } from '@/api/endpoints';
import { useAuth } from '@/stores/auth';
import { useFormat, useT, useTd } from '@/i18n';
import { applyFieldErrors, errorMessage } from '@/lib/errors';
import { REGIONS, TRANSPORTS } from '@/lib/constants';
import type { Address, TransportType, User } from '@/types';
import { Avatar, Badge, Card, CardHeader, PageHeader, Spinner } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Field, Input, PasswordInput, Select } from '@/components/ui/form';
import { AddressBlock, AddressDialog } from '@/components/address';

const schema = z.object({
  fullName: z.string().trim().min(3, 'MIN_LENGTH'),
  email: z.string().trim().email('INVALID_EMAIL'),
  phone: z.string().regex(/^\+998\d{9}$/, 'INVALID_PHONE'),
  organization: z.string().optional(),
});
type Form = z.infer<typeof schema>;

function useUpdateMe() {
  const setUser = useAuth((s) => s.setUser);
  const t = useT();
  return useMutation({
    mutationFn: (patch: Partial<User>) => authApi.updateMe(patch),
    onSuccess: (u) => {
      setUser(u);
      toast.success(t('common.saved'));
    },
  });
}

function PersonalInfo() {
  const t = useT();
  const td = useTd();
  const user = useAuth((s) => s.user)!;
  const update = useUpdateMe();
  const { register, handleSubmit, formState, setError, reset } = useForm<Form>({
    resolver: zodResolver(schema),
    values: { fullName: user.fullName, email: user.email, phone: user.phone, organization: user.organization ?? '' },
  });
  const err = (k: keyof Form) => (formState.errors[k]?.message ? td(`validation.${formState.errors[k]?.message}`) : undefined);
  return (
    <Card>
      <CardHeader title={t('profile.personal')} description={t('profile.personalText')} />
      <form
        className="grid gap-4 p-5 sm:grid-cols-2"
        onSubmit={handleSubmit((v) =>
          update.mutate(
            { ...v, organization: v.organization || undefined },
            {
              onError: (e) => {
                if (!applyFieldErrors(e, setError)) toast.error(errorMessage(e));
              },
              onSuccess: (u) => reset({ fullName: u.fullName, email: u.email, phone: u.phone, organization: u.organization ?? '' }),
            },
          ),
        )}
      >
        <Field label={t('auth.fullName')} error={err('fullName')}>
          {(id) => <Input id={id} {...register('fullName')} invalid={!!formState.errors.fullName} />}
        </Field>
        <Field label="Email" error={err('email')}>
          {(id) => <Input id={id} type="email" {...register('email')} invalid={!!formState.errors.email} />}
        </Field>
        <Field label={t('auth.phone')} error={err('phone')}>
          {(id) => <Input id={id} type="tel" {...register('phone')} invalid={!!formState.errors.phone} />}
        </Field>
        {user.role === 'buyer' && <Field label={t('auth.organization')}>{(id) => <Input id={id} {...register('organization')} />}</Field>}
        <div className="sm:col-span-2">
          <PhoneVerification dirty={!!formState.dirtyFields.phone} />
        </div>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" loading={update.isPending} disabled={!formState.isDirty}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** SMS notifications (Eskiz) go only to verified numbers. */
function PhoneVerification({ dirty }: { dirty: boolean }) {
  const t = useT();
  const user = useAuth((s) => s.user)!;
  const setUser = useAuth((s) => s.setUser);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<{ devCode?: string } | null>(null);
  const send = useMutation({
    mutationFn: () => authApi.sendPhoneCode(),
    onSuccess: (r) => {
      setSent({ devCode: r.devCode });
      toast.success(t('profile.phoneCodeSent', { phone: user.phone }));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const verify = useMutation({
    mutationFn: () => authApi.verifyPhone(code.trim()),
    onSuccess: (u) => {
      setUser(u);
      setSent(null);
      setCode('');
      toast.success(t('profile.phoneVerifiedToast'));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (user.phoneVerified) {
    return (
      <Badge tone="success" icon={<ShieldCheck />}>
        {user.phone} · {t('profile.phoneVerified')}
      </Badge>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Smartphone className="size-4 text-fg-muted" />
        <span className="font-medium">{user.phone}</span>
        <Badge tone="warning">{t('profile.phoneNotVerified')}</Badge>
        {!sent && (
          <Button type="button" size="sm" variant="outline" className="ml-auto" loading={send.isPending} disabled={dirty} onClick={() => send.mutate()}>
            {t('profile.verifyPhone')}
          </Button>
        )}
      </div>
      <p className="mt-1.5 text-xs text-fg-muted">{t('profile.phoneHint')}</p>
      {sent && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label={t('profile.phoneCode')}>
            {(id) => <Input id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="w-36" />}
          </Field>
          <Button type="button" size="sm" loading={verify.isPending} disabled={code.length !== 6} onClick={() => verify.mutate()}>
            {t('common.confirm')}
          </Button>
          <Button type="button" size="sm" variant="ghost" loading={send.isPending} onClick={() => send.mutate()}>
            {t('profile.sendCode')}
          </Button>
          {sent.devCode && <p className="w-full text-xs text-info">{t('profile.phoneDevCode', { code: sent.devCode })}</p>}
        </div>
      )}
    </div>
  );
}

function Addresses() {
  const t = useT();
  const user = useAuth((s) => s.user)!;
  const update = useUpdateMe();
  const [dialog, setDialog] = useState<{ open: boolean; index?: number }>({ open: false });
  const save = (addresses: Address[], after?: () => void) => update.mutate({ addresses }, { onError: (e) => toast.error(errorMessage(e)), onSuccess: after });
  return (
    <Card>
      <CardHeader
        title={t('profile.addresses')}
        description={t('profile.addressesText')}
        action={
          <Button size="sm" variant="outline" leftIcon={<Plus />} onClick={() => setDialog({ open: true })} disabled={user.addresses.length >= 5}>
            {t('profile.addAddress')}
          </Button>
        }
      />
      <div className="p-5">
        {!user.addresses.length ? (
          <p className="text-sm text-fg-muted">{t('profile.noAddresses')}</p>
        ) : (
          <ul className="space-y-2">
            {user.addresses.map((a, i) => (
              <li key={`${a.lat},${a.lng},${i}`} className="flex items-start gap-3 rounded-xl border border-border p-3">
                <MapPin className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {a.label || t('checkout.address')}
                    {i === 0 && <Badge tone="primary">{t('profile.default')}</Badge>}
                  </div>
                  <AddressBlock address={a} />
                </div>
                <div className="flex shrink-0">
                  <Button size="icon-sm" variant="ghost" title={t('common.edit')} aria-label={t('common.edit')} onClick={() => setDialog({ open: true, index: i })}>
                    <Pencil />
                  </Button>
                  {i > 0 && (
                    <Button size="icon-sm" variant="ghost" title={t('profile.makeDefault')} aria-label={t('profile.makeDefault')} onClick={() => save([a, ...user.addresses.filter((_, j) => j !== i)])}>
                      <Star />
                    </Button>
                  )}
                  <Button size="icon-sm" variant="ghost" className="hover:text-danger" title={t('common.remove')} aria-label={t('common.remove')} onClick={() => save(user.addresses.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <AddressDialog
        open={dialog.open}
        onClose={() => setDialog({ open: false })}
        initial={dialog.index !== undefined ? user.addresses[dialog.index] : undefined}
        near={user.addresses[0]}
        title={dialog.index !== undefined ? t('address.editTitle') : t('profile.addAddress')}
        saving={update.isPending}
        onSave={(a) => {
          const list = [...user.addresses];
          if (dialog.index !== undefined) list[dialog.index] = a;
          else list.push(a);
          save(list.slice(0, 5), () => setDialog({ open: false }));
        }}
      />
    </Card>
  );
}

function CourierInfo() {
  const t = useT();
  const td = useTd();
  const user = useAuth((s) => s.user)!;
  const update = useUpdateMe();
  const [transport, setTransport] = useState<TransportType>(user.courier!.transport);
  const [region, setRegion] = useState(user.courier!.region);
  return (
    <Card>
      <CardHeader title={t('profile.courierInfo')} />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label={t('auth.transport')}>
          {(id) => (
            <Select id={id} value={transport} onChange={(e) => setTransport(e.target.value as TransportType)}>
              {TRANSPORTS.map((tr) => (
                <option key={tr} value={tr}>
                  {td(`transport.${tr}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('auth.workRegion')}>
          {(id) => (
            <Select id={id} value={region} onChange={(e) => setRegion(e.target.value)}>
              {REGIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex justify-end sm:col-span-2">
          <Button loading={update.isPending} onClick={() => update.mutate({ courier: { ...user.courier!, transport, region } })}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ChangePassword() {
  const t = useT();
  const td = useTd();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string>();
  const m = useMutation({
    mutationFn: () => authApi.changePassword(current, next),
    onSuccess: () => {
      toast.success(t('profile.passwordChanged'));
      setCurrent('');
      setNext('');
      setError(undefined);
    },
    onError: (e) => {
      const fields = (e as { fields?: Record<string, string> }).fields;
      if (fields) setError(td(`validation.${Object.values(fields)[0]}`));
      else toast.error(errorMessage(e));
    },
  });
  return (
    <Card>
      <CardHeader title={t('profile.security')} description={t('profile.securityText')} />
      <form
        className="grid gap-4 p-5 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (next.length < 8) return setError(td('validation.PASSWORD_MIN'));
          m.mutate();
        }}
      >
        <Field label={t('profile.currentPassword')}>{(id) => <PasswordInput id={id} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />}</Field>
        <Field label={t('profile.newPassword')} error={error}>
          {(id) => <PasswordInput id={id} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />}
        </Field>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" variant="outline" leftIcon={<KeyRound />} loading={m.isPending}>
            {t('profile.changePassword')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function ProfilePage() {
  const t = useT();
  const td = useTd();
  const f = useFormat();
  const user = useAuth((s) => s.user)!;
  const update = useUpdateMe();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const onAvatar = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error(t('errors.imageOnly'));
    if (file.size > 5 * 1024 * 1024) return toast.error(t('errors.imageTooLarge'));
    setUploading(true);
    try {
      const url = await uploadImage(file);
      update.mutate({ avatar: url });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t('account.nav.profile')} />
      <Card className="flex flex-wrap items-center gap-5 p-5">
        <div className="relative">
          <Avatar name={user.fullName} src={user.avatar} size={80} />
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute -right-1 -bottom-1 flex size-8 items-center justify-center rounded-full border-2 border-surface bg-primary text-primary-fg hover:bg-primary-hover"
            aria-label={t('profile.changePhoto')}
          >
            {uploading ? <Spinner className="size-4 text-white" /> : <Camera className="size-4" />}
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onAvatar(e.target.files?.[0])} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xl font-bold">{user.fullName}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <Badge tone="primary">{td(`roles.${user.role}`)}</Badge>
            <span>{t('profile.memberSince', { date: f.date(user.createdAt, { month: 'long', year: 'numeric' }) })}</span>
          </div>
        </div>
        {user.avatar && (
          <Button variant="ghost" size="sm" onClick={() => update.mutate({ avatar: '' })}>
            {t('profile.removePhoto')}
          </Button>
        )}
      </Card>
      <PersonalInfo />
      {user.role === 'buyer' && <Addresses />}
      {user.role === 'courier' && user.courier && <CourierInfo />}
      <ChangePassword />
    </div>
  );
}
