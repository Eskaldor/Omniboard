# Omniboard — Progress & Backlog

> Обновлено: 05.03.2026

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

## ✅ Фаза 9 — Композитинг, Архитектура Ассетов и Экспертный Режим (05.03.2026)
- [x] **Smart Fractions:** Визуал 9/10 в одной ячейке с авто-инициализацией максимума.
- [x] **Expert Mode (Columns & Sheet):** Переключатель для скрытия лишнего UI (портреты, MAC-адреса) для скорости в бою.
- [x] **Dynamic Log & i18n:** Запись изменений любых статов с учетом цвета, нейтральный формат "Имя: +/-Значение".
- [x] **Pinned Actors:** Галочка "Запомнить" для защиты акторов от очистки боя.
- [x] **Монолитная Архитектура Ассетов:** Строгая привязка `Файл == Технический ID == i18n`. Умный авто-slugify.
- [x] **LibraryModal Redesign:** Сетка 9:16, поиск по локализованным именам.
- [x] **Image Cropper Modal:** Принудительная обрезка под 172×320 и экспорт в PNG (альфа-канал сохранен).
- [x] **System Hardening:** Валидация ID, перехват 409 Conflict при перезаписи ассетов.
- [x] **Modals Split (Рефакторинг):** Большой Modals.tsx распилен на атомарные компоненты в `src/components/Modals/` для чистоты кода.
- [x] **Обновление Модели Эффектов:** Добавлены флаги `render_on_mini`, `render_on_panel`, `is_base` и заготовки для ИИ.

---

## 🎯 ПЛАН НА СЛЕДУЮЩИЙ СПРИНТ

### Фаза 10 — The Compositor & Live Preview (Финальный Босс)
- [ ] **`compositor.py`:** Написание Python-скрипта (Pillow) для послойной сборки рендера с альфа-каналом (Портрет → Рамка → Эффекты → Текст).
- [ ] **Render API:** Эндпоинт `/api/render/miniature/{actor_id}` для отдачи склеенного изображения.
- [ ] **Live Preview:** Окно предпросмотра экрана ESP32 прямо в мини-чарнике (режим Эксперта).
- [ ] **ESP32 WebSocket:** Начало тестов отправки отрендеренных картинок на физические дисплеи.

### Фаза 11 — Движки Систем (Modular Engines)
- [ ] Разработать `backend/engines/` с абстрактными базовыми классами (Инициатива, Урон, Пулы).
- [ ] Добавить в `columns.json` новый тип `checkbox_group` для отслеживания очков действий (Action/Bonus/Reaction).
- [ ] Создать плагин `logic.py` внутри папки системы для переопределения правил (например, сброс реакций в начале раунда).

---

## 🐛 Активные баги

*Все известные баги исправлены!* 🎉

---

## 📋 Беклог

### 🔧 Рефакторинг (приоритет перед новыми фичами)
- [ ] Полная миграция UI-строк на i18n (убедиться, что не осталось хардкода)

### ✨ Новые фичи
- [ ] **Hotbar**: UI для `HotbarAction` (быстрые атаки, заклинания)
- [ ] **Reactions**: UI для `active_reaction_actor_id` (отслеживание реакций)
- [ ] **Dice Engine**: модульные броски (d20, пулы кубиков, Shadowrun d6)
- [ ] **Sticky Columns**: фиксация колонок при широкой таблице
- [ ] **Улучшенный UI Раундов**: Крупная плашка "РАУНД X | ХОД Y" в тулбаре и framer-motion анимации.

### 🔩 Аппаратная часть
- [ ] ESP32 прошивка: C++ / MicroPython + LVGL + WebSocket client
- [ ] Подключение по Wi-Fi / Bluetooth
- [ ] LED синхронизация с цветами фракций (`sync_led_to_ui`)

