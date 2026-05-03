# Nevrar's Omniboard — ТЗ v2.0

> Обновлено: 03.05.2026 (**§2.1.5** — шаблон броска инициативы `initiative_roll` в `mechanics.json`, API, `SessionMeta`, GM Console, кубик в строке трекера; **ADR-26** — `reorder_turn_queue` vs `rebuild_turn_queue_after_initiative_reroll`; **§2.1.2** / **§2.5** / **§4** синхронизированы); ранее: **§2.1.4** — колонка макросов в трекере; **§2.7** — обратная связь по броскам; **§2.6** — терминал бросков, **ADR-24**; GM Console / ESP / `led_triggers`; **§2.1.3** — мини-лист, `sheet_profiles`
> Стек сменился с Vue 3 на React 19 (сгенерировано в Google AI Studio).

## 📌 Суть проекта

Omniboard — это **локальный аппаратно-программный комплекс** для управления боем в настольных ролевых играх (не VTT). 
Система включает в себя:

1. **Веб-интерфейс (ПК/Планшет):** Трекер инициативы, управление здоровьем, эффектами.
2. **Аппаратные миниатюры (ESP32-C6):** Экраны 1.47" (172×320), которые ставятся на физический стол. Показывают портрет, HP, эффекты и подсвечиваются диодами в цвет фракции.

---

## 1. Технический Стек

- **Backend:** FastAPI (Python 3.11), Pydantic v2.
- **Боевой слой:** логика инициативы инкапсулирована в `backend/engines/` (`BaseInitiativeEngine` и реализации); выбор движка — по полю `**CombatSession.core.engine_type`** (см. §3).
- **Боевая математика:** `backend/services/mechanics.py` (`MechanicsManager`) считает `StatValue` по `mechanics.json`; `backend/services/dice.py` (`DiceManager`) выбирает движок бросков (`D20Engine`, `ShadowrunEngine`). Отдельно: **`backend/services/initiative_roll.py`** — шаблон **`initiative_roll`** и бросок инициативы **только через `D20Engine`** (арифметическая сумма / d20-notation, не пул успехов Shadowrun).
- **Связь:** WebSocket только для UI мастера (`/ws/master`, см. §4). Оmnimini (ESP32) не используют WebSocket: доставка команд и PNG — **HTTP** поверх **mDNS** (`zeroconf`), см. ADR-15 и §5.
- **Хранение:** Локальные JSON-файлы.
- **Генерация картинок (для ESP32):** `Pillow` (композитинг слоев в PNG).
- **Запуск:** `uvicorn --reload` для dev-режима.
- **Frontend:** React 19, TypeScript, Vite 6, Tailwind CSS v4, `lucide-react`, `motion`, `i18next`, `react-hot-toast` (в т.ч. кастомные тосты результатов броска — §2.7).
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
        ├── led_profiles.json      # Оверрайд LED-пресетов (merge с default/config)
        └── led_triggers.json      # Правила железа (напр. initiative_shift: переход экрана при смене слота линии инициативы)
├── actors/                   # Roster по системе: data/actors/<system_name>/*.json (API `GET/POST /api/systems/{name}/actors`, безопасный сегмент пути)
├── state_autosave.json       # Автосейв сессии боя (вложенный CombatSession)
└── miniatures.json           # Глобальный реестр Omnimini: MiniatureEntry[] (не часть боя)
```

### 2.1. Типы колонок в `columns.json`

Помимо числовых полей и текстовых заметок, конфигуратор колонок поддерживает **универсальную экономику действий** — тип `**checkbox_group`**.


| Параметр                            | Назначение                                                                                                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**type**`                          | `"checkbox_group"` — группа булевых флагов в `Actor.stats[column.key]` как **вложенный объект**: ключи = `items[].id`, значения = `true` / `false`. Отсутствие ключа трактуется UI как «ресурс доступен» (`true`).    |
| `**items`**                         | Массив объектов `{ id, label, color }`: идентификатор слота, подпись (в т.ч. для лога), цвет индикатора (HEX).                                                                                                        |
| `**reset_policy**`                  | Политика автосброса на бэкенде: `**turn_start**` — при начале хода актора (слот очереди, включая simultaneous-группу); `**round_start**` — зарезервировано для хуков смены раунда; `**manual**` — только руками в UI. |
| `**display_style**`                 | `**badge**` — независимые кликабельные бейджи с текстом; `**dot**` — компактные точки; в режиме `dot` UI трактует группу как **единый пул** слева направо (последовательное заполнение / снятие слотов).              |
| `**log_changes`** / `**log_color**` | При `log_changes: true` изменения группы и отдельных слотов попадают в нарративный лог (см. §2.4).                                                                                                                    |
| `**is_readonly**`                   | Если `true`, ячейка в таблице не редактируется инлайн; отображается как статичное поле.                                                                                                                               |
| `**is_rollable**`                   | Если `true`, в таблице при hover появляется кнопка 🎲 быстрого броска.                                                                                                                                                |
| `**roll_formula**`                  | Опциональная формула броска для колонки (например, `1d20 + [value]`); если пусто — используется `mechanics.json.system_dice`.                                                                                         |
| `**computed_formula_id**`           | ID формулы из `mechanics.json.formulas`; значение колонки вычисляется автоматически, `base` игнорируется и поле считается locked/read-only.                                                                           |


Остальные поля колонки (`width`, `group`, `showInTable`, …) сохраняют прежний смысл.

### 2.1.1. `StatValue` и RPG-Excel

Числовые характеристики актёра хранятся не как голые числа, а как `**StatValue**`:


