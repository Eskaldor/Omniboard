# Nevrar's Omniboard — ТЗ v2.0

> Обновлено: 25.04.2026 (+ RPG-Excel `StatValue`, `MechanicsManager`, Dice Engine, Roll Matrix)
> Стек сменился с Vue 3 на React 19 (сгенерировано в Google AI Studio).

## 📌 Суть проекта
Omniboard — это **локальный аппаратно-программный комплекс** для управления боем в настольных ролевых играх (не VTT). 
Система включает в себя:
1. **Веб-интерфейс (ПК/Планшет):** Трекер инициативы, управление здоровьем, эффектами.
2. **Аппаратные миниатюры (ESP32-C6):** Экраны 1.47" (172×320), которые ставятся на физический стол. Показывают портрет, HP, эффекты и подсвечиваются диодами в цвет фракции.

---

## 1. Технический Стек
- **Backend:** FastAPI (Python 3.11), Pydantic v2.
- **Боевой слой:** логика инициативы инкапсулирована в `backend/engines/` (`BaseInitiativeEngine` и реализации); выбор движка — по полю **`CombatSession.core.engine_type`** (см. §3).
- **Боевая математика:** `backend/services/mechanics.py` (`MechanicsManager`) считает `StatValue` по `mechanics.json`; `backend/services/dice.py` (`DiceManager`) выбирает движок бросков (`D20Engine`, `ShadowrunEngine`).
- **Связь:** WebSocket (двунаправленный, `ws_master` для фронта, отдельные коннекты для ESP32).
- **Хранение:** Локальные JSON-файлы.
- **Генерация картинок (для ESP32):** `Pillow` (композитинг слоев в PNG).
- **Запуск:** `uvicorn --reload` для dev-режима.
- **Frontend:** React 19, TypeScript, Vite 6, Tailwind CSS v4, `lucide-react`, `framer-motion`, `i18next`.
- **Архитектура:** Монорепо (`backend/` и `src/` в одном репозитории, запуск через `concurrently`).

---

## 2. Структура Данных (Data Layer)
Вся информация хранится в папке `data/`. Архитектура строго инкапсулирована (ADR-10).

```text
data/
├── locales/
│   ├── ru/
│   │   └── core.json           # UI локализация (кнопки, меню)
│   └── en/
│       └── core.json
├── assets/
│   ├── default/                # Дефолтные портреты, рамки, эффекты, шрифты
│   │   └── config/             # ADR-4: базовые JSON-конфиги (layouts, bars, LED, mechanics, matrix) — «неприкосновенный фундамент»
│   └── systems/<system_name>/  # Специфичные для системы ассеты (Asset Override)
├── encounters/                 # Сохраненные бои
├── logs/                       # Логи боев (.json и .md)
└── systems/
    └── <system_name>/          # Папка конкретной игровой системы (Инкапсуляция)
        ├── columns.json        # Механика статов (типы полей, формулы)
        ├── mechanics.json      # Системный куб, формулы вычисляемых статов (Asset Override)
        ├── matrix.json         # Правила генерации пред-бросков / Roll Matrix (Asset Override)
        ├── effects.json        # База эффектов
        ├── locales/            # Переводы колонок и механик
        │   ├── ru.json
        │   └── en.json
        ├── ai_profiles/        # (Icebox: Red Knight) Промпты для LLM
        │   └── ru_schema.json
        ├── layout_profiles.json   # Оверрайд раскладок мини-экрана (merge с default/config, см. ADR-4)
        ├── bars_config.json       # Опционально: список BarProfileConfig (merge + доп. папки bars/)
        └── led_profiles.json      # Оверрайд LED-пресетов (merge с default/config)
├── actors/                   # Roster по системе: data/actors/<system_name>/*.json (API `GET/POST /api/systems/{name}/actors`, безопасный сегмент пути)
├── state_autosave.json       # Автосейв сессии боя (вложенный CombatSession)
└── miniatures.json           # Глобальный реестр Omnimini: MiniatureEntry[] (не часть боя)
```

