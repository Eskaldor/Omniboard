import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import i18n from '../i18n';

/** How grouped stats/actions render under the section heading on the mini-sheet. */
export type SheetAccordionSectionDisplay = 'accordion' | 'open';

/**
 * Accordion block inside a sheet tab.
 * On **stats** tab, `columns` are initiative column keys.
 * On **actions** tab, `columns` are macro ids from `actions.json`.
 */
export interface SystemSheetLayoutAccordion {
  name: string;
  columns: string[];
  /**
   * `accordion` — content inside collapsible `<details>` (default when omitted).
   * `open` — content always visible under the decorative heading only.
   */
  display?: SheetAccordionSectionDisplay;
}

/** Normalize persisted `display`; unknown/missing → `accordion` (legacy behaviour). */
export function normalizeSheetAccordionDisplay(v: unknown): SheetAccordionSectionDisplay {
  return v === 'open' ? 'open' : 'accordion';
}

export interface SystemSheetLayoutTab {
  id: string;
  name?: string;
  accordions?: SystemSheetLayoutAccordion[];
  content?: string;
}

function migrateLegacySheetTab(tab: unknown): SystemSheetLayoutTab {
  if (tab == null || typeof tab !== 'object' || Array.isArray(tab)) {
    return { id: '' };
  }
  const raw = tab as Record<string, unknown>;
  const tabId = typeof raw.id === 'string' ? raw.id : '';
  const legacyRaw = raw.panel_action_keys;
  const legacyKeys: string[] = Array.isArray(legacyRaw)
    ? legacyRaw.filter((x): x is string => typeof x === 'string')
    : [];
  const hasAccordions = Array.isArray(raw.accordions) && raw.accordions.length > 0;
  const { panel_action_keys: _removed, ...strippedRest } = tab as SystemSheetLayoutTab & {
    panel_action_keys?: unknown;
  };
  const stripped = { ...strippedRest, id: tabId } as SystemSheetLayoutTab;

  if (tabId !== 'actions') {
    return stripped;
  }

  if (legacyRaw !== undefined && !hasAccordions) {
    if (legacyKeys.length === 0) {
      return { ...stripped, accordions: [] };
    }
    return {
      ...stripped,
      accordions: [{ name: '\u2014', columns: [...legacyKeys] }],
    };
  }

  return stripped;
}

/** One mini-sheet template profile (merged default + system override). */
export interface SystemSheetProfile {
  id: string;
  name: string;
  /** When true, actors without `sheet_profile_id` use this profile. Only one should be true per save. */
  is_default?: boolean;
  tabs?: SystemSheetLayoutTab[];
}

/** Legacy shape consumed by mini-sheet rendering (tabs only). */
export interface SystemSheetLayout {
  tabs?: SystemSheetLayoutTab[];
}

export function parseSheetProfiles(data: unknown): SystemSheetProfile[] {
  if (!Array.isArray(data)) return [];
  const out: SystemSheetProfile[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const id = rec.id;
    const name = rec.name;
    if (typeof id !== 'string' || !id.trim()) continue;
    const rawTabs = Array.isArray(rec.tabs) ? (rec.tabs as SystemSheetLayoutTab[]) : undefined;
    const profile: SystemSheetProfile = {
      id: id.trim(),
      name: typeof name === 'string' ? name : id.trim(),
      tabs: rawTabs?.map((tab) => migrateLegacySheetTab(tab)),
    };
    if (rec.is_default === true) profile.is_default = true;
    out.push(profile);
  }
  return out;
}

/** Resolved profile for mini-sheet when actor may omit `sheet_profile_id`. */
export function resolveActiveSheetProfile(
  profiles: SystemSheetProfile[],
  actorSheetProfileId: string | null | undefined,
): SystemSheetProfile | null {
  const sid = (actorSheetProfileId ?? '').trim();
  if (sid && profiles.some((p) => p.id === sid)) {
    return profiles.find((p) => p.id === sid) ?? null;
  }
  return (
    profiles.find((p) => p.is_default === true) ||
    profiles.find((p) => p.id === 'default') ||
    profiles[0] ||
    null
  );
}

export async function saveSystemSheetProfiles(
  systemName: string,
  profiles: SystemSheetProfile[],
): Promise<boolean> {
  const name = (systemName || '').trim();
  if (!name) {
    toast.error(i18n.t('config_modal.sheet_layout_save_fail'));
    return false;
  }
  try {
    const res = await fetch(`/api/systems/${encodeURIComponent(name)}/sheet_profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profiles),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(detail || String(res.status));
    }
    toast.success(i18n.t('config_modal.sheet_layout_save_ok'));
    return true;
  } catch {
    toast.error(i18n.t('config_modal.sheet_layout_save_fail'));
    return false;
  }
}

export function useSystemSheetProfiles(systemName: string) {
  const [profiles, setProfiles] = useState<SystemSheetProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const refetchProfiles = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    const name = (systemName || '').trim();
    if (!name) {
      setProfiles([]);
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    setLoading(true);

    fetch(`/api/systems/${encodeURIComponent(name)}/sheet_profiles`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        if (!ac.signal.aborted) setProfiles(parseSheetProfiles(data));
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        if (!ac.signal.aborted) setProfiles([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [systemName, reloadNonce]);

  return { profiles, loading, refetchProfiles };
}