| Поле              | Назначение                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `**base**`        | Ручное базовое значение, которое мастер правит в мини-чарнике. Для computed-колонок принудительно `0` и не используется как источник истины. |
| `**formula_id**`  | Опциональная ссылка на формулу из `mechanics.json.formulas`; для колонок с `computed_formula_id` выставляется автоматически.                 |
| `**overrides[]**` | Временные модификаторы `{ source, value }` — эффекты, баффы, штрафы.                                                                         |
| `**value**`       | Итоговое серверное значение после пересчёта: формула или `base`, плюс сумма overrides.                                                       |


`Actor.migrate_legacy_flat_stats` мигрирует старые JSON (`"hp": 10`) в `StatValue(base=10, value=10)`, чтобы старые автосейвы и ростер не ломались.

### 2.1.2. `mechanics.json` и `matrix.json`

- `**mechanics.json**` загружается через `load_config_with_override(system, "mechanics.json")`; дефолт лежит в `data/assets/default/config/mechanics.json` и содержит `system_dice` + `formulas` + опционально **`initiative_roll`** (см. **§2.1.5**).
- `**matrix.json**` загружается тем же Asset Override-путём; `generation_rules[]` задаёт выражение, количество слотов и режим отображения (`single` / `pair`) для пред-бросков.
- Правило проекта: игровой куб, формулы и матрицы не хардкодятся в TS/Python; системные отличия живут в JSON-конфигах.

**Ключ `initiative_roll` (кратко, полное описание — §2.1.5):** отсутствие ключа или пустая строка → эффективный шаблон **`1d20`**; строка **`none`** (без учёта регистра) → броска нет: в публичном стейте **`initiative_roll_available: false`**, числовая колонка Init в трекере скрыта (у **popcorn** эта колонка всегда скрыта отдельно от ключа); иначе — выражение с подстановкой **`[stat_key]`** как у `BaseDiceEngine.interpolate_stats` в `dice.py`.

### 2.1.3. Мини-лист персонажа: `sheet_profiles`, группировка, действия

**Назначение:** шаблоны листа (merge default + `data/systems/<system>/config/sheet_profiles.json`, API профилей листа) задают, как на **мини-карточке** (модалка двойного клика по актору) показываются **сводка (stats)** и **действия (actions)**.

**Структура вкладок профиля:**

- Вкладка **`stats`**: массив **`accordions[]`**. Каждый блок: **`name`**, **`columns`** (ключи колонок из `columns.json`, фильтр по `show_in_mini_sheet` при рендере), опционально **`display`** (см. ниже).
- Вкладка **`actions`**: тот же массив **`accordions`**, но **`columns`** содержат **id макросов** из системного **`actions.json`**. Режимы **`display`** те же. Без групп / пустой список групп → плоская сетка всех макросов (с учётом фильтра **`show_on_panel`** у актёра).

**Режимы `display` секции (UX-контракт, май 2026):**

- **`open`** — контент **всегда виден** под единственным **декоративным заголовком** (горизонтальные линии + название секции). Никакой второй «плашки» с тем же текстом.
- **`accordion`** — секция **свёрнута по умолчанию**. Тот же декоративный заголовок становится **кнопкой-тогглером**: щелчок раскрывает/сворачивает контент, индикатор состояния — компактный chevron справа от названия. Подзаголовков-дублей и тяжёлой `bg-zinc-800` плашки нет.

Ключ открытого/закрытого состояния хранится локально в React-state мини-карточки (без персиста); смена профиля или `actions_panel_override` сбрасывает состояния. Старая реализация на `<details open>` с двойным заголовком удалена.

**Legacy:** устаревшее поле **`panel_action_keys`** при загрузке профилей конвертируется в **`accordions`** (см. `migrateLegacySheetTab` в `src/hooks/useSystemSheetProfiles.ts`); допускается только массив **строк** для ключей.

**Актёр поверх шаблона:**

- **`sheet_profile_id`** — выбранный профиль листа для мини-карточки.
- **`actions`** — переопределения макросов: **`show_on_panel`** (вкладка «Действия» мини-листа; по умолчанию трактуется как видимый, если ключ не задан), **`show_in_tracker`** (чип в **колонке макросов** таблицы инициативы; по умолчанию **`false`**), подстановка формулы, комментарий к броску; **`custom_name` / `custom_formula`** — макрос только у этого персонажа.
- **`actions_panel_override`** — если задано (`{ accordions: [...] }`), **полностью подменяет** группировку вкладки «Действия» из профиля. PATCH: на сервере и клиенте — **глубокий merge** объекта; **`null`** в PATCH снимает override. Удаление кастомного макроса: в **`actions`** передать **`null`** по ключу (отдельный merge с удалением по `null`).

**Редактор действий актёра (`ActorActionEditor.tsx`):** три подвкладки.

- **«Группировка»** — только редактор `actions_panel_override` (и кнопка «Своя разметка для этого персонажа», если override ещё не создан).
- **«Свои макросы»** — кастомные макросы актёра (`custom_name` / `custom_formula`), создание и удаление; те же две галочки видимости (**«Лист»** / **«Стол»**) применяются **сразу** через `patchActionKey` (без draft / Apply), чтобы не смешивать паттерны сохранения.
- **«Базовые действия»** — изолированный редактор переопределений системных макросов (поля `show_on_panel`, **`show_in_tracker`**, `formula_override`, `comment`). Две компактные галочки в одной строке карточки макроса: **«Лист»** / **«Стол»** (локали `modals.action_visibility_mini_sheet` / `action_visibility_tracker`). Использует **draft-паттерн**: правки накапливаются в локальном `BaseDraftMap`, поля «грязного» состояния помечаются amber-рамкой и тегом «Изменено», в шапке — sticky-панель с кнопками **«Применить изменения»** / **«Отменить»**. Apply отправляет один объединённый `PATCH /api/actors/{id}` с `actions: { ...merged }`; Discard ресетит draft до текущего серверного снимка. На вкладке также отображается dot-индикатор «грязно», если есть неприменённые правки. Драфт пересеивается по смене `actor.id` или списка системных макросов; внешние WebSocket-обновления для того же актора **не** затирают активный draft.