### 2.1. Типы колонок в `columns.json`

Помимо числовых полей и текстовых заметок, конфигуратор колонок поддерживает **универсальную экономику действий** — тип **`checkbox_group`**.

| Параметр | Назначение |
|----------|------------|
| **`type`** | `"checkbox_group"` — группа булевых флагов в `Actor.stats[column.key]` как **вложенный объект**: ключи = `items[].id`, значения = `true` / `false`. Отсутствие ключа трактуется UI как «ресурс доступен» (`true`). |
| **`items`** | Массив объектов `{ id, label, color }`: идентификатор слота, подпись (в т.ч. для лога), цвет индикатора (HEX). |
| **`reset_policy`** | Политика автосброса на бэкенде: **`turn_start`** — при начале хода актора (слот очереди, включая simultaneous-группу); **`round_start`** — зарезервировано для хуков смены раунда; **`manual`** — только руками в UI. |
| **`display_style`** | **`badge`** — независимые кликабельные бейджи с текстом; **`dot`** — компактные точки; в режиме `dot` UI трактует группу как **единый пул** слева направо (последовательное заполнение / снятие слотов). |
| **`log_changes`** / **`log_color`** | При `log_changes: true` изменения группы и отдельных слотов попадают в нарративный лог (см. §2.4). |
| **`is_readonly`** | Если `true`, ячейка в таблице не редактируется инлайн; отображается как статичное поле. |
| **`is_rollable`** | Если `true`, в таблице при hover появляется кнопка 🎲 быстрого броска. |
| **`roll_formula`** | Опциональная формула броска для колонки (например, `1d20 + [value]`); если пусто — используется `mechanics.json.system_dice`. |
| **`computed_formula_id`** | ID формулы из `mechanics.json.formulas`; значение колонки вычисляется автоматически, `base` игнорируется и поле считается locked/read-only. |

Остальные поля колонки (`width`, `group`, `showInTable`, …) сохраняют прежний смысл.

### 2.1.1. `StatValue` и RPG-Excel

Числовые характеристики актёра хранятся не как голые числа, а как **`StatValue`**:

| Поле | Назначение |
|------|------------|
| **`base`** | Ручное базовое значение, которое мастер правит в мини-чарнике. Для computed-колонок принудительно `0` и не используется как источник истины. |
| **`formula_id`** | Опциональная ссылка на формулу из `mechanics.json.formulas`; для колонок с `computed_formula_id` выставляется автоматически. |
| **`overrides[]`** | Временные модификаторы `{ source, value }` — эффекты, баффы, штрафы. |
| **`value`** | Итоговое серверное значение после пересчёта: формула или `base`, плюс сумма overrides. |

`Actor.migrate_legacy_flat_stats` мигрирует старые JSON (`"hp": 10`) в `StatValue(base=10, value=10)`, чтобы старые автосейвы и ростер не ломались.

### 2.1.2. `mechanics.json` и `matrix.json`

- **`mechanics.json`** загружается через `load_config_with_override(system, "mechanics.json")`; дефолт лежит в `data/assets/default/config/mechanics.json` и содержит `system_dice` + `formulas`.
- **`matrix.json`** загружается тем же Asset Override-путём; `generation_rules[]` задаёт выражение, количество слотов и режим отображения (`single` / `pair`) для пред-бросков.
- Правило проекта: игровой куб, формулы и матрицы не хардкодятся в TS/Python; системные отличия живут в JSON-конфигах.

### 2.2. Движки и автосброс ресурсов (Action Economy)

Базовый класс **`BaseInitiativeEngine`** (`backend/engines/base.py`) реализует **`_reset_actor_resources(state, actor_id, trigger)`**: читается `columns.json` активной системы (`get_system_columns_path`), для колонок с `type == "checkbox_group"` и `reset_policy == trigger` во вложенном словаре `actor.stats[column_key]` всем перечисленным в **`items`** `id` выставляется **`true`**.

