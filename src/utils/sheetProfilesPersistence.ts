import {
  normalizeSheetAccordionDisplay,
  type SystemSheetLayoutTab,
  type SystemSheetProfile,
} from '../hooks/useSystemSheetProfiles';

export function cloneSheetProfiles(list: SystemSheetProfile[]): SystemSheetProfile[] {
  return JSON.parse(JSON.stringify(list)) as SystemSheetProfile[];
}

/** Normalize accordions + exactly one `is_default` profile before POST. */
export function normalizeSheetProfilesForSave(list: SystemSheetProfile[]): SystemSheetProfile[] {
  const withTabs = list.map((p) => ({
    ...p,
    tabs: (p.tabs ?? []).map((tab) => {
      const { panel_action_keys: _legacy, ...tabBase } = tab as SystemSheetLayoutTab & {
        panel_action_keys?: unknown;
      };
      return {
        ...tabBase,
        accordions: tab.accordions?.map((a) => ({
          name: (typeof a.name === 'string' ? a.name : '').trim() || '—',
          columns: Array.isArray(a.columns) ? [...a.columns] : [],
          display: normalizeSheetAccordionDisplay(a.display),
        })),
      };
    }),
  }));
  const defaultIdx = withTabs.findIndex((p) => p.is_default === true);
  return withTabs.map((p, i) => {
    const next: SystemSheetProfile = {
      id: p.id,
      name: p.name,
      tabs: p.tabs,
    };
    if (p.is_default === true && defaultIdx >= 0 && i === defaultIdx) {
      next.is_default = true;
    }
    if (Array.isArray(p.hero_columns) && p.hero_columns.length > 0) {
      next.hero_columns = [...p.hero_columns];
    }
    return next;
  });
}
