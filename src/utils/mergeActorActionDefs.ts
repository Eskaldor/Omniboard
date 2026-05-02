import type { Actor } from '../types';
import type { SystemActionDef } from '../hooks/useSystemActions';

/** System `actions.json` plus actor-only macros (`custom_formula` on the actor). */
export function mergeActorActionDefs(
  systemActions: Record<string, SystemActionDef>,
  actor: Actor,
): Record<string, SystemActionDef> {
  const out: Record<string, SystemActionDef> = { ...systemActions };
  for (const [key, ov] of Object.entries(actor.actions ?? {})) {
    const cf = typeof ov?.custom_formula === 'string' ? ov.custom_formula.trim() : '';
    if (!cf) continue;
    const nm =
      (typeof ov?.custom_name === 'string' && ov.custom_name.trim()) || key;
    out[key] = { name: nm, formula: cf };
  }
  return out;
}