Вспомогательный метод **`_apply_turn_start_checkbox_resets(state)`** вызывается из **`next_turn`** реализаций (**`standard`**, **`popcorn`**, **`phase`**) для всех акторов в **текущем слоте очереди** (одиночный ход или вся simultaneous-группа), с триггером **`turn_start`**. Таким образом ресурсы с политикой «начало хода» восстанавливаются без дублирования логики в HTTP-слое.

Слияние PATCH-статов на бэкенде — **глубокий merge** (`backend/routers/actors.py`), чтобы частичное обновление одного слота не затирало остальные ключи группы.

### 2.3. Синхронизация клиента: глобальный патч-менеджер и Anti-Stuck

**Проблема:** быстрые правки статов через `PATCH /api/actors/{id}` (дебаунс) и широковещательное **`state_update`** по WebSocket приводили к кратковременному «откату» UI к серверному снимку без учёта ещё не отправленного тела PATCH.

**Решение — паттерн «глобальный патч-менеджер»** (`src/utils/actorPatchMerge.ts`):

- Карта **`pendingByActorId`**: для каждого `actor_id` накапливается тело будущего PATCH (в т.ч. **deep merge** вложенных `stats`).
- Любое входящее состояние боя (**WebSocket**, **`refetchState`**, fallback fetch) перед записью в стейт React проходит через **`applyPendingPatchesToCombatState`**: к снимку с сервера повторно применяется накопленный optimistic-патч, пока запрос не ушёл и карта для актора не очищена.

**Локальные overrides в `CheckboxGroupCell`:** для мгновенного отклика чекбоксов/точек используется локальный словарь; при сбое сети добавлен **Anti-Stuck Timeout (3000 ms)** — таймер сбрасывает overrides, чтобы UI сошёлся с сервером.

### 2.4. Логирование изменений статов

При **`PATCH /api/actors/{id}`** (`_log_stat_changes_for_actor`):

- **Числовые** колонки — по-прежнему дельта `amount` и цвет из `log_color`.
- **`checkbox_group`** — по каждому изменившемуся ключу во вложенном словаре отдельная запись **`stat_change`** с человекочитаемым **`message`**, подписью слота из **`items`**, **`color`** из колонки.
- **`text` / `string`** — при изменении строкового значения запись с **`message`** вида `{label}: {old} -> {new}`**, без приведения к `int`**.

Markdown-экспорт лога (`backend/services/logger.py`) и UI лога учитывают поле **`details.message`**, если оно задано.

### 2.5. Сервисы игровой механики

- **`MechanicsManager`** (`backend/services/mechanics.py`): читает `mechanics.json`, собирает формулы, определяет computed-колонки по `columns.json`, безопасно считает выражения через `simpleeval`, пересобирает `Actor.stats` без падения на битых формулах (warning + fallback).
- **`DiceManager`** (`backend/services/dice.py`): единая точка бросков. Выбирает `D20Engine` для d20-notation и `ShadowrunEngine` для пулов d6; подставляет `[stat_key]` из актора, возвращает `RollResult(total, formula, details, is_glitch, is_crit_glitch)`.
- **`MatrixManager`** (`backend/services/matrix.py`): строит `SessionMeta.prerolls` по `matrix.json`, вызывает `DiceManager.execute_roll`, поддерживает paired slots и отметку `used`.

---

## 3. Pydantic Models (`backend/models.py`)

### Effect
- `id`: str (уникальный слаг, например "stunned")
- `name`: str (отображаемое имя, fallback на id)
- `duration`: Optional[int] = None (-1 = до конца следующего хода, 0 = до начала следующего, None = бесконечно)
- `description`: Optional[str] = None
- `show_on_miniature`: bool = False

### Visibility
- `hp`, `stats`, `effects`, `name`: bool = True

### DisplayField (Поле для экрана ESP32)
- `type`: Literal["text", "bar"]
- `label`: Optional[str]
- `value_path`: str (например, "stats.hp")
- `max_value_path`: Optional[str]
- `color`: Optional[str]

