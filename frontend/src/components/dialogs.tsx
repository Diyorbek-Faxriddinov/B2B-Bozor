import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { messagesApi, rfqApi } from '@/api/endpoints';
import { qk } from '@/api/hooks';
import { useAuth } from '@/stores/auth';
import { useT, useTd } from '@/i18n';
import { applyFieldErrors, errorMessage } from '@/lib/errors';
import { UNITS } from '@/lib/constants';
import type { ID, Product, ProductUnit } from '@/types';
import { Modal } from './ui/overlay';
import { Button } from './ui/button';
import { Field, Input, Select, Textarea } from './ui/form';

export function useRequireLogin() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const t = useT();
  return (role?: 'buyer') => {
    if (!user) {
      toast.info(t('auth.loginRequired'));
      navigate(`/login?next=${encodeURIComponent(location.pathname)}`);
      return false;
    }
    if (role && user.role !== role) {
      toast.info(t('auth.buyerOnly'));
      return false;
    }
    return true;
  };
}

/* ---------- RFQ (request for quotation) ---------- */
const rfqSchema = z.object({
  productName: z.string().trim().min(2, 'MIN_LENGTH'),
  quantity: z.coerce.number<number>().int().positive('POSITIVE'),
  unit: z.string(),
  targetPrice: z.coerce.number<number>().nonnegative().optional(),
  deadline: z.string().optional(),
  message: z.string().trim().min(10, 'MIN_LENGTH').max(1000),
});
type RfqForm = z.infer<typeof rfqSchema>;

export function RfqDialog({
  open,
  onClose,
  companyId,
  companyName,
  product,
}: {
  open: boolean;
  onClose: () => void;
  companyId: ID;
  companyName: string;
  product?: Pick<Product, 'id' | 'name' | 'unit' | 'moq'>;
}) {
  const t = useT();
  const td = useTd();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const form = useForm<RfqForm>({
    resolver: zodResolver(rfqSchema),
    defaultValues: { productName: product?.name ?? '', quantity: (product?.moq ?? 1) * 10, unit: product?.unit ?? 'piece', message: '', deadline: '' },
  });
  const { register, handleSubmit, formState, reset, setError } = form;
  useEffect(() => {
    if (open) reset({ productName: product?.name ?? '', quantity: (product?.moq ?? 1) * 10, unit: product?.unit ?? 'piece', message: '', deadline: '' });
  }, [open, product, reset]);

  const m = useMutation({
    mutationFn: (v: RfqForm) =>
      rfqApi.create({
        companyId,
        productId: product?.id,
        productName: v.productName,
        quantity: v.quantity,
        unit: v.unit as ProductUnit,
        targetPrice: v.targetPrice || undefined,
        deadline: v.deadline ? new Date(v.deadline).toISOString() : undefined,
        message: v.message,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['rfqs'] });
      toast.success(t('rfq.sent'), { description: r.number, action: { label: t('common.view'), onClick: () => navigate('/account/rfqs') } });
      onClose();
    },
    onError: (err) => {
      if (!applyFieldErrors(err, setError)) toast.error(errorMessage(err));
    },
  });

  const err = (k: keyof RfqForm) => (formState.errors[k]?.message ? td(`validation.${formState.errors[k]?.message}`) : undefined);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('rfq.dialogTitle')}
      description={t('rfq.dialogText', { company: companyName })}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={m.isPending} onClick={handleSubmit((v) => m.mutate(v))}>
            {t('rfq.send')}
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => m.mutate(v))}>
        <Field label={t('rfq.product')} required error={err('productName')} className="sm:col-span-2">
          {(id) => <Input id={id} {...register('productName')} disabled={!!product} invalid={!!formState.errors.productName} />}
        </Field>
        <Field label={t('rfq.quantity')} required error={err('quantity')}>
          {(id) => <Input id={id} type="number" min={1} {...register('quantity')} invalid={!!formState.errors.quantity} />}
        </Field>
        <Field label={t('product.unit')}>
          {(id) => (
            <Select id={id} {...register('unit')} disabled={!!product}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {td(`units.${u}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('rfq.targetPrice')} hint={t('rfq.targetPriceHint')}>
          {(id) => <Input id={id} type="number" min={0} {...register('targetPrice')} />}
        </Field>
        <Field label={t('rfq.deadline')}>{(id) => <Input id={id} type="date" {...register('deadline')} min={new Date().toISOString().slice(0, 10)} />}</Field>
        <Field label={t('rfq.message')} required error={err('message')} className="sm:col-span-2">
          {(id) => <Textarea id={id} rows={4} placeholder={t('rfq.messagePlaceholder')} {...register('message')} invalid={!!formState.errors.message} />}
        </Field>
      </form>
    </Modal>
  );
}

/* ---------- Contact seller ---------- */
export function ContactSellerDialog({
  open,
  onClose,
  companyId,
  companyName,
  productId,
  productName,
}: {
  open: boolean;
  onClose: () => void;
  companyId: ID;
  companyName: string;
  productId?: ID;
  productName?: string;
}) {
  const t = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  useEffect(() => {
    if (open) setText(productName ? t('messages.productTemplate', { product: productName }) : '');
  }, [open, productName, t]);

  const m = useMutation({
    mutationFn: () => messagesApi.start({ companyId, productId, text }),
    onSuccess: (conv) => {
      qc.invalidateQueries({ queryKey: qk.conversations });
      onClose();
      navigate(`/messages/${conv.id}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('messages.contactTitle', { company: companyName })}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={m.isPending} disabled={text.trim().length < 2} onClick={() => m.mutate()}>
            {t('messages.send')}
          </Button>
        </>
      }
    >
      <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} autoFocus placeholder={t('messages.placeholder')} />
      <p className="mt-2 text-xs text-fg-subtle">{t('messages.contactHint')}</p>
    </Modal>
  );
}
