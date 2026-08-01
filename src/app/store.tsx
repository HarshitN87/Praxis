import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Category, FullCommitment, LocalDate, Settings } from '../domain/types';
import * as repo from '../data/repo';
import { today as todayFor } from '../domain/dates';

interface StoreValue {
  ready: boolean;
  settings: Settings;
  categories: Category[];
  /** Every commitment, hydrated. One person's dataset — cheap to hold. */
  all: FullCommitment[];
  today: LocalDate;
  refresh: () => Promise<void>;
  setSettings: (patch: Partial<Settings>) => Promise<void>;
  reloadCategories: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettingsState] = useState<Settings>(repo.DEFAULT_SETTINGS);
  const [categories, setCategories] = useState<Category[]>([]);
  const [all, setAll] = useState<FullCommitment[]>([]);

  const refresh = useCallback(async () => {
    const [s, c, a] = await Promise.all([
      repo.getSettings(),
      repo.listCategories(),
      repo.getAllFull(),
    ]);
    setSettingsState(s);
    setCategories(c);
    setAll(a);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await repo.ensureSeeded();
      const s = await repo.getSettings();
      // F7 — sweep stale open commitments into an explicit `unresolved`
      // state on every launch, so they can never silently vanish from the
      // denominator.
      await repo.sweepUnresolved(s.timezone, s.dayBoundaryHour);
      if (cancelled) return;
      await refresh();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const setSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = await repo.updateSettings(patch);
      setSettingsState(next);
    },
    [],
  );

  /**
   * Apply the theme to the document root. 'auto' removes the attribute so the
   * prefers-color-scheme block in styles.css takes over, and the browser
   * chrome colour is kept in step so the PWA's status bar matches the page.
   */
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'auto') delete root.dataset.theme;
    else root.dataset.theme = settings.theme;

    const dark =
      settings.theme === 'dark' ||
      (settings.theme === 'auto' &&
        window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#15140f' : '#faf7f0');
  }, [settings.theme]);

  const reloadCategories = useCallback(async () => {
    setCategories(await repo.listCategories());
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      settings,
      categories,
      all,
      today: todayFor(settings.timezone, settings.dayBoundaryHour),
      refresh,
      setSettings,
      reloadCategories,
    }),
    [ready, settings, categories, all, refresh, setSettings, reloadCategories],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore must be used inside StoreProvider');
  return v;
}

export function useCategoryName(): (id: string | null) => string {
  const { categories } = useStore();
  return useCallback(
    (id: string | null) => categories.find((c) => c.id === id)?.name ?? 'Uncategorised',
    [categories],
  );
}