### LayoutProfile (раскладка мини-экрана ESP32)
- `id`, `name`, `frame_asset`, `show_portrait`
- Слоты: `top1`, `top2`, `bottom1`, `bottom2`, `left1`, `right1` — опциональные `DisplayField`
- `font_id`, `font_size`, `bar_height`, `led_profile_id`, `led_color_source`, `led_custom_color`

**Хранение:** не в сессии боя. Merge **default** `data/assets/default/config/layout_profiles.json` + **оверрайд** `data/systems/<system>/layout_profiles.json` (`backend/utils/config_loader.py` + `GET /api/systems/{name}/layouts`). В **`CombatSession.display`** хранится только **`selected_layout_id`** (UI по умолчанию); у **`Actor`** — **`layout_profile_id`** (резолвится по списку системы).

### Actor
- `id`: str
- `name`: str
- `role`: Literal["character", "enemy", "ally", "neutral"]
- `is_revealed`: bool = True
- `group_id`: Optional[str]
- `group_mode`: Optional[Literal["sequential", "simultaneous"]]
- `group_color`: Optional[str]
- `initiative`: int = 0
- `portrait`: str
- `miniature_id`: Optional[str]
- `layout_profile_id`: Optional[str] — id профиля из merge-списка раскладок активной системы
- `stats`: Dict[str, ActorStatCell] — `StatValue` для чисел, `str` для текстовых колонок, вложенный dict для `checkbox_group`
- `effects`: List[Effect]
- `visibility`: Visibility
- `hotbar`: List[HotbarAction]

### CombatSession (корневой агрегат сессии боя, ADR-18)

Публичный JSON для **`GET /api/combat/state`**, WebSocket **`state_update`** и автосейва — вложенная структура из четырёх доменов (плоский legacy-объект при загрузке нормализуется через `model_validator` в `CombatSession`).

#### `core` — `CombatCore`
- `actors`, `turn_queue`, `current_index`, `current_pass`, `round`
- `engine_type`, `is_manual_mode`, `system`, `is_active`, `active_reaction_actor_id`

#### `display` — `DisplayState`
- `selected_layout_id: str` — выбранный профиль по умолчанию в UI (список профилей — только из API системы, не из стейта боя)
- `legend`, `show_group_colors`, `show_faction_colors`, `table_centered`

#### `hardware` — `HardwareState`
- `sync_led_to_ui: bool`

#### `session` — `SessionMeta`
- `history`, `history_cursor`, `enable_logging`, `autosave_enabled`
- **`history_stack`**, **`history_index`** — технический стек Undo/Redo (снимки сериализуются в автосейв; в публичном API/WebSocket поля стека не отдаются, на корне — только `can_undo` / `can_redo`)
- **`prerolls`** — Roll Matrix: `actor_id -> группы правил -> slots[]` с результатами бросков и флагом `used`.

### CombatState (совместимость)
В коде тип **`CombatState`** в TypeScript — алиас на **`CombatSession`**. На бэкенде плоский **`CombatState`** в `models.py` сохраняется для слоя совместимости с движками инициативы (`combat_session_to_combat_state` / merge обратно); новый функционал описывается в терминах **`CombatSession`**.

---

## 4. API Reference (`backend/routers/`)

### WebSocket (`ws://127.0.0.1/ws/master`)
- Рассылает `{ "type": "state_update", "payload": CombatSession }` (вложенные `core` / `display` / `hardware` / `session`) при любых изменениях. На клиенте payload проходит через слой **pending-патчей** (см. §2.3), чтобы не терять optimistic-правки статов.
- Рассылает `{ "can_undo": bool, "can_redo": bool }` при изменении стека истории.

