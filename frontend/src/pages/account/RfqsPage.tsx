import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { catalogApi } from '@/api/endpoints';
import { qk } from '@/api/hooks';
import { useT } from '@/i18n';
import { PageHeader } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { RfqDialog } from '@/components/dialogs';
import { RfqList } from '@/components/RfqList';

export default function RfqsPage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [picking, setPicking] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [rfqOpen, setRfqOpen] = useState(false);
  const { data: companies } = useQuery({ queryKey: qk.companies({ pageSize: 100 }), queryFn: () => catalogApi.companies({ pageSize: 100 }), enabled: picking });

  useEffect(() => {
    if (params.get('new')) {
      setPicking(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const company = companies?.items.find((c) => c.id === companyId);

  return (
    <>
      <PageHeader
        title={t('account.nav.rfqs')}
        description={t('rfq.pageSubtitle')}
        actions={
          <Button leftIcon={<Plus />} onClick={() => setPicking(true)}>
            {t('rfq.new')}
          </Button>
        }
      />
      <RfqList mode="buyer" />

      <Modal
        open={picking}
        onClose={() => setPicking(false)}
        size="sm"
        title={t('rfq.new')}
        footer={
          <Button
            disabled={!companyId}
            onClick={() => {
              setPicking(false);
              setRfqOpen(true);
            }}
          >
            {t('common.continue')}
          </Button>
        }
      >
        <Field label={t('rfq.chooseSupplier')} hint={t('rfq.chooseSupplierHint')}>
          {(id) => (
            <Select id={id} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">—</option>
              {companies?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.region})
                </option>
              ))}
            </Select>
          )}
        </Field>
      </Modal>
      {company && <RfqDialog open={rfqOpen} onClose={() => setRfqOpen(false)} companyId={company.id} companyName={company.name} />}
    </>
  );
}
