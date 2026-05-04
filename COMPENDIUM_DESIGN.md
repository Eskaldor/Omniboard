# Compendium — Design Document

> **Version:** 1.0  
> **Date:** 04.05.2026  
> **Status:** Production Ready  
> **Component:** `src/components/Compendium/*`

---

## 1. Overview

**Compendium** is a React component for searching, filtering, and adding NPCs/monsters to the initiative tracker. It provides a modern, data-driven UI that works with **any TTRPG system** without hardcoded stat names.

### Key Features
- **Data-driven filters**: column config generates UI automatically
- **Multi-type filters**: select, text, and number ranges
- **Full-text search** with live results
- **Smart sorting** by any numeric/text column
- **Accordion rows** with mini-sheet previews
- **Compact design**: no portraits, pure stats and indicators

### Tech Stack
- React 19 + TypeScript
- Tailwind CSS v4 (no component library)
- lucide-react icons
- Dark theme (zinc/emerald palette)

---

## 2. Architecture

### File Structure
```
src/components/Compendium/
├── Compendium.tsx          # Main component + subcomponents
├── CompendiumModal.tsx     # Modal wrapper (data fetching)
└── index.ts                # Barrel export
```

### Component Hierarchy
```
Compendium (root, state mgmt)
├── Left Sidebar
│   ├── System Badge
│   ├── Tab Navigation (NPC / Characters)
│   └── Result Counter
├── Main Content
│   ├── Search Bar
│   ├── DynamicFilterBar
│   │   ├── [FilterControl] × N
│   │   └── Sort Controls
│   └── ActorList
│       └── [RosterRow] × filtered
│           ├── Main Row
│           └── Accordion Body
│               └── DefaultSystemSheetPlaceholder
```

### State & Props

**Compendium Props:**
```typescript
interface CompendiumProps {
  systemName: string;
  systemColumns: CompendiumColumnConfig[];
  actors: Actor[];
  onAdd: (actor: Actor, count: number) => void;
  className?: string;
}
```

**Internal State:**
```typescript
const [activeTab, setActiveTab] = useState<'npc' | 'characters'>('npc');
const [search, setSearch] = useState('');
const [filters, setFilters] = useState<FilterState>({});
const [sortKey, setSortKey] = useState<string | null>(null);
const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
```

**FilterState Type:**
```typescript
type FilterState = Record<string, string | [string, string]>;
// Example:
// { "cr": "2", "type": ["humanoid", "beast"], "intelligence": ["3", "12"] }
```

---

## 3. Data-Driven Filters

### CompendiumColumnConfig Extension

The component extends `ColumnConfig` with an optional `roster_filter` field:

```typescript
interface CompendiumColumnConfig extends ColumnConfig {
  roster_filter?: {
    enabled: boolean;
    filter_type: 'select' | 'text' | 'number';
    label?: string;  // Override display label
  };
}
```

### Filter Generation Logic

In `DynamicFilterBar`, for each column where `roster_filter.enabled === true`:

1. **Select Filter**
   - Collect unique non-null values from all actors
   - Display as dropdown with "All" option
   - Sorted alphabetically
   - Match: substring contains (case-insensitive)

2. **Text Filter**
   - Freeform input field
   - Placeholder: "…"
   - Match: substring contains (case-insensitive)

3. **Number Filter**
   - Pair of inputs (min, max)
   - Both optional
   - Match: value ∈ [min, max]

### Filter Application Order
1. Name search → subset A
2. Column filters → subset B (from A)
3. Sort → final result

---

## 4. Row Design

### RosterRow Structure
```
[chevron ↓] [role●] [Name...........]  [stats cols...] | [1][+]
```

**Elements:**
- **Chevron**: rotates on accordion toggle
- **Role dot**: colored by `actor.role` (enemy=red, ally=emerald, etc.)
- **Name**: truncated, fixed 160px
- **Stat columns**: flex layout, auto-wrap
  - Each column shows: `label: value`
  - If `display_as_fraction` + `max_key`: `value/max`
  - Compact alignment with small gaps
- **Count input**: 1–99, editable
- **Add button**: emerald on hover

### Accordion Accordion Body
Opens smoothly with CSS `transition-[max-height]`:
- Placeholder stats grid (4–6 columns, responsive)
- Role badge + Initiative metadata
- Effects list with icons and duration
- Footer: "Full stat block will go here"