**Клиент:** `DefaultSystemSheet.tsx` (сводка), `ActionsPanel.tsx` (действия), `ActorActionEditor.tsx` (редактор с тремя подвкладками), `mergeActorActionDefs`, `actorPatchMerge.ts`.

### 2.1.4. Таблица инициативы: колонка «Макросы»

**Назначение:** быстрый бросок выбранных макросов актёра прямо из строки трекера, без открытия мини-карточки.

- **Флаг отображения:** `**CombatSession.display.show_macros_column**` (`bool`, по умолчанию **`false`**). Включается в **Настройки → раздел отображения стола** (`PATCH /api/combat/settings`, ключ **`show_macros_column`** наряду со sticky-колонками и центрированием).
- **Фильтр по актёру:** в колонке показываются только макросы с **`actor.actions[key].show_in_tracker === true`** (явное включение). Объединение определений — **`mergeActorActionDefs(systemActions, actor)`** (системный `actions.json` + кастомные `custom_formula`).
- **Рендер:** `InitiativeTable.tsx` подгружает системные действия через **`useSystemActions`**; `ActorRow.tsx` (`TrackerMacroButtons`) — чипы по **отображаемому имени** макроса, полная формула в **`title`**, до **четырёх** видимых кнопок и кнопка **`+N`** для разворота остальных; порядок — сортировка по имени. Клик вызывает **`POST /api/combat/actors/{id}/roll`** с тем же телом, что и мини-лист (`expression`, опционально `comment`, `is_preroll: false`).

### 2.1.5. Бросок инициативы: `mechanics.json`, API, GM Console, трекер

**Назначение:** системный шаблон броска инициативы задаётся в **`mechanics.json`** ключом **`initiative_roll`**; результат записывается в **`CombatSession.core.actors[].initiative`** (число по-прежнему можно править вручную). Подстановка статов — **`[stat_key]`**; движок броска — **`D20Engine`** (`backend/services/initiative_roll.py`), чтобы суммы вида `[pool]d6 + [mod]` не проходили через `ShadowrunEngine` (успехи по 5–6).

**Семантика `initiative_roll`:**

| Значение в JSON | Поведение |
| ----------------- | ---------- |
| нет ключа / `""` | эффективно **`1d20`** |
| **`"none"`** | броска нет; **`initiative_roll_available: false`** на корне payload; числовая колонка Init в трекере скрыта (и **не** popcorn) |
| непустая строка | выражение для `d20.roll` после подстановки `[stat]` |

**API (`/api/combat`):**

- **`PATCH /initiative/settings`** — частичное обновление полей **`SessionMeta`**: `initiative_include_character|enemy|ally|neutral`, `initiative_reroll_locked`, `initiative_show_per_actor_dice` (дефолты на бэкенде: персонажи выключены для массового броска, остальные роли включены; замок и кубик в строках — см. ниже).
- **`POST /initiative/roll`** — тело `{ "actor_ids": ["…"] }` или **без** `actor_ids` / `null` → массовый бросок по отмеченным ролям из сессии. После броска: нормализация simultaneous-групп (max initiative в группе), затем **`combat_engine.reorder_turn_queue()`** — очередь пересортирована, **текущий** актёр сохранён (ручной переброс в середине раунда). Ответ включает полный стейт + **`initiative_roll_results[]`** для тостов на клиенте.

**Автопереброс по «замку»:** при **`initiative_reroll_locked === true`** и росте **`core.round`** после **`POST /next-turn`** выполняется тот же массовый бросок, но очередь пересобирается через **`combat_engine.rebuild_turn_queue_after_initiative_reroll()`** (как при старте боя: сортировка всех актёров по новой инициативе, **`current_index = 0`**), а не через **`reorder_turn_queue()`** — иначе после нового раунда «текущим» оставался бы старый лидер очереди, уже не максимальный по новым броскам. Для движка **popcorn** автопереброс не выполняется.

**Клиент:** в **`GMConsoleSlider`** кнопка «Инициатива» раскрывает полоску над тулбаром (взаимоисключение с блоком заметок): массовый бросок, чипы ролей, замок «каждый раунд», переключатель «кубик в строках». В **`ActorRow`** у колонки инициативы — кнопка 🎲 (видимость из **`session.initiative_show_per_actor_dice`**). Тосты: **`toastInitiativeRollOutcome`** / `extractInitiativeRollResults` в `src/utils/rollToast.tsx`.

### 2.2. Движки и автосброс ресурсов (Action Economy)

Базовый класс `**BaseInitiativeEngine**` (`backend/engines/base.py`) реализует `**_reset_actor_resources(state, actor_id, trigger)**`: читается `columns.json` активной системы (`get_system_columns_path`), для колонок с `type == "checkbox_group"` и `reset_policy == trigger` во вложенном словаре `actor.stats[column_key]` всем перечисленным в `**items**` `id` выставляется `**true**`.

Вспомогательный метод `**_apply_turn_start_checkbox_resets(state)**` вызывается из `**next_turn**` реализаций (`**standard**`, `**popcorn**`, `**phase**`) для всех акторов в **текущем слоте очереди** (одиночный ход или вся simultaneous-группа), с триггером `**turn_start`**. Таким образом ресурсы с политикой «начало хода» восстанавливаются без дублирования логики в HTTP-слое.

Слияние PATCH-статов на бэкенде — **глубокий merge** (`backend/routers/actors.py`), чтобы частичное обновление одного слота не затирало остальные ключи группы.

### 2.3. Синхронизация клиента: глобальный патч-менеджер и Anti-Stuck

**Проблема:** быстрые правки статов через `PATCH /api/actors/{id}` (дебаунс) и широковещательное `**state_update`** по WebSocket приводили к кратковременному «откату» UI к серверному снимку без учёта ещё не отправленного тела PATCH.

