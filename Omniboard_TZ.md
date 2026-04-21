# Nevrar's Omniboard — ТЗ v2.0

> Обновлено: 21.04.2026 (+ Action Economy: `checkbox_group`, pending-патчи, логирование вложенных статов)
> Стек сменился с Vue 3 на React 19 (сгенерировано в Google AI Studio).

## 📌 Суть проекта
Omniboard — это **локальный аппаратно-программный комплекс** для управления боем в настольных ролевых играх (не VTT). 
Система включает в себя:
1. **Веб-интерфейс (ПК/Планшет):** Трекер инициативы, управление здоровьем, эффектами.
2. **Аппаратные миниатюры (ESP32-C6):** Экраны 1.47" (172×320), которые ставятся на физический стол. Показывают портрет, HP, эффекты и подсвечиваются диодами в цвет фракции.

---

## 1. Технический Стек
- **Backend:** FastAPI (Python 3.11), Pydantic v2.
- **Боевой слой:** логика инициативы инкапсулирована в `backend/engines/` (`BaseInitiativeEngine` и реализации); выбор движка — по полю `CombatState.engine_type` (см. модель ниже).
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
│   ├── default/                # Дефолтные портреты, рамки, эффекты
│   └── systems/<system_name>/  # Специфичные для системы ассеты (Asset Override)
├── encounters/                 # Сохраненные бои
├── logs/                       # Логи боев (.json и .md)
└── systems/
    └── <system_name>/          # Папка конкретной игровой системы (Инкапсуляция)
        ├── columns.json        # Механика статов (типы полей, формулы)
        ├── effects.json        # База эффектов
        ├── locales/            # Переводы колонок и механик
        │   ├── ru.json
        │   └── en.json
        ├── ai_profiles/        # (Icebox: Red Knight) Промпты для LLM
        │   └── ru_schema.json
        └── actors/             # Roster (заготовки акторов для этой системы)
            └── Goblin.json
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

Остальные поля колонки (`width`, `group`, `showInTable`, …) сохраняют прежний смысл.

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

### MiniatureLayout
- `show_portrait`: bool = True
- `top1`, `top2`, `bottom1`, `bottom2`: Optional[DisplayField]

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
- `stats`: Dict[str, Any]
- `effects`: List[Effect]
- `visibility`: Visibility
- `hotbar`: List[HotbarAction]

### CombatState
- `actors`: List[Actor]
- `turn_queue`: List[str] (массив `actor.id`)
- `current_index`: int = 0
- `round`: int = 1
- `engine_type`: str = `"standard"` — механика инициативы: `standard` | `phase` | `popcorn` (выбор в UI / `PATCH` настроек боя).
- `is_manual_mode`: bool = False — **Manual Mode (ADR-14):** мастер может передать ход кликом по любой строке; иначе поведение задаётся движком.
- `system`: str (название папки системы, например "D_D 5e")
- `layout`: MiniatureLayout
- `legend`: LegendConfig
- `show_group_colors`: bool = True
- `show_faction_colors`: bool = True
- `sync_led_to_ui`: bool = True
- `history`: List[LogEntry] (Нарративный лог)
- `is_active`: bool = False
- `active_reaction_actor_id`: Optional[str]

*(Технический стэк Undo/Redo (`history_stack`) живёт отдельно в `state.py` и не сериализуется в JSON).*

---

## 4. API Reference (`backend/routers/`)

### WebSocket (`ws://127.0.0.1/ws/master`)
- Рассылает `{ "type": "state_update", "payload": CombatState }` при любых изменениях. На клиенте payload проходит через слой **pending-патчей** (см. §2.3), чтобы не терять optimistic-правки статов.
- Рассылает `{ "can_undo": bool, "can_redo": bool }` при изменении стека истории.

### Боевка (`/api/combat`)
- `GET /state`
- `POST /start`, `POST /end`, `POST /reset`, `POST /clear`
- `POST /next-turn` — тело JSON: опционально `{ "target_actor_id": "<uuid>" }`. Без поля — «следующий ход» / принудительная смена раунда в зависимости от движка; с `target_actor_id` — ручная передача хода (Manual Mode), попкорн или фазовая механика (клик по строке в UI). Побочные эффекты: тик `duration` эффектов, simultaneous-группы — по правилам активного `BaseInitiativeEngine`.
- `POST /undo`, `POST /redo`
- `POST /load` (загружает encounter)
- `PATCH /system` (меняет активную систему)
- `PATCH /layout`, `PATCH /legend`, `PATCH /settings`

### Акторы (`/api/actors`)
- `POST /` (добавить в конец/начало очереди, либо пересчет инициативы)
- `PATCH /{id}` — **deep-merge** поля `stats` (вложенные dict, в т.ч. `checkbox_group`); при `stats is None` инициализируется `{}` перед merge. Побочный эффект: записи в нарративный лог по колонкам с `log_changes` (числа, текст, чекбокс-группы).
- `DELETE /{id}`

### Системы и Локализация (`/api/systems`, `/api/locales`)
- `GET /locales/{lang}/core` -> возвращает `data/locales/{lang}/core.json`
- `GET /locales/{lang}/systems/{system_name}` -> возвращает `data/systems/{system_name}/locales/{lang}.json`
- `GET /systems/list`
- `GET /systems/{name}/columns`, `POST /systems/{name}/columns` (При POST сохраняет саму структуру, а переводы имен раскидывает в папку `locales/` текущей системы).
- `GET /systems/{name}/effects`, `POST /systems/{name}/effects`
- `GET /systems/{name}/actors` (Roster)

### Ассеты и Рендер (`/api/assets`, `/api/render`)
- `GET /assets/{category}?system={sys}` -> Asset Override Pattern
- `GET /render/actor/{id}` -> Возвращает сгенерированный PNG для ESP32 (172x320)

---

## 5. ESP32 Интеграция (Icebox / В процессе)
- Подключение по WebSocket.
- Прием JSON-команд (id актора для отображения, цвет LED).
- Скачивание картинок через `/api/render/actor/{id}`.
- Замена портрета через "кадрирование" на фронтенде (`react-image-crop` -> 172x320 px).