### Боевка (`/api/combat`)
- `GET /state`
- `POST /start`, `POST /end`, `POST /reset`, `POST /clear`
- `POST /next-turn` — тело JSON: опционально `{ "target_actor_id": "<uuid>" }`. Без поля — «следующий ход» / принудительная смена раунда в зависимости от движка; с `target_actor_id` — ручная передача хода (Manual Mode), попкорн или фазовая механика (клик по строке в UI). Побочные эффекты: тик `duration` эффектов, simultaneous-группы — по правилам активного `BaseInitiativeEngine`.
- `POST /undo`, `POST /redo`
- `POST /load` (загружает encounter)
- `PATCH /system` (меняет активную систему)
- `PATCH /legend`, `PATCH /settings` (в т.ч. `selected_layout_id`, `table_centered`, `engine_type`, логирование)
- `POST /actors/{actor_id}/roll` — быстрый бросок по формуле; результат пишется в лог, если `is_preroll` не выставлен.
- `POST /matrix/generate` — генерация Roll Matrix для всех акторов по `matrix.json`; сохраняет `session.prerolls`.
- `POST /actors/{actor_id}/matrix/use` — отметить слот матрицы использованным и записать событие в лог.
- Раскладки мини-экрана: **`GET/POST /api/systems/{name}/layouts`** — merge с `data/assets/default/config/layout_profiles.json`, запись оверрайда в `data/systems/{name}/layout_profiles.json` (отдельно от стейта боя)

### Акторы (`/api/actors`)
- `POST /` (добавить в конец/начало очереди, либо пересчет инициативы)
- `PATCH /{id}` — **deep-merge** поля `stats` (вложенные dict, в т.ч. `checkbox_group`); при `stats is None` инициализируется `{}` перед merge. Побочный эффект: записи в нарративный лог по колонкам с `log_changes` (числа, текст, чекбокс-группы).
- `DELETE /{id}`

### Железо и глобальный реестр минек (`/api/hardware`)
- `GET /api/hardware/miniatures` — список записей из `data/miniatures.json`
- `POST /api/hardware/miniatures` — создать запись (`MiniatureEntry`: `id`, `mac`, `name`, `notes`, …)
- `PATCH /api/hardware/miniatures/{id}`, `DELETE …`, `PUT …` — обновление / удаление / полная замена списка

### Системы и Локализация (`/api/systems`, `/api/locales`)
- `GET /locales/{lang}/core` -> возвращает `data/locales/{lang}/core.json`
- `GET /locales/{lang}/systems/{system_name}` -> возвращает `data/systems/{system_name}/locales/{lang}.json`
- `GET /systems/list`
- `GET /systems/{name}/columns`, `POST /systems/{name}/columns` (При POST сохраняет саму структуру, а переводы имен раскидывает в папку `locales/` текущей системы).
- `GET /systems/{name}/mechanics` — merged `mechanics.json` (`system_dice`, `formulas`) для UI быстрых бросков и конфигураторов.
- `GET /systems/{name}/effects`, `POST /systems/{name}/effects`
- `GET /systems/{name}/actors`, `POST /systems/{name}/actors` — Roster под систему; путь `data/actors/<name>/` валидируется (без `..` и выхода за корень)
- `GET /systems/{name}/layouts`, `POST /systems/{name}/layouts` — раскладки (см. выше)
- `GET /systems/{name}/led_profiles`, `POST …` — LED-пресеты (merge default/config + system override)

### Ассеты и Рендер (`/api/assets`, `/api/render`)
- `GET /assets/...` — каталоги портретов/рамок/effects/fonts/**bars** с Asset Override (`default` → `systems/<sys>`)
- `GET /api/assets/bars?system=…` — список профилей баров: merge **`bars_config.json`** (default + system) + профили из папок `bars/<id>/config.json`
- `GET /api/render/{actor_id}` — PNG 172×320 для ESP32; профили раскладки и LED читаются из merge-конфигов системы, не из `CombatSession.display` как списка профилей

---

## 5. ESP32 Интеграция (Icebox / В процессе)
- Подключение по WebSocket.
- Прием JSON-команд (id актора для отображения, цвет LED).
- Скачивание картинок через `/api/render/actor/{id}`.
- Замена портрета через "кадрирование" на фронтенде (`react-image-crop` -> 172x320 px).