import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Download, Eye, EyeOff, MoreHorizontal, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { sellerApi } from '@/api/endpoints';
import { qk, useCategories } from '@/api/hooks';
import { useFormat, useT, useTd } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { downloadFile, toCsv } from '@/lib/utils';
import { unitPriceFor } from '@/lib/pricing';
import type { Product, ProductStatus } from '@/types';
import { ProductImage } from '@/components/catalog';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Pagination, Skeleton, Tabs } from '@/components/ui/display';
import { Button, ButtonLink } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Dropdown, MenuItem, useConfirm } from '@/components/ui/overlay';
import { Table, TD, TH, THead, TR } from '@/components/ui/table';

const STATUS_TONE: Record<ProductStatus, 'success' | 'neutral' | 'warning' | 'danger'> = { active: 'success', inactive: 'neutral', pending: 'warning', rejected: 'danger' };

export default function SellerProductsPage() {
  const t = useT();
  const td = useTd();
  const f = useFormat();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: categories } = useCategories();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const status = params.get('status') ?? 'all';
  const query = { q: params.get('q') ?? undefined, status: status === 'all' ? undefined : status, category: params.get('category') ?? undefined, page: Number(params.get('page')) || 1 };
  const { data, isLoading, isError, refetch, isPlaceholderData } = useQuery({ queryKey: qk.seller('products', query), queryFn: () => sellerApi.products(query), placeholderData: keepPreviousData });

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['seller'] });
    qc.invalidateQueries({ queryKey: ['products'] });
  };
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Product> }) => sellerApi.updateProduct(id, patch as never),
    onSuccess: () => {
      invalidate();
      toast.success(t('common.saved'));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: sellerApi.deleteProduct,
    onSuccess: () => {
      invalidate();
      toast.success(t('seller.products.deleted'));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const duplicate = useMutation({
    mutationFn: (p: Product) =>
      sellerApi.createProduct({
        name: `${p.name} (${t('seller.products.copy')})`,
        categorySlug: p.categorySlug,
        description: p.description,
        images: p.images,
        price: p.price,
        unit: p.unit,
        moq: p.moq,
        stock: p.stock,
        discount: p.discount,
        tiers: p.tiers,
        specs: p.specs,
        tags: p.tags,
        deliveryDays: p.deliveryDays,
        status: 'inactive',
      }),
    onSuccess: () => {
      invalidate();
      toast.success(t('seller.products.duplicated'));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const exportCsv = async () => {
    const all = await sellerApi.products({ ...query, page: 1, pageSize: 100 });
    downloadFile(
      `products-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv([
        ['ID', 'Name', 'Category', 'Price', 'Unit', 'MOQ', 'Stock', 'Discount', 'Status', 'Sold'],
        ...all.items.map((p) => [p.id, p.name, p.categorySlug, p.price, p.unit, p.moq, p.stock, p.discount, p.status, p.soldCount]),
      ]),
    );
  };

  return (
    <div>
      <PageHeader
        title={t('seller.nav.products')}
        description={data ? t('seller.products.count', { n: data.total }) : undefined}
        actions={
          <>
            <Button variant="outline" leftIcon={<Download />} onClick={exportCsv}>
              {t('common.exportCsv')}
            </Button>
            <ButtonLink to="/seller/products/new" leftIcon={<Plus />}>
              {t('seller.addProduct')}
            </ButtonLink>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <form
          className="min-w-56 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q: q.trim() || undefined });
          }}
        >
          <Input leftIcon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('seller.products.search')} />
        </form>
        <div className="w-56">
          <Select value={query.category ?? ''} onChange={(e) => set({ category: e.target.value || undefined })}>
            <option value="">{t('catalog.allCategories')}</option>
            {categories?.map((c) => (
              <option key={c.slug} value={c.slug}>
                {f.text(c.name)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <Tabs
        className="mb-4"
        value={status}
        onChange={(v) => set({ status: v === 'all' ? undefined : v })}
        items={['all', 'active', 'inactive', 'pending', 'low_stock'].map((s) => ({
          value: s,
          label: s === 'all' ? t('orders.tabs.all') : s === 'low_stock' ? t('seller.products.lowStock') : td(`product.status.${s}`),
        }))}
      />

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <Card>
          <EmptyState
            icon={<Package />}
            title={t('seller.products.empty')}
            description={t('seller.products.emptyText')}
            action={
              <ButtonLink to="/seller/products/new" leftIcon={<Plus />}>
                {t('seller.addProduct')}
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <Card className={isPlaceholderData ? 'opacity-60' : ''}>
          <Table>
            <THead>
              <tr>
                <TH>{t('seller.products.col.product')}</TH>
                <TH className="text-right">{t('seller.products.col.price')}</TH>
                <TH className="text-right">{t('seller.products.col.stock')}</TH>
                <TH className="text-right">{t('seller.products.col.sold')}</TH>
                <TH>{t('orders.col.status')}</TH>
                <TH className="w-10" />
              </tr>
            </THead>
            <tbody>
              {data.items.map((p) => {
                const low = p.stock < p.moq * 3;
                return (
                  <TR key={p.id}>
                    <TD>
                      <div className="flex min-w-64 items-center gap-3">
                        <div className="size-12 shrink-0 overflow-hidden rounded-lg">
                          <ProductImage product={p} iconClassName="size-5" />
                        </div>
                        <div className="min-w-0">
                          <Link to={`/seller/products/${p.id}/edit`} className="line-clamp-1 font-medium hover:text-primary">
                            {p.name}
                          </Link>
                          <div className="text-xs text-fg-subtle">
                            {f.text(categories?.find((c) => c.slug === p.categorySlug)?.name ?? { uz: p.categorySlug, ru: p.categorySlug, en: p.categorySlug })} · MOQ {f.number(p.moq)} {td(`units.${p.unit}`)}
                          </div>
                        </div>
                      </div>
                    </TD>
                    <TD className="text-right whitespace-nowrap">
                      <div className="font-semibold">{f.money(unitPriceFor(p, p.moq))}</div>
                      {p.discount > 0 && <div className="text-xs text-danger">−{p.discount}%</div>}
                    </TD>
                    <TD className="text-right whitespace-nowrap">
                      <span className={low ? 'font-semibold text-warning' : ''}>{f.number(p.stock)}</span>
                    </TD>
                    <TD className="text-right">{f.number(p.soldCount)}</TD>
                    <TD>
                      <Badge tone={STATUS_TONE[p.status]} dot>
                        {td(`product.status.${p.status}`)}
                      </Badge>
                    </TD>
                    <TD>
                      <Dropdown
                        trigger={({ toggle }) => (
                          <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={t('common.actions')}>
                            <MoreHorizontal />
                          </Button>
                        )}
                      >
                        {(close) => (
                          <>
                            <Link to={`/seller/products/${p.id}/edit`} onClick={close}>
                              <MenuItem icon={<Pencil />}>{t('common.edit')}</MenuItem>
                            </Link>
                            <Link to={`/products/${p.id}`} onClick={close}>
                              <MenuItem icon={<Eye />}>{t('seller.products.view')}</MenuItem>
                            </Link>
                            {['active', 'inactive'].includes(p.status) && (
                              <MenuItem
                                icon={p.status === 'active' ? <EyeOff /> : <Eye />}
                                onClick={() => {
                                  close();
                                  update.mutate({ id: p.id, patch: { status: p.status === 'active' ? 'inactive' : 'active' } });
                                }}
                              >
                                {p.status === 'active' ? t('seller.products.hide') : t('seller.products.publish')}
                              </MenuItem>
                            )}
                            <MenuItem
                              icon={<Copy />}
                              onClick={() => {
                                close();
                                duplicate.mutate(p);
                              }}
                            >
                              {t('seller.products.duplicate')}
                            </MenuItem>
                            <MenuItem
                              icon={<Trash2 />}
                              danger
                              onClick={async () => {
                                close();
                                if (await confirm({ title: t('seller.products.deleteConfirm', { name: p.name }), danger: true, confirmText: t('common.delete') })) remove.mutate(p.id);
                              }}
                            >
                              {t('common.delete')}
                            </MenuItem>
                          </>
                        )}
                      </Dropdown>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
          <div className="border-t border-border p-3">
            <Pagination page={data.page} totalPages={data.totalPages} onChange={(p) => set({ page: String(p) })} />
          </div>
        </Card>
      )}
    </div>
  );
}
