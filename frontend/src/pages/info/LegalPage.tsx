import type { LegalDoc } from '@/content/legal';
import { useFormat, useT } from '@/i18n';
import { Breadcrumbs, Card } from '@/components/ui/display';

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const t = useT();
  const f = useFormat();
  return (
    <div className="container-page max-w-4xl py-6">
      <Breadcrumbs items={[{ label: t('nav.home'), to: '/' }, { label: doc.title }]} />
      <h1 className="mt-3 text-3xl font-bold tracking-tight">{doc.title}</h1>
      <p className="mt-1 text-sm text-fg-subtle">{t('legal.updated', { date: f.date(doc.updated, { day: 'numeric', month: 'long', year: 'numeric' }) })}</p>
      <Card className="mt-6 p-6 sm:p-10">
        <p className="leading-relaxed text-fg">{doc.intro}</p>
        <div className="mt-8 space-y-8">
          {doc.sections.map((s) => (
            <section key={s.title}>
              <h2 className="text-lg font-semibold">{s.title}</h2>
              {s.paragraphs?.map((p) => (
                <p key={p} className="mt-2 leading-relaxed text-fg-muted">
                  {p}
                </p>
              ))}
              {s.bullets && (
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-fg-muted">
                  {s.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </Card>
    </div>
  );
}
