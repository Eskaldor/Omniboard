import {
  normalizeSheetAccordionDisplay,
  type SystemSheetLayoutTab,
  type SystemSheetProfileSection,
  type SystemSheetProfile,
} from '../hooks/useSystemSheetProfiles';

export function cloneSheetProfiles(list: SystemSheetProfile[]): SystemSheetProfile[] {
  return JSON.parse(JSON.stringify(list)) as SystemSheetProfile[];
}

/** Normalize accordions + exactly one `is_default` profile before POST. */
export function normalizeSheetProfilesForSave(list: SystemSheetProfile[]): SystemSheetProfile[] {
  const normalizeSection = (sec: SystemSheetProfileSection | null | undefined): SystemSheetProfileSection | undefined => {
    const acc = sec?.accordions;
    if (!Array.isArray(acc)) return undefined;
    return {
      accordions: acc.map((a) => ({
        name: (typeof a.name === 'string' ? a.name : '').trim() || '—',
        columns: Array.isArray(a.columns) ? [...a.columns] : [],
        display: normalizeSheetAccordionDisplay(a.display),
      })),
    };
  };

  const withNormalized = list.map((p) => {
    const stats = normalizeSection(p.stats);
    const actions = normalizeSection(p.actions);
    const tabs: SystemSheetLayoutTab[] | undefined = (p.tabs ?? []).map((tab) => {
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
    });
    return { ...p, stats, actions, tabs };
  });

  const defaultIdx = withNormalized.findIndex((p) => p.is_default === true);
  return withNormalized.map((p, i) => {
    const next: SystemSheetProfile = {
      id: p.id,
      name: p.name,
      ...(p.stats ? { stats: p.stats } : {}),
      ...(p.actions ? { actions: p.actions } : {}),
      ...(typeof p.custom_component_id === 'string' && p.custom_component_id.trim()
        ? { custom_component_id: p.custom_component_id.trim() }
        : {}),
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
