import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ImagePlus, Loader2, Plus, Star, Trash2, X } from 'lucide-react';
import { sellerApi, uploadImage } from '@/api/endpoints';
import { qk, useCategories } from '@/api/hooks';
import { useFormat, useT, useTd } from '@/i18n';
import { applyFieldErrors, errorMessage } from '@/lib/errors';
import { UNITS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { ProductInput, ProductUnit } from '@/types';
import { ProductImage } from '@/components/catalog';
import { Badge, Card, CardHeader, ErrorState, PageLoader } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/form';

const num = () => z.coerce.number<number>({ message: 'REQUIRED' });

const schema = z
  .object({
    name: z.string().trim().min(3, 'MIN_LENGTH').max(140),
    categorySlug: z.string().min(1, 'REQUIRED'),
    description: z.string().trim().min(20, 'DESC_MIN').max(3000),
    price: num().positive('POSITIVE'),
    unit: z.string(),
    moq: num().int('POSITIVE').min(1, 'POSITIVE'),
    stock: num().int('POSITIVE').min(0, 'POSITIVE'),
    discount: num().min(0, 'RANGE').max(90, 'RANGE'),
    deliveryDays: num().int('POSITIVE').min(1, 'POSITIVE').max(60, 'RANGE'),
    tags: z.string(),
    active: z.boolean(),
    tiers: z.array(z.object({ minQty: num().int('POSITIVE').positive('POSITIVE'), price: num().positive('POSITIVE') })).max(5),
    specs: z.array(z.object({ key: z.string().trim(), value: z.string().trim() })).max(20),
  })
  .superRefine((v, ctx) => {
    let prevQty = v.moq;
    let prevPrice = v.price;
    v.tiers.forEach((tier, i) => {
      if (tier.minQty <= prevQty) ctx.addIssue({ code: 'custom', path: ['tiers', i, 'minQty'], message: 'TIER_ABOVE_MOQ' });
      if (tier.price >= prevPrice) ctx.addIssue({ code: 'custom', path: ['tiers', i, 'price'], message: 'TIER_BELOW_BASE' });
      prevQty = tier.minQty;
      prevPrice = tier.price;
    });
  });
type Form = z.infer<typeof schema>;

const EMPTY: Form = {
  name: '',
  categorySlug: '',
  description: '',
  price: 0,
  unit: 'piece',
  moq: 1,
  stock: 0,
  discount: 0,
  deliveryDays: 2,
  tags: '',
  active: true,
  tiers: [],
  specs: [{ key: '', value: '' }],
};

export default function ProductFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const t = useT();
  const td = useTd();
  const f = useFormat();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: categories } = useCategories();
  const { data: product, isLoading, isError } = useQuery({ queryKey: qk.seller('product', id), queryFn: () => sellerApi.product(id!), enabled: isEdit });
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { register, control, handleSubmit, formState, reset, setError, setValue } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const tiers = useFieldArray({ control, name: 'tiers' });
  const specs = useFieldArray({ control, name: 'specs' });
  const watched = useWatch({ control });

  useEffect(() => {
    if (!product) return;
    reset({
      name: product.name,
      categorySlug: product.categorySlug,
      description: product.description,
      price: product.price,
      unit: product.unit,
      moq: product.moq,
      stock: product.stock,
      discount: product.discount,
      deliveryDays: product.deliveryDays,
      tags: product.tags.join(', '),
      active: product.status !== 'inactive',
      tiers: product.tiers,
      specs: product.specs.length ? product.specs : [{ key: '', value: '' }],
    });
    setImages(product.images);
  }, [product, reset]);

  const save = useMutation({
    mutationFn: (v: Form) => {
      const input: ProductInput = {
        name: v.name,
        categorySlug: v.categorySlug,
        description: v.description,
        images,
        price: Math.round(v.price),
        unit: v.unit as ProductUnit,
        moq: v.moq,
        stock: v.stock,
        discount: v.discount,
        deliveryDays: v.deliveryDays,
        tiers: v.tiers.map((x) => ({ minQty: x.minQty, price: Math.round(x.price) })),
        specs: v.specs.filter((s) => s.key && s.value),
        tags: v.tags
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 10),
        status: v.active ? 'active' : 'inactive',
      };
      return isEdit ? sellerApi.updateProduct(id!, input) : sellerApi.createProduct(input);
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['seller'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: qk.product(p.id) });
      toast.success(isEdit ? t('seller.form.updated') : t('seller.form.created'), {
        description: p.status === 'pending' ? t('seller.form.pendingNote') : undefined,
      });
      navigate('/seller/products');
    },
    onError: (e) => {
      if (!applyFieldErrors(e, setError)) toast.error(errorMessage(e));
    },
  });

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = 6 - images.length;
    const list = [...files].slice(0, room);
    if (list.some((file) => !file.type.startsWith('image/'))) return toast.error(t('errors.imageOnly'));
    if (list.some((file) => file.size > 8 * 1024 * 1024)) return toast.error(t('errors.imageTooLarge'));
    setUploading(true);
    try {
      const urls = await Promise.all(list.map(uploadImage));
      setImages((prev) => [...prev, ...urls]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const err = (msg?: string) => (msg ? td(`validation.${msg}`) : undefined);
  const e = formState.errors;

  if (isEdit && isLoading) return <PageLoader />;
  if (isEdit && (isError || !product)) return <ErrorState />;

  const unitLabel = td(`units.${watched.unit ?? 'piece'}`);
  const previewPrice = Math.round((Number(watched.price) || 0) * (1 - (Number(watched.discount) || 0) / 100));

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
      <Link to="/seller/products" className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" /> {t('seller.nav.products')}
      </Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{isEdit ? t('seller.form.editTitle') : t('seller.form.newTitle')}</h1>
          {product && product.status !== 'active' && product.status !== 'inactive' && (
            <Badge tone={product.status === 'pending' ? 'warning' : 'danger'} className="mt-2">
              {td(`product.status.${product.status}`)}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/seller/products')}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={save.isPending}>
            {isEdit ? t('common.save') : t('seller.form.publish')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title={t('seller.form.basic')} />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label={t('seller.form.name')} required error={err(e.name?.message)} className="sm:col-span-2">
                {(fid) => <Input id={fid} {...register('name')} invalid={!!e.name} placeholder={t('seller.form.namePlaceholder')} />}
              </Field>
              <Field label={t('seller.form.category')} required error={err(e.categorySlug?.message)}>
                {(fid) => (
                  <Select id={fid} {...register('categorySlug')} invalid={!!e.categorySlug}>
                    <option value="">—</option>
                    {categories?.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {f.text(c.name)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t('seller.form.tags')} hint={t('seller.form.tagsHint')}>
                {(fid) => <Input id={fid} {...register('tags')} placeholder="un, bug'doy, non" />}
              </Field>
              <Field label={t('seller.form.description')} required error={err(e.description?.message)} className="sm:col-span-2" hint={t('seller.form.descriptionHint')}>
                {(fid) => <Textarea id={fid} rows={6} {...register('description')} invalid={!!e.description} />}
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title={t('seller.form.images')} description={t('seller.form.imagesHint')} />
            <div className="grid grid-cols-3 gap-3 p-5 sm:grid-cols-6">
              {images.map((src, i) => (
                <div key={src.slice(-40) + i} className="group relative aspect-square overflow-hidden rounded-xl border border-border">
                  <img src={src} alt="" className="size-full object-cover" />
                  {i === 0 && <span className="absolute bottom-1 left-1 rounded bg-fg/80 px-1.5 py-0.5 text-[10px] font-semibold text-bg">{t('seller.form.cover')}</span>}
                  <div className="absolute inset-0 flex items-start justify-end gap-1 bg-black/0 p-1 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                    {i > 0 && (
                      <button type="button" className="rounded-md bg-surface p-1 text-fg" title={t('seller.form.makeCover')} onClick={() => setImages((prev) => [prev[i], ...prev.filter((_, j) => j !== i)])}>
                        <Star className="size-3.5" />
                      </button>
                    )}
                    <button type="button" className="rounded-md bg-surface p-1 text-danger" title={t('common.remove')} onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}>
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {images.length < 6 && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(ev) => ev.preventDefault()}
                  onDrop={(ev) => {
                    ev.preventDefault();
                    onFiles(ev.dataTransfer.files);
                  }}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border-strong text-fg-subtle transition-colors hover:border-primary hover:text-primary"
                >
                  {uploading ? <Loader2 className="size-6 animate-spin" /> : <ImagePlus className="size-6" />}
                  <span className="text-[11px] font-medium">{t('seller.form.addImage')}</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(ev) => onFiles(ev.target.files)} />
            </div>
          </Card>

          <Card>
            <CardHeader title={t('seller.form.pricing')} description={t('seller.form.pricingText')} />
            <div className="grid gap-4 p-5 sm:grid-cols-4">
              <Field label={t('seller.form.price')} required error={err(e.price?.message)} className="sm:col-span-2">
                {(fid) => <Input id={fid} type="number" min={0} {...register('price')} invalid={!!e.price} />}
              </Field>
              <Field label={t('product.unit')}>
                {(fid) => (
                  <Select id={fid} {...register('unit')}>
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {td(`units.${u}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t('seller.form.discount')} error={err(e.discount?.message)}>
                {(fid) => <Input id={fid} type="number" min={0} max={90} {...register('discount')} invalid={!!e.discount} />}
              </Field>
              <Field label={t('product.moq')} required error={err(e.moq?.message)} hint={t('seller.form.moqHint')}>
                {(fid) => <Input id={fid} type="number" min={1} {...register('moq')} invalid={!!e.moq} />}
              </Field>
            </div>
            <div className="border-t border-border p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">{t('product.tiers')}</div>
                  <div className="text-xs text-fg-subtle">{t('seller.form.tiersHint')}</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<Plus />}
                  disabled={tiers.fields.length >= 5}
                  onClick={() => {
                    const last = watched.tiers?.[watched.tiers.length - 1];
                    const baseQty = Number(last?.minQty ?? watched.moq ?? 1);
                    const basePrice = Number(last?.price ?? watched.price ?? 0);
                    tiers.append({ minQty: Math.max(2, baseQty * 5), price: Math.round(basePrice * 0.95) });
                  }}
                >
                  {t('seller.form.addTier')}
                </Button>
              </div>
              {!tiers.fields.length ? (
                <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-sm text-fg-muted">{t('seller.form.noTiers')}</p>
              ) : (
                <div className="space-y-2">
                  {tiers.fields.map((field, i) => (
                    <div key={field.id} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
                      <Field error={err(e.tiers?.[i]?.minQty?.message)}>
                        {(fid) => <Input id={fid} type="number" {...register(`tiers.${i}.minQty`)} invalid={!!e.tiers?.[i]?.minQty} leftIcon={<span className="text-xs font-semibold">≥</span>} placeholder={t('seller.form.fromQty')} />}
                      </Field>
                      <Field error={err(e.tiers?.[i]?.price?.message)}>
                        {(fid) => <Input id={fid} type="number" {...register(`tiers.${i}.price`)} invalid={!!e.tiers?.[i]?.price} placeholder={t('seller.form.unitPrice')} />}
                      </Field>
                      <Button variant="ghost" size="icon" onClick={() => tiers.remove(i)} aria-label={t('common.remove')}>
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={t('seller.form.inventory')} />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label={t('seller.form.stock')} required error={err(e.stock?.message)} hint={unitLabel}>
                {(fid) => <Input id={fid} type="number" min={0} {...register('stock')} invalid={!!e.stock} />}
              </Field>
              <Field label={t('seller.form.deliveryDays')} required error={err(e.deliveryDays?.message)}>
                {(fid) => <Input id={fid} type="number" min={1} max={60} {...register('deliveryDays')} invalid={!!e.deliveryDays} />}
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader
              title={t('seller.form.specs')}
              description={t('seller.form.specsHint')}
              action={
                <Button size="sm" variant="outline" leftIcon={<Plus />} disabled={specs.fields.length >= 20} onClick={() => specs.append({ key: '', value: '' })}>
                  {t('seller.form.addSpec')}
                </Button>
              }
            />
            <div className="space-y-2 p-5">
              {specs.fields.map((field, i) => (
                <div key={field.id} className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
                  <Input {...register(`specs.${i}.key`)} placeholder={t('seller.form.specKey')} />
                  <Input {...register(`specs.${i}.value`)} placeholder={t('seller.form.specValue')} />
                  <Button variant="ghost" size="icon" onClick={() => specs.remove(i)} aria-label={t('common.remove')}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <Switch checked={!!watched.active} onChange={(v) => setValue('active', v, { shouldDirty: true })} label={t('seller.form.visible')} description={t('seller.form.visibleText')} />
          </Card>
          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-2.5 text-xs font-semibold text-fg-subtle uppercase">{t('seller.form.preview')}</div>
            <div className="aspect-[4/3]">
              <ProductImage product={{ name: watched.name || '—', categorySlug: watched.categorySlug || 'food', images }} />
            </div>
            <div className="p-4">
              <div className={cn('line-clamp-2 font-semibold', !watched.name && 'text-fg-subtle')}>{watched.name || t('seller.form.namePlaceholder')}</div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-lg font-bold">{f.money(previewPrice)}</span>
                <span className="text-xs text-fg-subtle">/ {unitLabel}</span>
                {Number(watched.discount) > 0 && <Badge tone="danger">−{watched.discount}%</Badge>}
              </div>
              <div className="mt-1 text-xs text-fg-muted">{t('product.moqShort', { n: f.number(Number(watched.moq) || 1), unit: unitLabel })}</div>
              {!!watched.tiers?.length && (
                <ul className="mt-3 space-y-1 text-xs">
                  {watched.tiers.map((tier, i) => (
                    <li key={i} className="flex justify-between rounded-md bg-surface-2 px-2 py-1">
                      <span>≥ {f.number(Number(tier?.minQty) || 0)}</span>
                      <span className="font-semibold">{f.money(Math.round((Number(tier?.price) || 0) * (1 - (Number(watched.discount) || 0) / 100)))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </form>
  );
}