**Решение — паттерн «глобальный патч-менеджер»** (`src/utils/actorPatchMerge.ts`):

- Карта `**pendingByActorId`**: для каждого `actor_id` накапливается тело будущего PATCH (в т.ч. **deep merge** вложенных `stats`, **`actions`** с удалением ключа по `null`, **`actions_panel_override`** с глубоким слиянием и сбросом по `null` — см. §2.1.3).
- Любое входящее состояние боя (**WebSocket**, `**refetchState`**, fallback fetch) перед записью в стейт React проходит через `**applyPendingPatchesToCombatState**`: к снимку с сервера повторно применяется накопленный optimistic-патч, пока запрос не ушёл и карта для актора не очищена.

**Локальные overrides в `CheckboxGroupCell`:** для мгновенного отклика чекбоксов/точек используется локальный словарь; при сбое сети добавлен **Anti-Stuck Timeout (3000 ms)** — таймер сбрасывает overrides, чтобы UI сошёлся с сервером.

### 2.4. Логирование изменений статов

При `**PATCH /api/actors/{id}`** (`_log_stat_changes_for_actor`):

- **Числовые** колонки — по-прежнему дельта `amount` и цвет из `log_color`.
- `**checkbox_group`** — по каждому изменившемуся ключу во вложенном словаре отдельная запись `**stat_change**` с человекочитаемым `**message**`, подписью слота из `**items**`, `**color**` из колонки.
- `**text` / `string**` — при изменении строкового значения запись с `**message**` вида `**{label}: {old} -> {new}**`, без приведения к `int`.

Markdown-экспорт лога (`backend/services/logger.py`) и UI лога учитывают поле `**details.message**`, если оно задано.

### 2.5. Сервисы игровой механики

- `**MechanicsManager**` (`backend/services/mechanics.py`): читает `mechanics.json`, собирает формулы, определяет computed-колонки по `columns.json`, безопасно считает выражения через `simpleeval`, пересобирает `Actor.stats` без падения на битых формулах (warning + fallback).
- `**DiceManager**` (`backend/services/dice.py`): единая точка бросков. Выбирает `D20Engine` для d20-notation и `ShadowrunEngine` для пулов d6; подставляет `[stat_key]` из актора, возвращает `RollResult(total, formula, details, is_glitch, is_crit_glitch)`.
- **`initiative_roll`** (`backend/services/initiative_roll.py`): разбор **`initiative_roll`** из `mechanics.json`, нормализация simultaneous-инициативы, массовый/точечный бросок через **`D20Engine`**; см. **§2.1.5**.
- `**MatrixManager**` (`backend/services/matrix.py`): строит `SessionMeta.prerolls` по `matrix.json`, вызывает `DiceManager.execute_roll`, поддерживает paired slots и отметку `used`.

### 2.6. Консоль Мастера: терминал бросков и язык токенов

**Назначение:** нижняя плавающая консоль (`src/components/GMConsole/`) в режиме **Roll** имеет единый язык токенов для смешивания свободного дайс-выражения, привязки к актёру, обращения к характеристикам и макросам мини-чарника. Парсер и резолвер вынесены в чистую утилиту `src/utils/rollTerminal.ts`, попап-помощник — в `RollTokenPopup.tsx`. Архитектурное решение — **ADR-24**.

**Грамматика входной строки:**

| Токен      | Назначение                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@Имя`     | Привязать бросок к актёру; longest-match по `Actor.name`. Допускается перечисление нескольких — каждому уйдёт свой `RollRequest` (мульти-актёр).                                                                                                                                                                                                                                                       |
| `!ключ`    | Значение характеристики актёра: longest-match по ключам `actor.stats` (кириллица и Unicode поддерживаются), резолв через `getStatNumeric`. Для ключей с пробелами в **одиночном** сегменте допускается форма `!{Подпись колонки}` — эквивалентна совпадению всей подписи с ключом статистики. Если **весь сегмент** — только один такой токен, он разворачивается в шаблон колонки: `columns.json[key].roll_formula` с заменой `[value]` на `!ключ`, либо в `${system_dice} + !ключ` при отсутствии формулы. `autoComment` берёт `column.label`. |
| `$ключ`    | Макрос мини-чарника. Резолвится через `mergeActorActionDefs(systemActions, actor)` с приоритетом `actor.actions[key].formula_override`; кастомные макросы `custom_formula` подхватываются автоматически (см. §2.1.3). Подставляется как `(formula)`. Для одиночного сегмента `autoComment` — `def.name` или `actor.actions[key].comment`.                                                                |
| `;`        | Разделитель сегментов. Каждый сегмент после резолва отправляется как самостоятельный `POST /api/combat/actors/{id}/roll` (или `/api/combat/roll` без актёра) — отдельная запись в боевом логе.                                                                                                                                                                                                          |
| `#текст`   | Трейлинг-комментарий; попадает в `RollRequest.comment`. При наличии и `autoComment` (от одиночного сегмента), и пользовательского `#` — склеиваются через `·`.                                                                                                                                                                                                                                          |

**Резолв на клиенте:** все подстановки `!stat` (числовое значение) и `$macro` (вложенная `(formula)`) выполняются во фронте до отправки. Бэкенд получает готовое арифметическое выражение и не знает про префиксы `!`/`$` — это сохраняет `DiceManager` системно-агностичным. Бэковская подстановка `[stat_key]` в `backend/services/dice.py` остаётся доступной как параллельный путь, но `!key`-токены к ней уже не обращаются (избегаем ASCII-ограничения regex).

**Защита от коллизий с d20-нотацией:** токен `!` для подстановки стата валиден только если перед ним стоит break-char (пробел / `+` / `-` / `*` / `/` / `(` / `,` / `;` / начало строки). Из-за этого `1d6!`, `4d6!>5` и прочая d20-explode-нотация целиком уходит библиотеке `d20` без вмешательства фронта. Попап для `!` открывается при карете внутри токена `!…`; список вариантов осмысленен после появления буквенного фильтра, а **резолвер** (`isStatTriggerAt`) требует букву/подчёркивание сразу после `!`.

