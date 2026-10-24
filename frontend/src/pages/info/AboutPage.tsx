import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Handshake, Leaf, ShieldCheck, Target, Zap } from 'lucide-react';
import { catalogApi } from '@/api/endpoints';
import { qk } from '@/api/hooks';
import { useT } from '@/i18n';
import { Breadcrumbs, Card } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';
import { CountUp, Reveal } from '@/components/motion';

export default function AboutPage() {
  const t = useT();
  const { data: stats } = useQuery({ queryKey: qk.stats, queryFn: catalogApi.stats });
  const values = [
    { icon: <ShieldCheck />, title: t('about.values.trust'), text: t('about.values.trustText') },
    { icon: <Zap />, title: t('about.values.speed'), text: t('about.values.speedText') },
    { icon: <Handshake />, title: t('about.values.fair'), text: t('about.values.fairText') },
    { icon: <Leaf />, title: t('about.values.local'), text: t('about.values.localText') },
  ];
  return (
    <div>
      <section className="border-b border-border bg-surface">
        <div className="container-page py-12">
          <Breadcrumbs items={[{ label: t('nav.home'), to: '/' }, { label: t('nav.about') }]} />
          <div className="mt-6 grid items-center gap-10 lg:grid-cols-2">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight">{t('about.title')}</h1>
              <p className="mt-4 text-lg text-fg-muted">{t('about.lead')}</p>
              <p className="mt-4 text-fg-muted">{t('about.text')}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { v: stats?.companies, l: t('home.stats.suppliers') },
                { v: stats?.products, l: t('home.stats.products') },
                { v: stats?.buyers, l: t('about.buyers') },
                { v: stats?.orders, l: t('about.orders') },
              ].map((s, i) => (
                <Reveal key={s.l} delay={i * 0.08}>
                  <Card className="p-6 transition-shadow hover:shadow-(--shadow-pop)">
                    <div className="text-3xl font-extrabold text-primary">{s.v !== undefined ? <CountUp to={s.v} format={(n) => `${Math.round(n)}+`} /> : '—'}</div>
                    <div className="mt-1 text-sm text-fg-muted">{s.l}</div>
                  </Card>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="container-page py-12">
        <Card className="flex flex-col gap-4 p-8 sm:flex-row sm:items-center">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-fg">
            <Target className="size-7" />
          </span>
          <div>
            <h2 className="text-xl font-bold">{t('about.mission')}</h2>
            <p className="mt-1 text-fg-muted">{t('about.missionText')}</p>
          </div>
        </Card>
        <h2 className="mt-12 mb-5 text-2xl font-bold">{t('about.valuesTitle')}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {values.map((v) => (
            <Card key={v.title} className="p-6">
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-fg [&_svg]:size-5">{v.icon}</span>
              <h3 className="mt-4 font-semibold">{v.title}</h3>
              <p className="mt-1 text-sm text-fg-muted">{v.text}</p>
            </Card>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <ButtonLink to="/catalog" size="lg" rightIcon={<ArrowRight />}>
            {t('account.findProducts')}
          </ButtonLink>
          <ButtonLink to="/register?role=seller" size="lg" variant="outline">
            {t('header.becomeSeller')}
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}