---

## 5. Filtering Logic

### Search Algorithm
```typescript
let result = actors;

// 1. Name search
if (search.trim()) {
  const q = search.toLowerCase();
  result = result.filter(a => a.name.toLowerCase().includes(q));
}

// 2. Column filters
for (const col of systemColumns) {
  if (!col.roster_filter?.enabled) continue;
  const val = filters[col.key];
  if (!val) continue;

  if (col.roster_filter.filter_type === 'select' || 'text') {
    const fq = (val as string).toLowerCase();
    result = result.filter(a => {
      const sv = a.stats[col.key];
      return String(sv).toLowerCase().includes(fq);
    });
  } else if (col.roster_filter.filter_type === 'number') {
    const [minStr, maxStr] = val as [string, string];
    const min = minStr ? parseFloat(minStr) : null;
    const max = maxStr ? parseFloat(maxStr) : null;
    result = result.filter(a => {
      const n = parseFloat(a.stats[col.key]);
      if (!Number.isFinite(n)) return true;
      if (min !== null && n < min) return false;
      if (max !== null && n > max) return false;
      return true;
    });
  }
}

// 3. Sort
result.sort((a, b) => {
  const va = sortKey ? a.stats[sortKey] : a.name;
  const vb = sortKey ? b.stats[sortKey] : b.name;
  const cmp = typeof va === 'number' && typeof vb === 'number'
    ? va - vb
    : String(va).localeCompare(String(vb), { numeric: true });
  return sortDir === 'asc' ? cmp : -cmp;
});
```

---

## 6. UI/UX Details

### Color Scheme (Dark Theme)
- **Background**: `bg-zinc-950` (main), `bg-zinc-900` (panels)
- **Text**: `text-zinc-200` (primary), `text-zinc-600` (secondary)
- **Borders**: `border-zinc-800` / `border-zinc-700`
- **Accents**: `emerald-*` (active, hover, buttons)
- **Roles**: red (enemy), emerald (ally), blue (character), zinc (neutral)

### Interactions
- **Hover rows**: subtle background shift `hover:bg-zinc-800/40`
- **Focus inputs**: emerald border on focus
- **Transitions**: 150–200ms ease-in-out (smooth but snappy)
- **Chevron animation**: 200ms rotate transform

### Responsive Behavior
- **Mobile** (`<sm`): tab navigation switches to horizontal chips
- **Tablets**: compact sidebar, normal layout
- **Desktop**: full sidebar + wide content
- **Scrolling**: custom webkit scrollbar (thin, zinc/emerald)

---

## 7. Integration Points

### In `App.tsx`
```typescript
import { CompendiumModal } from './components/Compendium';

// State
const [showCompendium, setShowCompendium] = useState(false);

// Button in toolbar
<button onClick={() => setShowCompendium(true)}>
  <BookOpen size={16} /> Компендиум
</button>

// Render
{showCompendium && (
  <CompendiumModal
    systemName={systemName}
    systemColumns={columns}
    onClose={() => setShowCompendium(false)}
    onAdd={(actor, count) => {
      for (let i = 0; i < count; i++) addFromRoster(actor);
      setShowCompendium(false);
    }}
  />
)}
```

### API Calls
- **Fetch actors**: `GET /api/systems/{systemName}/actors`
- **Add to tracker**: use existing `addFromRoster(actor)` logic

### Context Dependencies
- `useColumns()` → `systemColumns` and `systemName`
- `useCombatState()` → `addFromRoster` callback

---

## 8. Future Enhancements

### Planned (Backlog)
- [ ] **Characters tab**: load player characters from campaign
- [ ] **Favorites**: star/bookmark frequently used actors
- [ ] **Quick-add groups**: preset groups (e.g., "Goblin Squad ×3")
- [ ] **Advanced filters**: multi-select, ranges, boolean logic
- [ ] **Export**: save current filtered list as encounter preset
- [ ] **Bulk edit**: modify stats of selected actors before adding

### Extension Points
1. **Custom sheet providers**: replace `DefaultSystemSheetPlaceholder` with system-specific renderers
2. **Filter plugins**: add custom filter types via system config
3. **Theme customization**: allow overriding color palette per system
4. **Localization**: all UI strings support i18next (ready for multiple languages)