**Per-actor сегментный план (`planSegmentsForActor`):** для каждого упомянутого актёра сегменты обходятся отдельно — значения `!stat`, `formula_override` и `custom_formula` могут отличаться между актёрами. Тот же пайплайн доступен для превью без отправки через **`previewSegmentsForActor`** (алиас к `planSegmentsForActor`). При мульти-актёрном вводе `@A @B 1d20+!str; 1d6+!str` уходит **четыре** запроса (по два на актёра), каждый со своим резолвом.

**Попап `RollTokenPopup` (UX-контракт):**

- **`@`** — single-select список акторов (поведение из прошлой версии сохранено).
- **`!`** — multi-select список **только** тех колонок, у которых `is_rollable: true` в `columns.json` (см. §2.1). Превью в строке — числовое значение характеристики для каждого упомянутого актёра. Бейдж `N/M` отображается, если стат есть не у всех в группе.
- **`$`** — multi-select объединение макросов по всем упомянутым актёрам (`mergeActorActionDefs` для каждого + union); макросы, доступные не у всех, помечаются бейджем `N/M`. Превью — формула макроса с применённым `formula_override`.
- В режиме мульти-выбора две кнопки подтверждения:
  - **Сумма (`+`)** — каждый `!key` оборачивается в свой column-template `(1d20 + !key)` (или в `(column.roll_formula)`), затем все склеиваются через ` + `. Итог: **один сегмент / одна строка лога / сумма N column-template-бросков** (типичный D&D-ability check с двумя кубами `(1d20+!str) + (1d20+!prof)` и т.п.). Для `$macro` шаблонная разворачивалка не нужна — резолвер сам оборачивает каждый макрос в `(formula)`.
  - **Серия (`;`)** — токены становятся отдельными сегментами (`!str; !prof`); итог — **N независимых записей в логе**, типичный массовый спасбросок.
- **Гейтинг:** для `!` и `$`, если в строке ещё нет ни одного `@Актёр`, попап всё равно может отображаться, но показывает **пустое состояние** с подсказкой локали (`gm_console.popup_need_actor`) — выбрать вставку из списка нельзя, пока не задан контекст актёра.

**Затронутые файлы:** `src/utils/rollTerminal.ts` (`findCaretToken`, `replaceTokenInText`, `parseRollInput`, `uniqActors`, `planSegmentsForActor`, `previewSegmentsForActor`), `src/components/GMConsole/{GMConsoleSlider,RollTokenPopup}.tsx`, `src/utils/mergeActorActionDefs.ts`, `data/locales/{ru,en,je,ger}/core.json`.

### 2.7. Обратная связь по броскам в UI (toast)

**Назначение:** сразу после ответа HTTP по маршрутам **`POST /api/combat/roll`** и **`POST /api/combat/actors/{id}/roll`** мастер видит **итог броска** (`RollResult`: `total`, `formula`, `details`, опционально флаги глитча), а не абстрактное «успешно». Полная история по-прежнему в **нарративном логе боя**.

- **Общая утилита:** `src/utils/rollToast.tsx` — **`parseRollHttpResponse`**, разбор ошибок FastAPI (`detail`), **`showRollResultToast`** / **`showRollErrorToast`** / **`showRollBatchToast`** на базе **`toast.custom`** из **`react-hot-toast`** (тёмная палитра zinc/emerald, скругления и рамки в духе основного UI). Строки заголовков и пакетного режима — группа локалей **`roll_toast.*`** в `data/locales/*/core.json`; тексты глитча переиспользуют **`stat_editor.roll_glitch`** / **`roll_critical_glitch`**.
- **Глобальный контейнер:** `<Toaster>` в `src/main.tsx` задаёт **`toastOptions`** (длительность по умолчанию, классы для «обычных» тостов библиотеки — сохранение шаблонов листа и т.п.).
- **Одиночный результат:** мини-карточка (**`MiniSheetModal`** → действия), колонка макросов (**`TrackerMacroButtons`** в `ActorRow.tsx`), быстрый 🎲 у числовой колонки (**`StatNumericCell`** в `StatEditPopover.tsx`), бросок из сводки мини-листа (**`DefaultSystemSheet.tsx`** → `StatRow.handleRoll`).
- **Консоль мастера (режим Roll):** после серии запросов один агрегированный тост (**`showRollBatchToast`**, прокручиваемый список, верхняя граница числа строк + счётчик «ещё N» в локали); при **`!ok`** у любого ответа — **`showRollErrorToast`**. Успешный **`flashActionStatus('success')`** у FAB для чистого броска **не** используется (ошибки валидации до сети по-прежнему могут подсвечивать FAB через **`flashActionStatus('error')`**). Режимы **Note** / **AI** не затрагиваются.
- **Исключение:** развернутая панель редактора стата (**`StatEditPanel.handleRoll`**) показывает результат только во внутреннем **`rollFlash`** — второй тост не дублируется.

**Затронутые файлы (сводка):** `src/utils/rollToast.tsx`, `src/main.tsx`, `MiniSheetModal.tsx`, `ActorRow.tsx` (`TrackerMacroButtons`), `GMConsoleSlider.tsx`, `StatEditPopover.tsx` (`StatNumericCell`), `DefaultSystemSheet.tsx`, группы **`roll_toast.*`** в `data/locales/*/core.json`.

---

## 3. Pydantic Models (`backend/models.py`)

### Effect

