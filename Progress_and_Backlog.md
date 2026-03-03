# Omniboard — Progress & Backlog

> Обновлено: 03.03.2026

---

## ✅ Фаза 1 — Перезапуск и инфраструктура

- [x] Перезапуск проекта на базе прототипа из Google AI Studio
- [x] Монорепо: `backend/` (FastAPI) + `src/` (React 19 + TypeScript)
- [x] `npm run dev` — параллельный запуск обоих серверов (`concurrently`)
- [x] Прокси Vite: `/api`, `/ws`, `/assets`, `/render`, `/locales` → `http://127.0.0.1:8001`
- [x] `.cursorrules` с правилами для Cursor AI

## ✅ Фаза 2 — Боевой движок

- [x] Трекер инициативы: сортировка, ход боя, смена раундов
- [x] Группы акторов (`group_id` + `group_mode: sequential / simultaneous`)
- [x] Simultaneous groups: ходят как единый слот в `next_turn`
- [x] Автовыравнивание initiative внутри `simultaneous`-группы при старте
- [x] Тик эффектов при смене раунда (duration -1, удаление при 0)
- [x] Undo/Redo: `history_stack[]` + 20 снэпшотов, `/api/combat/undo` + `/redo`
- [x] Флаги `can_undo` / `can_redo` в `/api/combat/state`
- [x] `POST /api/combat/clear` — полная очистка трекера

## ✅ Фаза 3 — Лог боя

- [x] `LogEntry` с типами: hp_change, effect_added/removed, turn_start, round_start, combat_start/end, actor_joined/left, text
- [x] Запись в `data/logs/latest_combat.json` + `.md` (background thread)
- [x] GM-заметки в лог (`POST /api/combat/log/note`)
- [x] Очистка лога (`DELETE /api/combat/log`)
- [x] Открытие папки логов из UI (`POST /api/logs/open_folder`)
- [x] `PATCH /api/combat/settings` — вкл/выкл логирования

## ✅ Фаза 4 — Encounters & Roster

- [x] Сохранение боёв: полный стейт (actors + history + round + queue + is_active)
- [x] Загрузка и **возобновление боя с последнего хода** (`POST /api/combat/load`)
- [x] Roster — сохранённые акторы под систему (`data/actors/{system}/`)
- [x] Смена системы (`PATCH /api/combat/system`)
- [x] Список систем динамически из файлов (`GET /api/systems/list`)

## ✅ Фаза 5 — Ассеты

- [x] Asset Library: загрузка portraits / frames / effects
- [x] Asset Override: `default/` + `systems/{name}/` с fallback по имени файла
- [x] Прокси `/assets` и `/render` в `vite.config.ts`
- [x] Transliteration (slugification) для ID эффектов

## ✅ Фаза 6 — UI

- [x] Faction Legend: цвета по роли (player / enemy / ally / neutral), `LegendConfig`
- [x] Group colors: `show_group_colors` + `show_faction_colors`
- [x] MiniatureLayout Config: выбор полей для экрана ESP32 (top1/2, bottom1/2)
- [x] Редактор эффектов/статусов (кнопка + в таблице, click-to-remove)
- [x] ConfigModal: широкий grid-layout, Language Switcher

## ✅ Фаза 7 — Локализация (фундамент)

- [x] `i18next` + `react-i18next` + `i18next-http-backend` установлены
- [x] `src/i18n.ts` — инициализация с загрузкой с бэка
- [x] `data/locales/{lang}/core.json` — файлы переводов

## ✅ Фаза 8 — Рефакторинг UI

- [x] App.tsx → модульная структура (40KB → 20KB)
- [x] Новые компоненты: AppHeader, CombatToolbar, InitiativeTable, ActorRow
- [x] Contexts: ColumnsContext, CombatContext, CombatStateContext
- [x] BUG-2: Undo/Redo исправлен ✅
- [x] BUG-3: Мигание колонок исправлено ✅

## ✅ Фаза 9 — Полная локализация и полировка UI (03.03.2026)

- [x] Динамическое сканирование языков (`/api/locales/languages`)
- [x] Перевод системных статов с fallback на `col.key` (не `col.label`)
- [x] Реактивное обновление label'ов в ConfigModal при смене языка
- [x] Вычищены остатки Google AI Studio (title, ошибки)
- [x] Ребрендинг: Nevrar's Omniboard
- [x] Фикс сжатия колонок таблицы, когда трекер пуст
- [x] README.md переписан согласно философии и ТЗ
- [x] **BUG-1 FIXED**: Полный рефакторинг таблицы на нативный `<table>` вместо flex — пиксель-перфектное выравнивание сгруппированных колонок (Health → Physical, Stun)

---

## 🐛 Активные баги

*Все известные баги исправлены!* 🎉

---

## 🎯 Следующая задача: Modals Refactoring & Hotbar

1. **Разбить `src/components/Modals.tsx`** (сейчас файл слишком большой) на отдельные файлы в папке `src/components/Modals/`.
2. **Добавить UI для Hotbar** (быстрые действия актёров), так как модель на бэкенде уже готова.

---

## 📋 Беклог

### 🔧 Рефакторинг (приоритет перед новыми фичами)
- [ ] Разбить `src/components/Modals.tsx` на отдельные файлы
- [ ] Полная миграция UI-строк на i18n (убедиться, что не осталось хардкода)

### ✨ Новые фичи
- [ ] **Image Cropper**: `react-image-crop` для обрезки ассетов под ESP32 (172×320px)
- [ ] **Hotbar**: UI для `HotbarAction` (быстрые атаки, заклинания)
- [ ] **Reactions**: UI для `active_reaction_actor_id` (отслеживание реакций)
- [ ] **Dice Engine**: модульные броски (d20, пулы кубиков, Shadowrun d6)
- [ ] **Sticky Columns**: фиксация колонок при широкой таблице

### 🔩 Аппаратная часть
- [ ] ESP32 прошивка: C++ / MicroPython + LVGL + WebSocket client
- [ ] Подключение по Wi-Fi / Bluetooth
- [ ] ESP32 отображение: `GET /api/render/{actor_id}` → PNG → экран 172×320
- [ ] LED синхронизация с цветами фракций (`sync_led_to_ui`)