---

## 9. Performance Considerations

### Optimization Techniques
- **React.memo on RosterRow**: prevents unnecessary re-renders of list items
- **useMemo for filtered/sorted lists**: recalculates only when dependencies change
- **useCallback for handlers**: stable function references prevent child re-renders
- **Local expandedId state in ActorList**: accordion state doesn't bubble up

### Typical Dataset
- **100–200 actors**: smooth filtering and rendering
- **1000+ actors**: recommend pagination or lazy-loading in future

### Memory Usage
- Filter state: O(n) where n = number of active filters (typically 1–5)
- Expanded accordion: O(1) per row (max-height transition, not DOM duplication)

---

## 10. Example: Using Roster Filters in System Config

Add to `data/systems/D&D 5e/columns.json`:

```json
[
  {
    "key": "hp",
    "label": "HP",
    "type": "number",
    "showInTable": true,
    "max_key": "hp_max",
    "display_as_fraction": true,
    "roster_filter": {
      "enabled": true,
      "filter_type": "number",
      "label": "Hit Points"
    }
  },
  {
    "key": "type",
    "label": "Type",
    "type": "string",
    "showInTable": true,
    "roster_filter": {
      "enabled": true,
      "filter_type": "select"
    }
  },
  {
    "key": "notes",
    "label": "Notes",
    "type": "text",
    "showInTable": false,
    "roster_filter": {
      "enabled": true,
      "filter_type": "text",
      "label": "Search Notes"
    }
  }
]
```

---

## 11. Accessibility & Localization

### a11y
- Tab navigation with `aria-label` and `role="button"`
- Keyboard support: Tab, Enter, Space
- Semantic HTML: inputs, buttons, labels
- Color-blind friendly: role indicators + text labels

### i18n
- String keys:
  - `modals.actor_roster_title` (title, reuses from old roster)
  - `modals.search_actors` (search placeholder)
  - `modals.no_actors_in_roster` (empty state)
- System-specific labels read from column `.label` or `roster_filter.label`

---

## 12. Troubleshooting

### Issue: Filters not showing
**Cause**: Column doesn't have `roster_filter.enabled: true`  
**Fix**: Add/enable `roster_filter` in `columns.json`

### Issue: Sort not working
**Cause**: Column type is not numeric and sort is defaulting to name  
**Fix**: Check column `type` is `'number'` or `'fraction'`; text columns still sort but alphabetically

### Issue: Accordion doesn't open
**Cause**: `max-height` transition is set but no height change  
**Fix**: Check `isExpanded` state is toggling correctly; verify Tailwind is compiled with `Compendium.tsx`

### Issue: Filters apply globally (all actors hidden)
**Cause**: Filter values don't match any actor stats (e.g., typo in select value)  
**Fix**: Clear filter and try again; check actor stat values match column values exactly

---

## 13. Code Style & Guidelines

### For Contributors
- Use `useMemo` and `useCallback` to avoid unnecessary renders
- Keep subcomponents in one file for simplicity (no excessive splitting)
- Use TypeScript types; avoid `any`
- Follow Tailwind utility order: layout → spacing → colors → effects
- Add comments for complex filter logic, not obvious DOM structures
- Test with multiple systems (D&D, Shadowrun, etc.) to ensure data-driven approach

### Testing Checklist
- [ ] Filters activate/deactivate correctly
- [ ] Search updates results in <200ms
- [ ] Accordion toggles smoothly (no jank)
- [ ] Sort direction reverses on button click
- [ ] Count input clamps to 1–99
- [ ] Add button calls `onAdd` with correct actor and count
- [ ] Modal closes after adding
- [ ] Responsive: tablet and mobile views work
- [ ] Dark theme passes contrast checks (WCAG AA)

---

## References

- **Main Component**: `src/components/Compendium/Compendium.tsx`
- **Integration**: See `src/App.tsx` (showCompendium state + button)
- **Type Extensions**: `CompendiumColumnConfig` in component file
- **API Docs**: `Omniboard_TZ.md` §2.4 (Actor & Column APIs)
- **Progress**: `Progress_and_Backlog.md` — Фаза 14 (Compendium)
- **Architecture**: See `Architecture_Decisions_and_Icebox.md` for system design decisions