- `id`: str (уникальный слаг, например "stunned")
- `name`: str (отображаемое имя, fallback на id)
- `duration`: Optional[int] = None (-1 = до конца следующего хода, 0 = до начала следующего, None = бесконечно)
- `description`: Optional[str] = None
- `icon`: str (опционально)
- `led_profile_id`, `screen_transition`, `screen_transition_color`: опционально — Omnimini LED и анимация экрана при триггерах
- `is_base`: bool — базовый шаблон эффекта (задел под tooling)
- `show_on_miniature`: bool = False — устаревшее имя; предпочтительно `**render_on_mini**` и `**render_on_panel**` (видимость на миниатюре / в панели эффектов)
- `experimental_ai`, `ai_prompt`, `ai_variations`: задел под генеративные сценарии

### Visibility

- `hp`, `stats`, `effects`, `name`: bool = True

### DisplayField (Поле для экрана ESP32)

- `type`: Literal["text", "bar"] ; `**bar_style**`: `"solid"` | `"textured"` (текстурные бары через `theme_id` и слои PNG)
- `label`: Optional[str]
- `value_path`: str (например, "stats.hp")
- `max_value_path`: Optional[str]
- Цвета и типографика: `color`, `text_color`, `label_color`, `bar_bg_color`, опционально `font_id`, `font_size`
- Геометрия слота: `offset_x`, `offset_y`, `width`, `height`, `rotation` (0 / 90 / 270 для боковых слотов)
- Флаги отображения: `show_text`, `show_label`, `show_max`
- Полная схема — в `**backend/models.py**` (`DisplayField`); здесь перечислены ключевые группы полей.

### LayoutProfile (раскладка мини-экрана ESP32)

- `id`, `name`, `frame_asset`, `show_portrait`
- Слоты: `top1`, `top2`, `bottom1`, `bottom2`, `left1`, `right1` — опциональные `DisplayField`
- `font_id`, `font_size`, `bar_height`, `led_profile_id`, `led_color_source`, `led_custom_color`

**Хранение:** не в сессии боя. Merge **default** `data/assets/default/config/layout_profiles.json` + **оверрайд** `data/systems/<system>/layout_profiles.json` (`backend/utils/config_loader.py` + `GET /api/systems/{name}/layouts`). В `**CombatSession.display`** хранится только `**selected_layout_id**` (UI по умолчанию); у `**Actor**` — `**layout_profile_id**` (резолвится по списку системы).

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
- `sheet_profile_id`: Optional[str] — id шаблона мини-листа из `sheet_profiles` (см. §2.1.3)
- `stats`: Dict[str, ActorStatCell] — `StatValue` для чисел, `str` для текстовых колонок, вложенный dict для `checkbox_group`
- `effects`: List[Effect]
- `visibility`: Visibility
- `hotbar`: List[HotbarAction]
- `actions`: Dict[str, ActorActionOverride] — переопределения макросов и кастомные макросы персонажа (см. §2.1.3); PATCH мержит вложенные ключи; `null` по ключу удаляет запись
- `actions_panel_override`: Optional[ActorActionsPanelOverride] — собственная группировка вкладки «Действия» на мини-листе; при наличии заменяет секции из `sheet_profiles` (см. §2.1.3)

### CombatSession (корневой агрегат сессии боя, ADR-18)

Публичный JSON для `**GET /api/combat/state**`, WebSocket `**state_update**` и автосейва — вложенная структура из четырёх доменов (плоский legacy-объект при загрузке нормализуется через `model_validator` в `CombatSession`).

#### `core` — `CombatCore`

- `actors`, `turn_queue`, `current_index`, `current_pass`, `round`
- `engine_type`, `is_manual_mode`, `system`, `is_active`, `active_reaction_actor_id`

#### `display` — `DisplayState`

- `selected_layout_id: str` — выбранный профиль по умолчанию в UI (список профилей — только из API системы, не из стейта боя)
- `legend`, `show_group_colors`, `show_faction_colors`, `table_centered`
- `sticky_first_column`, `sticky_last_column` — закрепление первой/последней колонки таблицы при горизонтальной прокрутке
- `show_macros_column` — показывать ли в таблице инициативы колонку быстрых макросов (см. §2.1.4); по умолчанию **`false`**

#### `hardware` — `HardwareState`

- `sync_led_to_ui: bool` — политика синхронизации LED с UI (расширения см. беклог)
- `screen_brightness`: int — яркость экрана Omnimini **1–100 %** (при загрузке значения >100 трактуются как legacy 0–255 и нормализуются); участвует в `PATCH /api/combat/settings` и в пуше на прошивку как `screen_bri`
- В публичном JSON `**hardware.miniatures`** — производный список (записи из `data/miniatures.json` + статус online/offline из mDNS); не дублирует источник истины для механики боя

#### `session` — `SessionMeta`

- `history`, `history_cursor`, `enable_logging`, `autosave_enabled`
- `**history_stack**`, `**history_index**` — технический стек Undo/Redo (снимки сериализуются в автосейв; в публичном API/WebSocket поля стека не отдаются, на корне — только `can_undo` / `can_redo`)
- `**prerolls**` — Roll Matrix: `actor_id -> группы правил -> slots[]` с результатами бросков и флагом `used`.

### CombatState (совместимость)

В коде тип `**CombatState**` в TypeScript — алиас на `**CombatSession**`. На бэкенде плоский `**CombatState**` в `models.py` сохраняется для слоя совместимости с движками инициативы (`combat_session_to_combat_state` / merge обратно); новый функционал описывается в терминах `**CombatSession**`.

---

## 4. API Reference (`backend/routers/`)

### WebSocket (`ws://127.0.0.1/ws/master`)

- Рассылает `{ "type": "state_update", "payload": CombatSession }` (вложенные `core` / `display` / `hardware` / `session`) при любых изменениях. На клиенте payload проходит через слой **pending-патчей** (см. §2.3), чтобы не терять optimistic-правки статов.
- Рассылает `{ "can_undo": bool, "can_redo": bool }` при изменении стека истории.

