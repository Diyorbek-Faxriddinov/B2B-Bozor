import { lazy, Suspense, useEffect, useState } from 'react';
import { MapPin, Phone, User as UserIcon } from 'lucide-react';
import type { Address, GeoPoint } from '@/types';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { Modal } from './ui/overlay';
import { Button } from './ui/button';
import { Field, Input } from './ui/form';
import { Spinner } from './ui/display';

const LocationPicker = lazy(() => import('./maps').then((m) => ({ default: m.LocationPicker })));

/** "kv. 12 · 3-podyezd · 4-qavat" — empty string if no details. */
export function useAddressDetails() {
  const t = useT();
  return (a: Address) =>
    [a.apartment && t('address.aptShort', { v: a.apartment }), a.entrance && t('address.entranceShort', { v: a.entrance }), a.floor && t('address.floorShort', { v: a.floor })]
      .filter(Boolean)
      .join(' · ');
}

/** Full address block for order pages (courier needs every detail). */
export function AddressBlock({ address, className, showContact = true }: { address: Address; className?: string; showContact?: boolean }) {
  const t = useT();
  const details = useAddressDetails()(address);
  return (
    <div className={cn('space-y-0.5 text-sm', className)}>
      <div className="text-fg-muted">{address.text}</div>
      {details && <div className="font-medium text-fg">{details}</div>}
      {address.landmark && (
        <div className="text-fg-muted">
          {t('address.landmark')}: {address.landmark}
        </div>
      )}
      {showContact && (address.contactName || address.contactPhone) && (
        <div className="flex flex-wrap items-center gap-x-3 pt-1 text-fg-muted">
          {address.contactName && (
            <span className="inline-flex items-center gap-1">
              <UserIcon className="size-3.5" /> {address.contactName}
            </span>
          )}
          {address.contactPhone && (
            <a href={`tel:${address.contactPhone}`} className="inline-flex items-center gap-1 text-primary hover:underline">
              <Phone className="size-3.5" /> {address.contactPhone}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

const PHONE_RE = /^\+998\d{9}$/;

export function AddressDialog({
  open,
  onClose,
  onSave,
  initial,
  near,
  title,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (a: Address) => void;
  initial?: Address;
  near?: GeoPoint;
  title?: string;
  saving?: boolean;
}) {
  const t = useT();
  const [draft, setDraft] = useState<Address | undefined>(initial);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (open) {
      setDraft(initial);
      setTouched(false);
    }
  }, [open, initial]);

  const set = (patch: Partial<Address>) => draft && setDraft({ ...draft, ...patch });
  const resolving = draft?.text === t('map.resolving');
  const phoneInvalid = !!draft?.contactPhone && !PHONE_RE.test(draft.contactPhone.replace(/[\s-]/g, ''));
  const textInvalid = !!draft && draft.text.trim().length < 3;
  const canSave = !!draft && !resolving && !phoneInvalid && !textInvalid;

  const save = () => {
    setTouched(true);
    if (!canSave || !draft) return;
    onSave({
      ...draft,
      text: draft.text.trim(),
      contactPhone: draft.contactPhone?.replace(/[\s-]/g, '') || undefined,
      label: draft.label?.trim() || undefined,
      apartment: draft.apartment?.trim() || undefined,
      entrance: draft.entrance?.trim() || undefined,
      floor: draft.floor?.trim() || undefined,
      landmark: draft.landmark?.trim() || undefined,
      contactName: draft.contactName?.trim() || undefined,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={title ?? t('address.title')}
      description={t('address.subtitle')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={!draft || resolving} loading={saving}>
            {t('address.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Suspense
          fallback={
            <div className="flex h-80 items-center justify-center rounded-xl bg-surface-2 lg:h-full">
              <Spinner />
            </div>
          }
        >
          <LocationPicker value={draft} onChange={setDraft} near={near} className="h-80 lg:h-full lg:min-h-[440px]" />
        </Suspense>
        <div className="space-y-3">
          {!draft ? (
            <div className="flex items-start gap-3 rounded-xl border border-dashed border-border-strong p-4 text-sm text-fg-muted">
              <MapPin className="mt-0.5 size-5 shrink-0 text-primary" />
              {t('address.pickFirst')}
            </div>
          ) : (
            <>
              <Field label={t('address.street')} required error={touched && textInvalid ? t('validation.MIN_LENGTH') : undefined}>
                {(id) => <Input id={id} value={draft.text} onChange={(e) => set({ text: e.target.value })} disabled={resolving} invalid={touched && textInvalid} />}
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label={t('address.apartment')}>{(id) => <Input id={id} value={draft.apartment ?? ''} onChange={(e) => set({ apartment: e.target.value })} maxLength={20} />}</Field>
                <Field label={t('address.entrance')}>{(id) => <Input id={id} value={draft.entrance ?? ''} onChange={(e) => set({ entrance: e.target.value })} maxLength={10} />}</Field>
                <Field label={t('address.floor')}>{(id) => <Input id={id} value={draft.floor ?? ''} onChange={(e) => set({ floor: e.target.value })} maxLength={10} />}</Field>
              </div>
              <Field label={t('address.landmark')} hint={t('address.landmarkHint')}>
                {(id) => <Input id={id} value={draft.landmark ?? ''} onChange={(e) => set({ landmark: e.target.value })} maxLength={120} />}
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('address.contactName')}>{(id) => <Input id={id} value={draft.contactName ?? ''} onChange={(e) => set({ contactName: e.target.value })} maxLength={60} />}</Field>
                <Field label={t('address.contactPhone')} error={phoneInvalid ? t('validation.INVALID_PHONE') : undefined}>
                  {(id) => <Input id={id} type="tel" placeholder="+998901234567" value={draft.contactPhone ?? ''} onChange={(e) => set({ contactPhone: e.target.value })} invalid={phoneInvalid} />}
                </Field>
              </div>
              <Field label={t('address.label')}>
                {(id) => (
                  <>
                    <Input id={id} value={draft.label ?? ''} onChange={(e) => set({ label: e.target.value })} placeholder={t('checkout.addressLabel')} maxLength={30} />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {[t('address.labels.office'), t('address.labels.warehouse'), t('address.labels.shop'), t('address.labels.home')].map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => set({ label: l })}
                          className={cn('rounded-full border px-2.5 py-0.5 text-xs', draft.label === l ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-border text-fg-muted hover:border-fg-subtle')}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </Field>
              <p className="text-[11px] text-fg-subtle">
                {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}
              </p>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
