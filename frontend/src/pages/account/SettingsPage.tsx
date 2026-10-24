import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Monitor, Moon, RotateCcw, Sun } from 'lucide-react';
import { authApi, miscApi } from '@/api/endpoints';
import { USE_MOCK } from '@/api/client';
import { useAuth } from '@/stores/auth';
import { useSettings, type Theme } from '@/stores/settings';
import { LOCALES, useT } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import type { Currency, User } from '@/types';
import { Card, CardHeader, PageHeader } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/form';
import { useConfirm } from '@/components/ui/overlay';
import { useLogout } from '@/components/layout/HeaderControls';

export default function SettingsPage() {
  const t = useT();
  const confirm = useConfirm();
  const logout = useLogout();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user)!;
  const setUser = useAuth((s) => s.setUser);
  const { locale, currency, theme, setLocale, setCurrency, setTheme } = useSettings();

  const prefs = useMutation({
    mutationFn: (p: User['notificationPrefs']) => authApi.updateMe({ notificationPrefs: p }),
    onSuccess: (u) => setUser(u),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const setPref = (k: keyof User['notificationPrefs'], v: boolean) => {
    const next = { ...user.notificationPrefs, [k]: v };
    setUser({ ...user, notificationPrefs: next });
    prefs.mutate(next);
  };

  const option = (active: boolean) =>
    cn('flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors', active ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-border-strong hover:border-fg-subtle');

  const themes: { v: Theme; icon: React.ReactNode }[] = [
    { v: 'light', icon: <Sun className="size-4" /> },
    { v: 'dark', icon: <Moon className="size-4" /> },
    { v: 'system', icon: <Monitor className="size-4" /> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title={t('account.nav.settings')} />
      <Card>
        <CardHeader title={t('settings.preferences')} description={t('settings.preferencesText')} />
        <div className="space-y-5 p-5">
          <div>
            <div className="mb-2 text-sm font-medium">{t('settings.language')}</div>
            <div className="grid grid-cols-3 gap-2">
              {LOCALES.map((l) => (
                <button key={l.code} onClick={() => setLocale(l.code)} className={option(l.code === locale)}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">{t('settings.currency')}</div>
            <div className="grid grid-cols-3 gap-2">
              {(['UZS', 'USD', 'RUB'] as Currency[]).map((c) => (
                <button key={c} onClick={() => setCurrency(c)} className={option(c === currency)}>
                  {c}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-fg-subtle">{t('settings.currencyHint')}</p>
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">{t('settings.theme')}</div>
            <div className="grid grid-cols-3 gap-2">
              {themes.map(({ v, icon }) => (
                <button key={v} onClick={() => setTheme(v)} className={option(v === theme)}>
                  {icon} {t(`settings.themes.${v}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={t('settings.notifications')} description={t('settings.notificationsText')} />
        <div className="divide-y divide-border px-5">
          {(['orders', 'email', 'sms', 'marketing'] as const).map((k) => (
            <div key={k} className="py-4">
              <Switch checked={user.notificationPrefs[k]} onChange={(v) => setPref(k, v)} label={t(`settings.notif.${k}`)} description={t(`settings.notif.${k}Text`)} />
            </div>
          ))}
        </div>
      </Card>

      {USE_MOCK && (
        <Card>
          <CardHeader title={t('settings.demo')} description={t('settings.demoText')} />
          <div className="p-5">
            <Button
              variant="outline"
              leftIcon={<RotateCcw />}
              onClick={async () => {
                if (!(await confirm({ title: t('settings.resetConfirm'), description: t('settings.resetText'), danger: true }))) return;
                try {
                  await miscApi.resetDemo();
                  qc.clear();
                  logout();
                  toast.success(t('settings.resetDone'));
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            >
              {t('settings.reset')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