### Боевка (`/api/combat`)

- `GET /state` — вложенный **`CombatSession`**; на корне дополнительно **`initiative_roll_available`**, **`initiative_engine_locked`**, **`can_undo`** / **`can_redo`** (стек undo не уходит в JSON целиком).
- `POST /start`, `POST /end`, `POST /reset`, `POST /clear`
- `POST /next-turn` — тело JSON: опционально `{ "target_actor_id": "<uuid>" }`. Без поля — «следующий ход» / принудительная смена раунда в зависимости от движка; с `target_actor_id` — ручная передача хода (Manual Mode), попкорн или фазовая механика (клик по строке в UI). Побочные эффекты: тик `duration` эффектов, simultaneous-группы — по правилам активного `BaseInitiativeEngine`. При росте **`round`** и включённом **`session.initiative_reroll_locked`** (не popcorn, доступен бросок) — автоматический переброс инициативы и **`rebuild_turn_queue_after_initiative_reroll`** (см. **§2.1.5**).
- `POST /prev-turn` — предыдущий слот очереди (с теми же правилами side effects линии инициативы, что и у `next-turn`, где применимо).
- `POST /undo`, `POST /redo`
- `POST /load` (загружает encounter)
- `POST /log/note` — GM-заметка в нарративный лог; `DELETE /log` — очистить лог на диске (`latest_combat.*`)
- `PATCH /system` (меняет активную систему)
- `PATCH /legend`, `PATCH /settings` (в т.ч. `selected_layout_id`, `table_centered`, `sticky_first_column`, `sticky_last_column`, **`show_macros_column`**, `engine_type`, `screen_brightness`, логирование)
- `POST /roll` — системный бросок без контекста актора (консоль мастера); результат может писаться в лог как generic roll
- `POST /actors/{actor_id}/roll` — быстрый бросок по формуле; результат пишется в лог, если `is_preroll` не выставлен.
- `PATCH /initiative/settings` — настройки массового броска и замка (поля **`SessionMeta`**, см. **§2.1.5**).
- `POST /initiative/roll` — бросок инициативы по шаблону системы; опционально **`actor_ids`**; ответ дополняется **`initiative_roll_results`** для UI-тостов.
- `POST /matrix/generate` — генерация Roll Matrix для всех акторов по `matrix.json`; сохраняет `session.prerolls`.
- `POST /actors/{actor_id}/matrix/use` — отметить слот матрицы использованным и записать событие в лог.
- Раскладки мини-экрана: `**GET/POST /api/systems/{name}/layouts`** — merge с `data/assets/default/config/layout_profiles.json`, запись оверрайда в `data/systems/{name}/layout_profiles.json` (отдельно от стейта боя)

### Акторы (`/api/actors`)

- `POST /` (добавить в конец/начало очереди, либо пересчет инициативы)
- `PATCH /{id}` — **deep-merge** поля `stats` (вложенные dict, в т.ч. `checkbox_group`); при `stats is None` инициализируется `{}` перед merge. Побочный эффект: записи в нарративный лог по колонкам с `log_changes` (числа, текст, чекбокс-группы).
- `DELETE /{id}`

### Железо и глобальный реестр минек (`/api/hardware`)

- `GET /api/hardware/miniatures` — список записей из `data/miniatures.json`
- `POST /api/hardware/miniatures` — создать запись (`MiniatureEntry`: `id`, `mac`, `name`, `notes`, …)
- `PATCH /api/hardware/miniatures/{id}`, `DELETE …`, `PUT …` — обновление / удаление / полная замена списка (`{id}` — path-сегмент, допускает MAC с `:`)
- `GET /api/hardware/` — сводка обнаруженных устройств (mDNS / внутренний кэш ESPManager)
- `GET /api/hardware/scan` — `active_minis` (id → IP)
- `POST /api/hardware/discover` — форсировать `startup()` браузера mDNS и вернуть актуальное состояние
- `POST /api/hardware/{mac}/update` — прокси JSON на прошивку (`http://<ip>/update`); `{mac}` — id Omnimini
- `POST /api/hardware/{mac}/blink`, `POST /api/hardware/{mac}/test` — тест LED и экрана

### Энкаунтеры (`backend/routers/encounters.py`)

Роутер без общего `prefix`: пути полные.

- `GET /api/encounters/list?system_name=…` — список файлов `enc_*.json` для системы
- `POST /api/encounters/save` — тело JSON (`system_name`, `name`, `actors`); на диск пишется также снимок из **текущей** сессии: `history`, `round`, `turn_queue`, `current_index`, `is_active` (см. `encounters.py`)
- `GET /api/encounters/get?system_name=&filename=` — загрузить один файл энкаунтера
- `DELETE /api/encounters/delete?system_name=&filename=`
- Legacy / альтернатива: `GET|POST /api/systems/{system_name}/encounters`, `GET|DELETE /api/systems/{system_name}/encounters/{filename}` (упрощённое сохранение `{name, actors}` для POST legacy)

### Логи файлов (`/api/logs`)

- `POST /api/logs/open_folder` — открыть папку логов на машине сервера (ОС-зависимо)

### Системы и Локализация (`/api/systems`, `/api/locales`)

Фронт загружает переводы через `**i18next-http-backend`** с `loadPath: '/api/locales/{{lng}}/{{ns}}'` (см. `src/i18n.ts`). Namespace для системы: путь `**systems/<имя_системы>**` (URL-encoded).

- `GET /api/locales/{lang}/core` — объект из `data/locales/{lang}/core.json`
- `GET /api/locales/{lang}/systems/{system_name}` — объект из `data/systems/<system_name>/locales/{lang}.json` (в коде один хэндлер `GET /api/locales/{lang}/{namespace:path}` при `namespace` вида `systems/...`)
- `GET /api/locales/languages` — поддерживаемые языки + метаданные из `_meta` в `core.json`
- `POST /api/locales/languages/refresh` — сброс кэша списка языков
- `POST /api/locales/systems/{system_name}/entry` — точечное обновление ключа в системном locale-файле (тело: `key`, `value`, `lang`)
- `GET /systems/list`
- `GET /systems/{name}/columns`, `POST /systems/{name}/columns` (При POST сохраняет саму структуру, а переводы имен раскидывает в папку `locales/` текущей системы).
- `GET /systems/{name}/mechanics` — merged `mechanics.json` (`system_dice`, `formulas`) для UI быстрых бросков и конфигураторов.
- `GET /systems/{name}/effects`, `POST /systems/{name}/effects`
- `GET /systems/{name}/actors`, `POST /systems/{name}/actors` — Roster под систему; путь `data/actors/<name>/` валидируется (без `..` и выхода за корень)
- `GET /systems/{name}/layouts`, `POST /systems/{name}/layouts` — раскладки (см. выше)
- `GET /systems/{name}/led_profiles`, `POST …` — LED-пресеты (merge default/config + system override)
- `GET /systems/{name}/led_triggers`, `POST /systems/{name}/led_triggers` — массив `**HardwareTrigger**` (в т.ч. `event_type`: `turn_start`, `stat_change`, `miniature_bind`, `**initiative_shift**`); задаёт LED-профиль и опционально `**transition**` / `**transition_color**` для экрана при событии

### Ассеты и Рендер (`/api/assets`, `/api/render`, статические mount)

**Статика (`backend/main.py`):** каталог `**/assets`** → файловое дерево `data/assets/`; `**/render**` и `**/api/render/output**` → выдача уже записанных PNG из `data/render/` (в т.ч. после композитора). Отдельно `**/locales**` может отдавать файлы из `data/locales/` напрямую; **приложение i18n использует API** `/api/locales/...` (см. выше).

`**APIRouter` `/api/assets`** (`backend/routers/assets.py`):

- `GET /api/assets/effects/{filename}` — иконка эффекта с Asset Override (`system` query)
- `GET|POST /api/assets/bars`, `POST /api/assets/bars/{bar_id}/textures`, `GET|DELETE /api/assets/bars/{bar_id}/textures/{texture_type}` — «Кузница баров»
- `GET /api/assets/notes`, `GET /api/assets/notes/content`, `POST /api/assets/notes` — заметки ассетов
- `GET /api/assets/systems/{system}/ui/logo.png`, `GET /api/assets/default/ui/logo.png`
- `GET|POST /api/assets/{category}`, `DELETE /api/assets/{category}/{filename}` — загрузка/листинг/удаление по категории (`portraits`, `frames`, …)

**Рендер:**

- `GET /api/render/{actor_id}` — динамический PNG 172×320 (композитор Pillow); query — см. `backend/routers/render.py`
- `**GET /api/render/output/{filename}.png`** — статический mount (имя файла на диске; для UI обычно `{actor_id}.png` после санитизации)

### 4.1 Чеклист «ТЗ ↔ код»


| Область    | В `backend/routers/`                     | Примечание                                                                  |
| ---------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| WebSocket  | `ws.py` → `/ws/master`                   | Совпадает с §4                                                              |
| Боевка     | `combat.py`                              | В ТЗ добавлены `prev-turn`, лог (`log/note`, `DELETE log`)                  |
| Акторы     | `actors.py`                              | `POST ""` ≡ `POST /api/actors`                                              |
| Системы    | `systems.py`                             | Совпадает с §4                                                              |
| Энкаунтеры | `encounters.py`                          | Ранее не были в кратком §4 — см. блок выше                                  |
| Железо     | `hardware.py`                            | В ТЗ добавлены discover / scan / push / blink / test                        |
| Локали     | `locales.py`                             | Исправлен префикс: только `**/api/locales/...**`, не `/locales/...` без api |
| Логи ОС    | `logs.py`                                | `POST /api/logs/open_folder`                                                |
| Ассеты     | `assets.py`                              | Детальный CRUD см. файл; ТЗ даёт обзор                                      |
| Рендер     | `render.py` + mount `/api/render/output` | Динамика + статический output                                               |


Полный перечень декораторов: поиск по шаблону `@router.(get|post|put|patch|delete|websocket)` в каталоге `**backend/routers/**`.

**Дополнение:** отображение **`RollResult`** во всплывающих уведомлениях не добавляет новых HTTP-маршрутов — см. §2.7 и вызовы из `MiniSheetModal`, `ActorRow` (`TrackerMacroButtons`), `GMConsoleSlider`, `StatEditPopover`, `DefaultSystemSheet`.

---

## 5. ESP32 Интеграция (Omnimini)

Реализовано: обнаружение по **mDNS**, управление по **HTTP** (`POST http://<ip>/update` с JSON: картинка, LED, яркость и т.д.). Это заменяет ранний черновик «ESP по WebSocket» из прототипа.

- **Не используется:** отдельный WebSocket-сервер для минек; только канал мастера `**/ws/master`** для React-клиента.
- **Рендер:** прошивка скачивает PNG по URL с сервера Omniboard — см. `**/api/render/{actor_id}`** и `**/api/render/output/{actor_id}.png**` (не существует маршрута `/api/render/actor/{id}`).
- **Таймауты HTTP-клиента на бэкенде:** для `/update` принят ориентир **20 s**, т.к. прошивка может удерживать ответ до завершения экранной анимации (см. ADR-21).
- **Линия инициативы:** миниатюры в режиме слота очереди получают переход экрана из правила `**initiative_shift`** в `led_triggers.json` (`transition: "none"` — без анимации).
- **Замена портрета на столе:** кадрирование на фронтенде (`react-image-crop` → 172×320 PNG с альфой), загрузка в библиотеку ассетов по правилам ADR-11.

