# Omniboard — Архитектурные решения и Ледник

> Обновлено: 10.05.2026 (**ADR-32** — AI Composer: динамическая генерация портретов; **ADR-31** — Co-GM hardening, телеметрия и персистенция чата); ранее: **ADR-30** — AI Co-GM: контекст боя + tool calling; **ADR-29** — прокси текстового чата и конфиг ИИ; **ADR-28** — персонализированный `/ws/player` и отчёт о бое; **ADR-27** — Player View; **ADR-26** — `initiative_roll`; **ADR-25** — toast броска; **ADR-24** — терминал GM Console

---

## Принятые архитектурные решения

### ADR-1: Монорепо (frontend + backend в одном репо)

**Решение:** Оставить всё в одной папке. `src/` — фронт, `backend/` — питон.  

### ADR-2: React 19 вместо Vue 3

**Решение:** После перезапуска прототипа в Google AI Studio стек сменился с Vue 3 + Pinia на **React 19 + TypeScript**.  

### ADR-3: Dual History Pattern (два разных «history»)

**Решение:** В проекте существуют две независимые системы истории:  

1. `**CombatSession.session.history: List[LogEntry]`** — нарративный лог.
2. `**CombatSession.session.history_stack`** + `**history_index`** — технические снэпшоты для Undo/Redo (см. ADR-18); живут в домене `session`, не уходят в публичный WS-payload целиком (на корне ответа — `can_undo` / `can_redo`).

### ADR-4: Asset Override Pattern (+ JSON-config merge)

**Решение:** Ассеты хранятся в двух уровнях (`data/assets/default/…` и `data/assets/systems/<name>/…`) для файлов (портреты, рамки, текстуры баров и т.д.).

**JSON-конфиги (расширение):** для ряда сущностей добавлен **базовый** слой `data/assets/default/config/<file>.json` и **оверрайд** `data/systems/<system_name>/<file>` с одинаковым именем файла. Функция `**load_config_with_override(system_name, file_name)`** (`backend/utils/config_loader.py`):

- для **массивов объектов с полем `id`**: элементы оверрайда **полностью заменяют** элементы базы с тем же `id`, новые `id` **добавляются** в конец;
- для **объектов-словарей**: глубокое слияние, листья оверрайда перекрывают базу;
- при отсутствии файлов — без исключений, предсказуемый fallback.

**Применение:** `layout_profiles.json`, `bars_config.json`, `led_profiles.json`, `mechanics.json`, `matrix.json`. Запись оверрайда — только в `data/systems/…` (база в `default/config` остаётся неприкосновенной).

**Рендер текстурных баров:** если у системы нет своего `bars/<theme_id>/config.json`, используется полный пакет **default** и для разрешения PNG-текстур не подмешиваются системные папки (избежание «гибридных» баров).

### ADR-5: i18n Namespace Pattern

**Решение:** UI-локализация (ядро) живет в `data/locales/{lang}/core.json`. Системная локализация живет внутри самих систем (см. ADR-10).

### ADR-6: Encounter Save Format (полный стейт)

**Решение:** `POST /api/encounters/save` сохраняет полный снимок `**CombatSession`** (вложенные `**core`**, `**display`**, `**hardware**`, `**session**`) — эквивалент автосейва боя для воспроизводимости сцены.

### ADR-7: Background Thread для записи логов

**Решение:** `add_log()` пишет файлы логов в `threading.Thread(daemon=True)`.

### ADR-8: Filename Sanitization

**Решение:** Очистка имен файлов через `_safe_columns_filename()` и `_safe_system_dir()`.

### ADR-9: AI Context Separation (Подготовка для Red Knight)

**Решение:** Механика, локализация и промпты для LLM строго разделены в разные файлы.

### ADR-10: System Encapsulation (Всё в одной папке)

**Решение:** Каждая игровая система полностью инкапсулирована в своей папке внутри `data/systems/<system_name>/` (Механика, Переводы, ИИ-профили). Базовые шаблоны являются Read-Only.

### ADR-11: Монолитная Архитектура Ассетов (Strict Asset-i18n Pattern)

**Решение:** Полный отказ от использования имен файлов для хранения пользовательских (отображаемых) названий. Файловая система выступает как первичная база данных для ассетов, строго синхронизированная с системой локализации (i18n).

- **Святая Троица:** Файл на диске == Технический ID == Ключ локализации.
- Изображения принудительно обрезаются до 172×320 и сохраняются в PNG для сохранения альфа-канала.
- Бэкенд автоматически обновляет словари переводов при загрузке файлов.

### ADR-12: Модульные Движки Боя (Modular Combat Engines)

**Статус:** Реализовано.

**Решение:** Логика боя вынесена из роутеров в изолированные классы в `backend/engines/`. Тип движка задаётся полем `**CombatSession.core.engine_type`** и выбирается через диспетчер `backend/engines/manager.py` (`get_engine_for_state`; внутри — совместимость через плоский `CombatState`).

**Описание:** Абстрактный `BaseInitiativeEngine` задаёт контракт (`build_queue`, `next_turn`, `on_round_lifecycle`, `has_next_pass` и др.). Конкретные движки подключаются без дублирования логики в HTTP-слое.

**Доступные базовые движки инициативы:**

- **Standard** — классическая убывающая очередь (D&D-style), в т.ч. simultaneous-группы как один слот.
- **Popcorn** — нарративная передача хода по клику (FATE / Lancer-подобный стиль), авто-раунд после полного круга.
- **Phase** — гибрид: очередь по убыванию инициативы, клик разрешён только для акторов в текущей «верхней» фазе (SotDL-подобный стиль).

**Расширение (Icebox):** опциональный плагин `data/systems/<name>/logic.py` для полной подмены движка на уровне системы. Сейчас наличие файла лишь помечает систему как `**initiative_engine_locked`** (блокировка смены `engine_type` через API); загрузка кастомного `BaseInitiativeEngine` через importlib — `**_try_load_custom_engine`** пока всегда возвращает `None` до завершения реализации (см. `system_has_custom_logic_file` в `manager.py`).

### ADR-13: Semantic Command Language (Rule Engine via LLM)

**Решение:** Боевая логика оборачивается в универсальный Rule Engine (на базе расширенной системы эффектов), управляемый через естественный язык. LLM парсит команды в структурированный JSON, а Rule Engine выполняет действия по триггерам (round_start, hp_threshold) и условиям.

### ADR-14: Нарративный режим (Manual Mode / Override)

**Статус:** Реализовано.

**Решение:** Флаг `**CombatSession.core.is_manual_mode`** отключает жёсткую валидацию очередей и индексов относительно «строгого» пошагового движка. Мастер передаёт ход кликом по любому актору в таблице; бэкенд выставляет `has_acted = True` у выбранного актора и обновляет `current_index` / очередь согласно выбранному `engine_type`.

**Описание:** Режим подходит для нарративных систем (PbtA, OSR и др.), где фиксированный порядок инициативы не обязателен. В сочетании с движками **Popcorn** и **Phase** клик по строке также передаёт ход; в **Manual** приоритет у полного переопределения — кликабельны все строки. Визуально используется затемнение по `has_acted` и сброс флагов на новом раунде (через жизненный цикл раунда в движке).

### ADR-15: Надежность аппаратной связи (TCP + mDNS)

**Решение:** Отказ от UDP-броадкастов в пользу TCP (HTTP) поверх mDNS (`zeroconf`).

**Обоснование:** UDP-пакеты часто теряются в домашних Wi-Fi сетях (особенно под нагрузкой). HTTP предоставляет гарантированную доставку, а `httpx.AsyncClient` с пулом соединений на бэкенде предотвращает блокировку event-loop'а при отвале миниатюр.

### ADR-16: Иерархия и Стек LED-состояний

**Решение:** Логика подсветки строится по принципу стека приоритетов (Stateful Override).

**Обоснование:** Чтобы избежать гонки состояний при одновременном рендере картинки и срабатывании временного триггера, бэкенд хранит словарь `ACTIVE_OVERRIDES` (`time`, `turn`). Приоритет вычисления итогового цвета: Временный Триггер (time > turn) -> Цвет активного Эффекта (например, яд/горение) -> Базовый профиль актора/группы.

### ADR-17: Адаптация LED-эффектов под один диод (Sequential Physics)

**Решение:** При передаче массива цветов на физическую миниатюру с одним диодом, цвета не смешиваются (кроссфейд), а проигрываются последовательно по фазам (Sequential).

**Обоснование:** Смешивание Красного и Зеленого на одном кристалле дает грязный желтый цвет. Последовательное отображение (например, в режимах `Breathe` или `Pulse`) сохраняет чистоту магии. Дополнительно на уровне С++ применяется гамма-коррекция (`gamma32`) для выравнивания логарифмической яркости зеленого кристалла.

### ADR-18: Декомпозиция состояния боя (`CombatSession`)

**Статус:** Принято и реализовано в `backend/models.py` + API/WebSocket.

**Решение:** Корневой тип `**CombatSession`** вместо плоского монолита:

- `**core: CombatCore`** — `actors`, `turn_queue`, `current_index`, `current_pass`, `round`, `engine_type`, `is_manual_mode`, `system`, `is_active`, `active_reaction_actor_id`;
- `**display: DisplayState`** — `selected_layout_id`, `legend`, `show_group_colors`, `show_faction_colors`, `table_centered` (списки `**LayoutProfile**` в стейте боя **не** хранятся; профили — файлы + merge, см. ADR-4);
- `**hardware: HardwareState`** — `sync_led_to_ui`;
- `**session: SessionMeta`** — `history`, `history_cursor`, `enable_logging`, `autosave_enabled`, `**history_stack`**, `**history_index**` (undo/redo изолированы в домене сессии; плоский снимок для стека не смешивается с публичным JSON без лишних полей).

**Совместимость:** `CombatSession.model_validate` принимает вложенный JSON и **плоский legacy**-словарь (раскладка по `LEGACY_*_KEYS`). Движки инициативы по-прежнему оперируют плоским `**CombatState`** через адаптеры `combat_session_to_combat_state` / `combat_session_merged_with_combat_state` (`backend/models.py`).

**Цель:** явные границы доменов, автосейв/encounter в одной схеме, подготовка к узким WS-патчам без перелома текущего клиента.

**Подробности и история плана:** `Refactoring_Plan.md` — разделы **«Декомпозиция `CombatState`»**, **«Выполнено»**.

### ADR-19: Cache-Busting миниатюр и портретов без heavy React-хэшей

**Статус:** Принято на фронтенде (`ActorRow.tsx`, `DefaultSystemSheet.tsx`).

**Проблема:** Сложные `renderHash` / `JSON.stringify(actor.stats)` в зависимостях React могут деградировать UI и не всегда реагируют на in-place мутации вложенных объектов. Кроме того, при proactive render фронт может запросить PNG раньше, чем бэкенд успел атомарно заменить файл.

**Решение:** Для миниатюр использовать статический output `**/api/render/output/{actor_id}.png`** с простым cache-buster из примитивных признаков (`id`, `name`, `layout_profile_id`, числовой срез статов, эффекты). Обновление `img src` делать с короткой задержкой (сейчас ~250 ms), чтобы не опережать фоновый рендер.

**Портреты:** для локальных `/assets/` и `/api/assets/` добавлять query от URL портрета, базовых примитивов актора и глобального `portraitCacheVersion`. При перезаписи файла по тому же URL UI может принудительно сбросить кэш через bump глобальной версии.

### ADR-20: Игровая механика в JSON, не в коде

**Статус:** Принято и реализовано (RPG-Excel, Dice Engine, Roll Matrix).

**Решение:** Механика игровых систем выносится из TS/Python в JSON-конфиги с Asset Override:

- `data/assets/default/config/mechanics.json` + `data/systems/<system>/mechanics.json` — `system_dice`, `formulas`;
- `data/assets/default/config/matrix.json` + `data/systems/<system>/matrix.json` — `generation_rules` для пред-бросков;
- `data/systems/<system>/columns.json` — UI/механические флаги колонок (`is_readonly`, `is_rollable`, `roll_formula`, `computed_formula_id`).

**Правило:** никакого хардкода игровых кубов (`1d20`) и системных формул в TS/Python. Код предоставляет движки и безопасное исполнение (`MechanicsManager`, `DiceManager`, `MatrixManager`), а различия D&D / Shadowrun / кастомных систем задаются данными.

**Обоснование:** Omniboard должен оставаться локальным конструктором систем, а не набором if-веток под конкретные правила. JSON-слой позволяет мастеру менять математику без релиза приложения, сохраняет переносимость ростера/энкаунтеров и соответствует ADR-4.

### ADR-21: UI-first proactive render и hardware side effects

**Статус:** Принято и реализовано для `next-turn`, proactive render и ESP push.

**Проблема:** Рендер Pillow и HTTP-команды к ESP32 — тяжёлые/сетевые side effects. Если они выполняются в event loop или стоят в очереди перед WebSocket-обновлением состояния, мастер видит лаг при смене хода, особенно при нескольких online-миниатюрах.

**Решение:** State mutation и `**broadcast_state()`** имеют приоритет над железом. Роутеры сначала изменяют `CombatSession` и отправляют UI-обновление, а затем запускают LED/render/ESP side effects как best-effort фоновые задачи. Pillow-композитор вызывается только через `asyncio.to_thread(...)` или отдельный executor.

**Файловая безопасность:** PNG рендера пишется атомарно: временный файл -> `os.replace`. Фронт и ESP не должны читать наполовину записанный файл.

**ESP-сеть:** HTTP `/update` к ESP32 всегда best-effort. После внедрения screen transitions timeout для `/update` принят **20 s**, потому что прошивка может держать HTTP-ответ до завершения анимации; ошибки по-прежнему логируются как warning и не должны ронять роутер, WebSocket broadcast или фоновую пачку задач.

**Практическое правило:** `BackgroundTasks` в FastAPI/Starlette не считать параллельной очередью. Если нужно несколько независимых hardware/render действий, запускать их одной фоновой корутиной через `asyncio.gather(..., return_exceptions=True)` или выделенной очередью сервиса.

### ADR-22: Линия инициативы для аппаратных миниатюр

**Статус:** Принято и реализовано (26.04.2026).

**Проблема:** Физическая миниатюра Omnimini раньше могла быть привязана только к конкретному актору (`Actor.miniature_id`). Для стола с несколькими экранчиками нужен режим «линии инициативы»: одно устройство всегда показывает текущий ход, другое — следующего, третье — третьего в очереди и т.д. При прокрутке инициативы миниатюры должны визуально “перелистываться”, не требуя ручной перепривязки к актору.

**Решение:** Глобальная запись `**MiniatureEntry`** получила аппаратный режим привязки:

- `**binding_mode: "actor" | "slot"`** — классическая привязка к актору или позиция в очереди.
- `**slot_index: int`** — внутренний 0-based offset от `**CombatSession.core.current_index**`. Во фронтенде показывается человеческая нумерация: **1 = текущий ход**, 2 = следующий.
- `**slot_led_mode: "actor" | "custom"`** и `**slot_led_profile_id`** — опциональное LED-переопределение именно для слотовой миниатюры.

**Алгоритм:** `ESPManager.refresh_initiative_line(combat_session)` выбирает все `MiniatureEntry` с `binding_mode == "slot"`, проверяет `turn_queue`, считает:

```python
target_index = (current_index + mini.slot_index) % len(turn_queue)
actor_id = turn_queue[target_index]
```

Если целевой актор для конкретной миниатюры изменился, вызывается `proactive_render_and_push(...)` с параметрами `**transition**` и `**transition_color**`, взятыми из системного правила `**find_hardware_trigger(system, "initiative_shift")**` (`data/systems/<system>/led_triggers.json`). Если правила нет или `**transition: "none"**`, анимация экрана не задаётся (раньше в прототипе использовались фиксированные `wipe_right` / белый цвет).

**Яркость экрана** (`HardwareState.screen_brightness`, 1–100 %) и разбор триггеров на сохранении — см. выполненную дорожную карту (фаза 10.8 в Progress).

**LED:** По умолчанию слот наследует LED-логику актора через `resolve_led_payload(actor_id)`. Если `slot_led_mode == "custom"` и задан `slot_led_profile_id`, payload собирается через `resolve_led_payload_for_profile(actor_id, profile_id)` и передаётся в `announce_image_update`, игнорируя дефолтный профиль актора для этого конкретного push.

**UI и контракты:** Управление железом сосредоточено в `**HardwareModal`**: таблица устройств, online/offline, режим `Персонаж` / `Слот очереди`, назначение, Blink/Forget, LED-профиль слота. `**MiniaturesModal`** остаётся отдельной модалкой для настройки вида/лейаута мини-экрана. Публичный payload `**CombatSession.hardware.miniatures**` является производным срезом (`data/miniatures.json` + mDNS status), а не новым источником истины для боевой механики.

**Сетевой нюанс:** Firmware ESP32 синхронно удерживает HTTP-ответ `/update` до конца экранной анимации. Поэтому timeout 1 s давал ложные offline; для image update принят timeout **20 s**. mDNS browser дополнительно принудительно стартует в `POST /api/hardware/discover`.

### ADR-23: Безопасная ротация логов и умная очистка энкаунтера

**Статус:** Реализовано.

**Решение:** Архивация файлов лога перенесена на момент остановки боя (`POST /api/combat/end`) и выполняется асинхронно напрямую из памяти (`session.history`), исключая конфликты `shutil.move` с фоновым потоком записи. При очистке стола (`POST /api/combat/clear`) добавлена опция сохранения закрепленных акторов (с фильтрацией их эффектов: оставляем только бесконечные) и точечный `sleep` аппаратных миниатюр. Очистка стола фиксируется в истории для поддержки Undo/Redo.

### ADR-24: Терминал бросков GM Console — клиентский резолв `!` / `$`

**Статус:** Реализовано (май 2026).

**Решение:** Ввод режима **Roll** нижней консоли мастера (`src/components/GMConsole/`) парсится и **разворачивается на клиенте** в готовые арифметические выражения **до** `POST /api/combat/roll` или `POST /api/combat/actors/{id}/roll`. Префиксы `!stat` и `$macro` на бэкенд **не передаются**: подстановка значений статов и формул действий выполняется во фронтенде (`src/utils/rollTerminal.ts`), с учётом `columns.json`, `mechanics.json` (`system_dice`), `mergeActorActionDefs` и пер-актёрных `formula_override` / `custom_formula`.

**Поведение:**

- Строка разбивается на сегменты по `;`; для **каждого** упомянутого через `@` актёра строится свой план (`planSegmentsForActor`) — мульти-актёр порождает несколько последовательных запросов.
- Одиночный сегмент, состоящий только из `!key` (в т.ч. `!{подпись с пробелами}` при полном совпадении ключа), разворачивается в шаблон колонки (`roll_formula` / `system_dice + !key`) до числового резолва.
- `$macro` сначала подставляется как обёрнутая `(formula)`, затем внутри выражения резолвятся вложенные `!stat`.
- Триггер `!` игнорируется сразу после кубической нотации без break-char (например `1d6!`, `4d6!>5`), чтобы не ломать explode в `d20`.

**Обоснование:** `DiceManager` остаётся системно-агностичным и получает уже «плоские» формулы; не нужно тащить Unicode-ключи статов и длинные подписи через бэкендский regex `[stat_key]`. Параллельный путь подстановки `[stat_key]` в `DiceManager` сохраняется для других вызывающих сторон.

**UX:** автодополнение — `RollTokenPopup.tsx`; контракт токенов и попапа — `Omniboard_TZ.md` §2.6.

### ADR-25: Результат броска в toast (`rollToast.tsx`)

**Статус:** Реализовано (май 2026).

**Решение:** Ответы `POST /api/combat/roll` и `POST /api/combat/actors/{id}/roll` уже возвращают сериализованный **`RollResult`**. На клиенте введён общий слой **`src/utils/rollToast.tsx`**: парсинг JSON и ошибок FastAPI, **`toast.custom`** из **`react-hot-toast`** в палитре приложения (единый контраст с «обычными» тостами через **`toastOptions`** в `main.tsx`). Одиночные вызовы (мини-лист, колонка макросов в трекере, быстрый бросок колонки, бросок из сводки мини-листа) показывают один карточный тост; консоль мастера после успешной серии запросов — **один агрегированный** список (**`showRollBatchToast`**). Развернутый редактор стата (**`StatEditPanel`**) по-прежнему использует только встроенный **`rollFlash`** без дублирующего toast.

**Обоснование:** мастер видит итог без переключения на лог; протокол API не менялся.

**ТЗ:** `Omniboard_TZ.md` §2.7.

### ADR-26: Бросок инициативы (`initiative_roll`) и две стратегии перестройки очереди

**Статус:** Реализовано (май 2026).

**Решение:** Шаблон броска задаётся в **`mechanics.json`** ключом **`initiative_roll`** (см. `backend/services/initiative_roll.py`, только **D20Engine** для суммы выражения). Настройки сессии (**«каждый раунд»**, **«кубик в строках»**) живут в **`SessionMeta`** и мержатся в публичный стейт; флаги **`initiative_roll_available`** и т.д. — в ответах API.

- **`POST /api/combat/initiative/roll`** (ручной или массовый бросок **внутри раунда**) после обновления значений инициативы вызывает **`reorder_turn_queue()`**: текущий слот очереди **сохраняется по индексу**, чтобы не «перепрыгивать» ход при частичном перебросе.
- При **автоперебросе по росту `round`** (замок «каждый раунд», не **popcorn** / **none**) после пересчёта инициатив вызывается **`rebuild_turn_queue_after_initiative_reroll()`** в `combat_engine.py`: та же нормализация simultaneous и сортировка, что при **`start_combat`**, затем **`current_index = 0`** — первый ход в новом порядке.

**Обоснование:** смесь двух стратегий устраняет баг «активный не максимальный init» после раундового переброса при `current_index === 0` после wrap.

**ТЗ:** `Omniboard_TZ.md` §2.1.5, §4.

### ADR-27: Player View — публичный WS-канал, кампании, персонажи

**Статус:** Реализовано (май 2026).

**Контекст:** Нужен «второй экран» для игроков — мобильная страница `/player` с инициативой, листом персонажа и действиями. Данные должны быть частично скрыты (скрытые акторы, GM-поля не видны).

**Решения:**

1. **Два раздельных WS-канала.** `/ws/master` — полный стейт для GM. `/ws/player` — публичный отфильтрованный стейт через `backend/services/player_state.py::get_player_public_state()`. Функция: удаляет акторов с `is_revealed=False`, применяет маски `Visibility`, убирает `hotbar`, `miniature_id`, `layout_profile_id`, стрипует `session.prerolls`, `history_stack`, `history_index`, `hardware`. **Поля `actions` и `actions_panel_override` намеренно не стрипуются** — игрок должен видеть свои макросы.

2. **Файловое хранилище кампаний.** `data/campaigns/<system>/<campaign_id>/players/*.json` — каждый файл есть полный `Actor`-снимок персонажа кампании. Путь валидируется через `get_campaign_players_dir()` в `backend/paths.py` (защита от path traversal, аналогично существующим `get_actors_system_dir`).

3. **Сессионные токены в памяти.** `app_state.claimed_players: dict[str, str]` (actor_id → token) + `token_to_actor` (обратный индекс). Перезапуск сервера сбрасывает токены — игрокам нужно перебронировать персонажей через лобби. Принято как допустимо для локального сетапа за живым столом.

4. **Данные макросов — через персональный эндпоинт, не через WS.** `GET /api/player/actor/{id}` (с токеном) возвращает полный Actor из файла кампании. `ActionsView` использует именно этот эндпоинт, а не `state.core.actors.find(...)` — потому что в публичном WS-стейте актора может ещё не быть (не в бою) или он отфильтрован по `is_revealed`. Это делает панель действий независимой от боевого стейта.

5. **Сохранение ID при добавлении персонажа в бой (`keepId`).** Игрок бронирует персонажа по его UUID из кампании. Когда GM нажимает «В бой» из вкладки **Персонажи** Компендиума, флаг `keepId=true` передаётся явно через цепочку `onAdd(actor, count, keepId?)`. `addFromRoster(template, keepId=true)` использует `template.id` вместо `crypto.randomUUID()`. Проверка больше не завязана на `actor.role` — campaign character может иметь любую роль. Чипы NPC (вкладка НПС) всегда передают `keepId=false`.

6. **Определение «мой ход» на клиенте.** `isMyTurn = state.core.is_active && state.core.turn_queue[current_index] === auth.actorId`. `turn_queue` в публичном стейте не фильтруется (в отличие от `actors`), поэтому ID всегда присутствует корректно.

7. **Роутинг без react-router-dom.** `src/main.tsx` проверяет `window.location.pathname.startsWith('/player')` и рендерит `PlayerApp` вместо основного `App`. Избегаем добавления зависимости ради одного маршрута.

**Файлы:** `backend/routers/player.py` (новый роутер `/api/player`), `backend/routers/ws.py` (`/ws/player`, `broadcast_player_state`), `backend/services/player_state.py`, `backend/paths.py`, `backend/state.py`, `src/player/` (весь модуль).

### ADR-28: Персонализированный `/ws/player` и отчёт о бое

**Статус:** Реализовано (май 2026).

**Контекст:** ADR-27 ввёл общий отфильтрованный WS-канал `/ws/player`. Все игроки получали одинаковый «публичный» стейт: собственный актор игрока маскировался так же, как чужие. Это ломало панель действий (скрытые хп нельзя показать игроку для его же персонажа) и мешало отображению полных данных листа. Также отсутствовал механизм записи изменений боя обратно в файлы кампании.

**Решения:**

1. **Персонализация WS-payload.** Каждый `/ws/player`-клиент передаёт свой токен через query-параметр `?token=<token>` при установке соединения. Бэкенд резолвит `actor_id` через `token_to_actor` и сохраняет связку в модульной таблице `_player_sockets: dict[WebSocket, str | None]`. При каждой рассылке (`broadcast_player_state`) для каждого сокета строится **отдельный** payload через `get_player_public_state(session, current_player_actor_id)`.

2. **Собственный актор без маскировки.** В `get_player_public_state(session, current_player_actor_id)` для актора с совпадающим `id` применяется `_build_own_actor()` вместо `_apply_actor_visibility()`: удаляются только аппаратные поля (`hotbar`, `miniature_id`, `layout_profile_id`), но `is_revealed = False` не скрывает, а маски `Visibility` не применяются. Игрок всегда видит своего персонажа целиком.

3. **Хук `usePlayerActor` — единый источник истины.** `src/player/hooks/usePlayerActor.ts` реализует приоритетный паттерн:
   - WS-стейт: `state.core.actors.find(id)` — мгновенные обновления от GM.
   - HTTP `/api/player/actor/{id}` — bootstrap/fallback для лобби и первого рендера.
   `SheetView` и `ActionsView` ранее дублировали этот паттерн (~30 строк каждый); после рефакторинга оба вызывают только `usePlayerActor(auth, state)`.

4. **Переподключение WS после клейма.** В `usePlayerSocket(token?)` токен добавлен в deps `useEffect` — при клейме персонажа сокет закрывается и переоткрывается с новым `?token=`, гарантируя персонализированный payload с первого сообщения.

5. **Отчёт о бое + синхронизация кампании.** `POST /api/player/combat-report` закрывает «петлю» жизненного цикла кампании:
   - Загружает снимок «до боя» из `data/campaigns/<sys>/<id>/players/` (через `_load_actors_from_dir`).
   - Сравнивает с текущим живым стейтом через `stat_cell_effective_scalar`.
   - Генерирует Markdown-отчёт (дата, система, кампания, раунды; таблицы изменений по каждому персонажу).
   - Сохраняет `data/logs/combat_report_<timestamp>.md`.
   - Перезаписывает файлы персонажей кампании актуальными данными из боя.
   - Возвращает `{ filename, markdown, actors_written }` для отображения в `CombatReportModal`.

**Обоснование paттерна «live-first»:** HTTP-эндпоинт `/api/player/actor/{id}` уже после ADR-27 был исправлен возвращать живой стейт (`app_state.state.core.actors`) в приоритете над файлом. WS-персонализация делает то же самое для push-канала: игрок всегда видит данные GM-правок без задержки polling'а.

**Файлы:** `backend/services/player_state.py`, `backend/routers/ws.py`, `backend/routers/player.py`, `src/player/hooks/usePlayerActor.ts`, `src/player/hooks/usePlayerSocket.ts`, `src/player/PlayerApp.tsx`, `src/player/views/SheetView.tsx`, `src/player/views/ActionsView.tsx`, `src/components/Modals/CombatReportModal.tsx`, `src/components/CombatToolbar.tsx`.

### ADR-29: Прокси текстового чата и файл конфигурации ИИ (фаза AI.1)

**Статус:** Реализовано (май 2026).

**Контекст:** режим **AI** в GM Console изначально был UI-заглушкой. Нужен минимальный безопасный путь к LLM без раскрытия ключей во фронте и без привязки к одному вендору в коде UI.

**Решение:**

1. **Глобальный конфиг** в **`data/config/ai_settings.json`** (`AIConfig`: `chat_api_key`, `chat_base_url`, `chat_model`; опционально `image_*` для будущего композитора). Загрузка через **`backend/utils/ai_config.py`**, миграция легаси-ключей из ранних экспериментов (OpenRouter и т.п.).

2. **Единая точка выхода к провайдеру** — **`POST /api/ai/chat`**: тело с массивом **`messages`** в форме OpenAI Chat; бэкенд дергает **`{chat_base_url}/chat/completions`** с **`httpx`**, парсит **`choices[0].message.content`**, ошибки HTTP провайдера отдаёт клиенту как **502** с усечённым **`detail`**.

3. **Ключи только на сервере.** Браузер вызывает свой же origin `/api/…`; секреты не проходят через `localStorage` и не зашиваются в сборку.

**Границы фазы:** нет function calling, нет инъекции снимка **`CombatSession`** в промпт, нет RAG. Расширения — см. icebox «Красный Рыцарь» и **`Red_Knight_Vision.md`**.

**Файлы:** `backend/routers/ai.py`, `backend/utils/ai_config.py`, `backend/models.py`, `src/hooks/useAiChat.ts`, `src/components/GMConsole/AIChatDrawer.tsx`, `src/components/Modals/ConfigTabs/AITab.tsx`.

### ADR-30: AI Co-GM — контекст боя и Tool Calling (фаза AI.2)

**Статус:** Реализовано (май 2026).

**Контекст:** ADR-29 дал безопасный прокси к LLM, но модель не видела стол. Чат был чистой риторикой — без знания раунда, активного актора, HP. Phase AI.2 превращает чат в Co-GM: модель получает компактный снимок `CombatSession` и единственный инструмент `apply_combat_mutations`.

**Решение:**

1. **Системный контракт per-system** — markdown-файл `ai_system_prompt.md`, оверрайд через ADR-4. **Default:** `data/assets/default/config/ai_system_prompt.md`. **Override:** `data/systems/<system_name>/config/ai_system_prompt.md` — *новый подкаталог* `config/` под системой (ранее JSON-файлы лежали прямо в `data/systems/<sys>/`; markdown-контракт получает свой namespace, чтобы не путаться с `mechanics.json`/`columns.json`/etc.). UI редактируется в ConfigModal → AI.

2. **Минимальный JSON-снимок боя** в системном сообщении: `round`, `phase`, `active_actor_id`, `stat_schema` (numeric_stats и max_pairs из `columns.json`, никакого хардкода `hp`/`max_hp`), `actors[]` с id/name/faction и числовыми статами. Без портретов, формул, IP, MAC. Прячем "лежачих" (hp ≤ 0) по умолчанию; есть guardrails при > 60 акторах.

3. **Один инструмент `apply_combat_mutations`** (OpenAI Tool Calling): массив `actions` с `target_id` (id или ключевые слова `all_heroes` / `all_enemies` / `all_allies` / `all_neutrals`), `stat_id`, `operation` (`add` / `subtract` / `set`), `value`. Бэкенд валидирует stat_id против `stat_schema.numeric_stats`, target_id — против живых акторов, клампит на `max_<stat>` и на 0 при `subtract`.

4. **Поведение как у ручных правок GM:** после применения мутаций — `save_snapshot()` (ADR-3 undo стек) + `broadcast_state()` + запись `stat_change` в `add_log` (ADR-7). Действия ИИ ровно как ручные: видны в `data/logs/latest_combat.md`, откатываются Undo, синхронизируются на ESP32.

5. **Single round-trip flow.** Не отправляем `tool_result` обратно модели — UI показывает текст ассистента + панель `system_report` с аудит-строками. Защитный парсер допускает Gemini-style ответы (отсутствующие или частичные `tool_calls`).

6. **Сериализация через `asyncio.Lock`** на блок применения мутаций — два быстрых запроса не интерливятся.

7. **Только GM-API.** Эндпоинт `/api/ai/chat` остаётся в зоне доверия GM (Player View ходит другими маршрутами).

**Файлы:** `backend/services/ai_context.py`, `backend/routers/ai.py`, `backend/models.py`, `data/assets/default/config/ai_system_prompt.md`, `src/hooks/useAiChat.ts`, `src/hooks/useAiSystemPrompt.ts`, `src/components/GMConsole/AIChatDrawer.tsx`, `src/components/Modals/ConfigTabs/AITab.tsx`, `data/locales/{en,ru,ger,je}/core.json`.

**Границы фазы:** не трогаем эффекты, не передаём ход / инициативу, не меняем base/overrides у `StatValue` (только `value`). Это придёт следующими фазами (RAG, голос, генерация энкаунтеров).

### ADR-31: Co-GM hardening, телеметрия и персистенция чата (фаза AI.2.5)

**Статус:** Реализовано (10.05.2026). **Дополняет ADR-30** и **меняет семантику** `ai_mode`: теперь **standard** = Co-GM с контрактом и `apply_combat_mutations`, **red_knight** = заглушка под будущий самостоятельный агент (RAG / векторная БД / Home Assistant), временно работающая как passthrough. Конфиг-файлы переключатся автоматически (`Literal["standard","red_knight"]`, дефолт `standard`).

**Контекст:** ADR-30 закрыл функционал Co-GM, но пакет шёл с пятью «слабыми местами»: (1) LLM-имена акторов уезжали в системное сообщение нерегулируемо — открытая поверхность для prompt injection; (2) `apply_combat_mutations` принимал отрицательные `value` и обходил клампы; (3) `tool_calls` парсер падал на пустом `content`; (4) чат сбрасывался при F5 — стейт жил только в React; (5) не было ни одного механизма видеть, что ИИ делает с моим API-кредитом и зачем (debug + аналитика). Эта фаза закрывает все пять.

**Решение:**

1. **Math hardening и санитайзер (`backend/services/ai_context.py`):**
   - `value` всегда приводится к `abs(float(value))` ДО арифметики — LLM не может протащить отрицательное число.
   - `add` клампит на `max_<stat>` (если в `stat_schema.max_pairs`); `subtract` — на `0`; `set` — на `[0, max_<stat>]`.
   - `_sanitize_actor_name`: вырезает control-chars + markdown-спецсимволы (`` ` * _ [ ] < > # ~ | \ ``), коллапсирует пробелы, длина ≤ 50 (с `…` на хвосте). Применяется к `name` всех акторов в JSON-снимке.
   - `_is_alive` обобщён: системно-агностично «живой = хоть один числовой стат > 0»; уважает потенциальное `actor.status != "dead"`. Жёсткая привязка к `hp` убрана.
   - `APPLY_MUTATIONS_TOOL` стал **функцией** `get_mutations_tool_schema(system_name)`: `stat_id.enum` динамически собирается из `resolve_combat_stat_ids(system).numeric_stats`, `value.minimum: 0`. Старая константа сохранена как backwards-compat алиас (резолв с пустым system).

2. **State read lock (`backend/state.py`):** добавлен модульный `lock: asyncio.Lock`. `/api/ai/chat` обёртывает построение системного сообщения и блок применения мутаций в `async with app_state.lock` — снимок боя, который уехал в LLM, гарантированно консистентен с тем, что мы потом будем мутировать. HTTP-вызов провайдера остаётся ВНЕ lock, чтобы параллельные чаты могли «висеть» на сети одновременно.

3. **Resilient parser + synthetic content:** `_extract_assistant_message` больше не raises — возвращает `{}` на любую малформированность. `_content_to_str(None) = ""`. Если LLM применил инструмент, но прислал пустой `content` — бэкенд подставляет «Действия применены.» (синтетический ответ). Без него следующий ход уносил пустой `content` block обратно в провайдера и Anthropic / Gemini возвращали 400 "empty content block" → re-trigger loop.

4. **Token telemetry — `backend/services/ai_logger.py`:**
   - JSONL-файлы по дню: `data/logs/ai/YYYY-MM-DD.jsonl`. Daemon-тред (как `add_log` из ADR-7), запрос не блокируется на диск.
   - Запись: `ts`, `request_id`, `mode`, `model`, `system`, `request{messages summary, tools_offered}`, `response{status, latency_ms, content_chars, content_excerpt, tool_calls[name,args_chars,actions_count], usage, error}`, `mutations{applied_count, warnings_count, lines}`.
   - Логируется ВСЕ исходы: timeout, connect error, HTTP ≥ 400, invalid JSON, empty content, синтетический ответ, нормальный успех — каждое со своим `error` маркером.
   - Авто-ретеншен 60 дней.
   - **Эндпоинт** `GET /api/ai/usage/summary?days=N` — `{today, window{calls,prompt_tokens,completion_tokens,total_tokens,days}, last_call{ts,mode,model,latency_ms,applied_count,usage}}`. UI: новый SectionCard «Расход токенов» во вкладке AI с моноширинной плашкой последнего запроса и кнопкой `⟲` для refresh.
   - Поле `usage` едет на фронт в `AIChatAssistantReply.usage` и рисуется как `[Tokens: P + C = T]` в углу assistant-bubble.

5. **Персистенция чата — `backend/services/ai_chat_history.py` + `data/state_ai_chat.json`:**
   - Файл хранится **отдельно от** `state_autosave.json`, чтобы не раздувать undo-стек длинными разговорами и не уносить чат в WS-payload боя. Внутри: `{version, updated_at, messages: [...]}` с whitelist-санитайзером (только `user|assistant|system`, `isLocal` отбрасывается, `system_report`/`usage` сохраняются на assistant-турнах).
   - Атомарная запись через `tempfile.mkstemp + os.replace` (тот же паттерн, что у `save_state_sync`), `threading.Lock` для конкурентных писателей. Хард-кэп 500 сообщений.
   - **Эндпоинты:** `GET /api/ai/chat/history` → `{messages: [...]}` для гидратации после рефреша; `DELETE /api/ai/chat/history` → wipe.
   - **Жизненный цикл «в рамках боя»:** `POST /api/combat/clear` теперь дополнительно вызывает `clear_ai_chat_history()` рядом с очисткой `latest_combat.json/.md`. Новый бой стартует с чистым диалогом.
   - Фронт `useAiChat` на маунте делает GET и заливает `messages`. Метод `clearChat()` доступен наружу.
   - **Анти-poison:** `isLocal` сообщения (UI-нотисы про отсутствие ключей / network error) отмечаются на клиенте и отфильтровываются ИЗ outbound-payload. Бэкенд их не видит, в персистенцию они не попадают.

6. **Defensive subpath guard в `POST /api/assets/{category}`:** явный список зарезервированных подпутей (`generate`, `notes`, `bars`) с понятным 400 `"/api/assets/{category} does not accept multipart upload"` — на случай если порядок роутов сломается. Не помогает в случае Pydantic-валидации до тела (она 422-ит раньше), но улучшает диагностику ошибок маршрутизации.

**Файлы:** `backend/services/ai_context.py`, `backend/services/ai_logger.py`, `backend/services/ai_chat_history.py`, `backend/state.py`, `backend/routers/ai.py`, `backend/routers/combat.py`, `backend/routers/assets.py`, `backend/models.py`, `backend/utils/ai_config.py`, `src/hooks/useAiChat.ts`, `src/hooks/useAiUsage.ts`, `src/hooks/useAiSettings.ts`, `src/components/GMConsole/AIChatDrawer.tsx`, `src/components/Modals/ConfigTabs/AITab.tsx`, `src/types.ts`, `data/locales/{en,ru,ger,je}/core.json`.

**Границы фазы:** mode `red_knight` функционально идентичен Phase-1 passthrough — он остаётся видимой ручкой для будущей agent-инфраструктуры. Эффекты по-прежнему не проксируются через `apply_combat_mutations` (только числовые статы), голос/STT не входит, RAG не входит — это явно за рамками AI.2.5.

### ADR-32: AI Composer — динамическая генерация портретов (фаза AI.3)

**Статус:** Реализовано (10.05.2026).

**Контекст:** портрет актора — единственный визуальный канал между digital-стейтом и физическим столом / экраном **172×320** на Omnimini (CLAUDE.md, ESP32-секция). До AI.3 портрет был полностью статичным — GM грузил PNG руками; «зомбификация» live-актёра по эффекту требовала второго прохода через PhotoShop. AI.3 закрывает обе дыры: ИИ-генератор по промпту в библиотеке + автоматическая регенерация портрета при наложении эффекта с `ai_prompt`. Жёсткое требование: ничего не блокирует event loop, итоговый PNG всегда **172×320**.

**Решение:**

1. **`smart_crop_and_resize` (`backend/services/image_utils.py`):** `bytes → bytes` через Pillow. Если источник шире целевого аспекта (172:320) — симметричная обрезка по бокам; если выше — head-bias crop (10% сверху, остальное снизу), чтобы лицо/голова не уезжали в кадр. LANCZOS-resampling до 172×320 PNG, RGBA-прозрачность переживает round-trip. Sync-функция, вызывается из event-loop через `asyncio.to_thread` (CPU-bound). Геометрия 172×320 захардкожена как `TARGET_W`/`TARGET_H` — не трогать без согласования с прошивкой ESP32 и compositor-pipeline.

2. **`backend/services/ai_composer.py` — два потока:**
   - **Flow A: actor portrait regeneration** (`process_actor_portrait_task(actor_id, prompt, base_image_path)`). Триггер — наложение эффекта с непустым `ai_prompt` через `PATCH /api/actors/{id}` (см. п.4). Под `app_state.lock`: апдейт `actor.portrait` + сброс `is_generating_portrait=False` → `save_snapshot()` → `broadcast_state()` → best-effort `proactive_render_and_push` (ESP-миниатюра подхватывает новый портрет тем же путём, что и при ручной правке). Идемпотентен на ошибке: при любом raise сбрасываем флаг, чтобы UI не залип на спиннере.
   - **Flow B: library async job** (`process_library_portrait_task(job_id, prompt)`). Триггер — `POST /api/assets/generate`. RAM-registry `_JOBS: dict[str, GenerationJob]` (status `queued|running|done|failed`, кэп 200 с вытеснением старых finished). По завершению шлёт WS `ai_image_ready` (см. п.5).

3. **Авто-детектор провайдера в `generate_image()`:** строится по `urlparse(image_base_url).hostname`.
   - **Native Gemini** (`generativelanguage.googleapis.com` БЕЗ `/openai` в пути): `POST {base}/v1beta/models/{model}:generateContent` с `x-goog-api-key` в заголовке (ключ не уходит в URL/логи), body `{contents:[{parts:[{text}, {inline_data?}]}], generationConfig:{responseModalities:["TEXT","IMAGE"]}}`. URL **принудительно нормализуется к `/v1beta`** независимо от того, что прописал пользователь — `responseModalities` поддерживается только под этой версией; `v1main`/`v1`/`v1alpha` 400-ят на «Unknown name 'responseModalities'». Парсер ходит по `candidates[].content.parts[]`, поддерживает `inline_data`/`inlineData`, ловит `promptFeedback.blockReason` и `finishReason != STOP` с понятными сообщениями.
   - **OpenAI / OpenRouter / LiteLLM / SD-WebUI compat shim** (всё остальное): txt2img — `POST {base}/images/generations` с JSON; img2img — `POST {base}/images/edits` (multipart, источник пред-обрабатывается до 1024×1024 RGBA PNG как требует OpenAI). `Authorization: Bearer`. Ответ — `data[0].b64_json`.
   - Pluggable adapter pattern сознательно отвергнут на момент AI.3 — детектор по хостнейму закрывает все известные на момент релиза кейсы и не требует нового конфиг-поля.

4. **Хук в `PATCH /api/actors/{id}` (`backend/routers/actors.py`):** в существующем effect-diff блоке (см. ADR-30 / Phase 14) ищем первый новый эффект с непустым `ai_prompt`. Если есть — ставим `actor.is_generating_portrait = True` **до** `broadcast_state()` (UI получает спиннер тем же тиком, когда видит эффект), и через `BackgroundTasks.add_task` дис­патчим `process_actor_portrait_task`. Несколько одновременно наложенных «ai-эффектов» race-ятся за `actor.portrait` — поэтому первый wins per PATCH. **LLM-инструмент `generate_portrait` сознательно НЕ добавлен** — регенерация запускается только ручным действием GM в UI, чтобы Co-GM не делал «сюрпризов» с визуалом.

5. **WebSocket события и фронт:**
   - `is_generating_portrait: bool` едет на регулярном `state_update` (новое поле `Actor`). `ActorRow.tsx` рисует `Loader2 animate-spin` в `bg-zinc-950/65 backdrop-blur` поверх существующего портрета.
   - Новый WS-broadcast `broadcast_ai_image_event(payload)` (`backend/routers/ws.py`) шлёт плоский `{type:"ai_image_ready", job_id, ok, path?, error?}`. Фронт-мост — в `useCombatState.ts`: при получении `ai_image_ready` re-emit как `window` CustomEvent `omniboard:ai-image-ready`. Это позволяет `LibraryModal` слушать одно событие без открытия второго WS-сокета.

6. **Endpoints (новые):**
   - `POST /api/assets/generate` — `{prompt: str, max 2000}` → `{job_id, status:"queued"}` мгновенно. Asyncio-task сразу запускается.
   - `GET /api/assets/generate/{job_id}` — поллинг fallback (если WS недоступен): `{job_id, status, path, error, created_at, finished_at}`.
   - `GET /api/ai/image/models` — диагностика. Auto-detect провайдера, для Gemini зовёт `/v1beta/models` с `x-goog-api-key`, для OpenAI `/models` с `Authorization: Bearer`. Возвращает `{provider, endpoint, models:[{id, display_name, supports_image, methods, description}]}`. Эвристика «image-capable»: `image|imagen|dall-e|sdxl|flux|stable-diffusion` в имени. Image-capable модели всплывают наверх. UI: панель в `AITab` с кликабельными строками — клик ставит выбранный `id` в поле Model.

7. **Storage:** `data/assets/generated/{actor_<id>|lib}_<sha1prefix>.png`. Плоская кросс-системная папка под существующим `app.mount("/assets", …)` — фронт получает PNG как `/assets/generated/<file>.png`. Имя `actor_<id>_<hash>` коллапсирует «тот же актёр + тот же промпт» в один файл (детерминированный хэш промпта, 10 символов). Library jobs включают наносекундный suffix чтобы нечаянно не перезаписать предыдущую генерацию того же промпта. Папка создаётся в `ensure_dirs()` (см. `backend/paths.py:GENERATED_ASSETS_DIR`).

**Файлы:** `backend/paths.py`, `backend/models.py`, `backend/services/image_utils.py`, `backend/services/ai_composer.py`, `backend/routers/actors.py`, `backend/routers/assets.py`, `backend/routers/ai.py`, `backend/routers/ws.py`, `src/types.ts`, `src/hooks/useAiImageModels.ts`, `src/hooks/useCombatState.ts`, `src/components/InitiativeTracker/ActorRow.tsx`, `src/components/Modals/LibraryModal.tsx`, `src/components/Modals/ConfigTabs/AITab.tsx`, `data/locales/{en,ru,ger,je}/core.json`.

**Границы фазы:**
- LLM-инструмент `generate_portrait` отложен (см. п.4 — сознательное решение, не «не успели»).
- Imagen-семейство (`imagen-3.0-*`) использует `:predict` endpoint с `instances[]` — **не реализовано**, на текущей фазе только `:generateContent` / `gemini-*-image-preview`. Если понадобится — добавим Imagen-ветку, она уже частично развёрнута через тот же детектор.
- Модерация контента отдана на откуп провайдеру (Gemini шлёт `promptFeedback.blockReason`, парсер их понимает; OpenAI шлёт 400 с текстом — пробрасывается в `system_report`). Локальной модерации нет.
- Нет повторных попыток / экспоненциального backoff: при HTTP ≥ 400 от провайдера задача завершается с `failed`, флаг `is_generating_portrait` сбрасывается, спиннер уходит, но GM получает ошибку в WS-событии.

---

## Отклонённые идеи

- **SQLite вместо JSON-файлов:** Оставляем JSON — легко редактировать вручную.
- **Event Sourcing для Undo/Redo:** Over-engineering. Снэпшотов достаточно.

---

## Ледник (Icebox) — фичи на будущее

### 🧊 Нормализация акторов при экспорте в ростер (Template vs Instance)

При сохранении актора из **живого боя** в `**data/actors/<system>/`** различать **шаблон** (переиспользуемый NPC: обнулять/не тащить encounter-специфичные поля) и **снимок экземпляра** (сохранить текущие HP/эффекты для «как на столе»). Единый контракт полей, опция в UI экспорта, миграция старых JSON ростера.

### 🧊 AI-Ассистент "Красный Рыцарь" (Text-to-Action)

Голосовой и текстовый помощник для Мастера (NLP + LLM + STT/TTS).

- **Умная строка чата:** Естественный язык превращается в JSON-запросы ("-5 хп всем гоблинам"). *Закрыто (10.05.2026): см. **ADR-30 / ADR-31** — Co-GM с инструментом `apply_combat_mutations` доступен в режиме `ai_mode = standard`.*
- **ИИ-Генератор Энкаунтеров ("Боблинизация"):** Массовая генерация уникальных NPC из базового шаблона с разбросом статов и уникальными портретами.
- **ИИ-Композитор:** Генерация визуальных эффектов Image-to-Image (промпт "Зомби" перерисовывает оригинальный портрет актора). *Закрыто (10.05.2026): см. **ADR-32** — авто-регенерация портрета по `Effect.ai_prompt` + ручная генерация в библиотеке через `POST /api/assets/generate`.*
- **Справочник мастера (RAG):** ИИ-поиск по загруженным правилам систем для быстрых ответов. *Запланировано в режиме `ai_mode = red_knight` (текущая заглушка ADR-31).*
- **Голос (STT/TTS):** не реализовано.

### 🧊 GM Console (Ширма Мастера)

Выдвижная боковая/нижняя панель и отдельная страница `**/gm-console`** для многоэкранного сетапа: терминал бросков, AI-помощник, Roll Matrix, быстрые заметки и история последних действий. Консоль не должна перекрывать трекер боя модалками; цель — второй монитор / планшет мастера.

*Частично закрыто (май 2026):* нижняя плавающая консоль в основном UI даёт режимы Note/Roll/AI, язык токенов броска (`@`, `!`, `$`, сегменты `;`, комментарий `#`, см. **ADR-24** и `Omniboard_TZ.md` §2.6), попап автодополнения, `POST /api/combat/roll` и Smart Notes — **без** отдельного маршрута `/gm-console`. Режим **AI**: текстовый чат через **`/api/ai/chat`** (**ADR-29**, фаза AI.1 в **`Progress_and_Backlog.md`**).

### ~~🧊 Data-driven макросы бросков (`!stat`)~~ → **закрыто на клиенте (ADR-24)**

Первоначальная формулировка предполагала резолв `!stat` на сервере. **Фактическая реализация:** развёртка `!` и `$` в терминале Roll выполняется **на клиенте** до API; источник правды по формулам и статам по-прежнему data-driven (`columns.json`, `mechanics.json`, `actions.json`, пер-актёрные overrides). См. **ADR-24** и §2.6 ТЗ.

### 🧊 Три лица Мини-чарника

Концепт редизайна мини-листа персонажа:

1. **Raw-технический вид** — прямое редактирование всех полей/JSON-подобной структуры для диагностики.
2. **Универсальный табличный вид** — текущий `DefaultSystemSheet`: колонки из `columns.json`, база/overrides, профиль миниатюры.
3. **Кастомный системно-адаптированный вид** — отдельные шаблоны под систему (как Foundry sheets), где UI отражает язык конкретной игры.

**Дополнение (реализовано в коде, май 2026 — см. также `Omniboard_TZ.md` §2.1.3):**

- **Глобальные шаблоны листа** (`sheet_profiles.json`, API `GET/POST …/config/sheet_profiles`): вкладки профиля включают `**stats`** и `**actions**`. Обе используют массив `**accordions[]**`: у блока есть `**name**`, `**columns**` (для stats — ключи колонок с `show_in_mini_sheet`; для actions — id макросов из `actions.json`), опционально `**display**`: `**open**` или `**accordion**`.
- **Декоративный заголовок секции** — горизонтальные линии и название; единый паттерн для сводки и действий на мини-листе. Для `accordion` сам заголовок является клик-таргетом (chevron справа), вторичная плашка с тем же названием не рисуется.
- **UX-контракт `display`:** в режиме `**open`** контент всегда виден под заголовком; в режиме `**accordion**` секция **свёрнута по умолчанию** (раньше использовался `<details open>`, что давало визуально «всегда открыт + дубль заголовка» — паттерн удалён). Состояние раскрытия — локальный React-state мини-карточки.
- **Legacy:** старый `**panel_action_keys`** на вкладке `actions` мигрирует в `accordions` при парсинге (`migrateLegacySheetTab` в `src/hooks/useSystemSheetProfiles.ts`); в payload сохранения поле вычищается (`normalizeSheetProfilesForSave`).
- **Пер-персонажное переопределение вкладки «Действия»:** у актёра `**actions_panel_override`** той же формы, что и секции шаблона; если задано — **полностью заменяет** группировку из профиля на мини-листе. PATCH на бэкенде **глубоко мержит** объект с существующим; `**null`** снимает override. На клиенте то же в `actorPatchMerge.ts`.
- **Редактор действий (`ActorActionEditor.tsx`) — три подвкладки:** «Группировка» (только редактор `actions_panel_override`), «Свои макросы» (кастомные макросы через `custom_formula` / `custom_name` в `actor.actions`), «Базовые действия» (переопределения системных макросов: `show_on_panel`, `formula_override`, `comment`). Базовая вкладка использует **draft + Apply / Discard**: правки локальны, по «Применить» уходит один сводный `PATCH` с `actions: { ...merged }`, по «Отменить» draft ресетится до текущего снимка актёра. Поля с расхождением подсвечиваются amber-рамкой и тегом «Изменено»; на ярлыке вкладки — dot-индикатор «грязно».
- **Слияние макросов:** `mergeActorActionDefs` объединяет системный `actions.json` и актёрские кастомные определения для рендера и редактора.
- **Модели Pydantic:** у `ActorActionsPanelOverride` / `ActorActionsPanelAccordion` — **before**-валидаторы, чтобы битые снимки сессии не роняли разбор `CombatSession` (в т.ч. `**columns`** как список строк).

### ~~🧊 Checkbox Groups (Action Economy)~~ → **в продукте**

Реализовано: тип `checkbox_group` в `columns.json`, UI в трекере, автосброс через `BaseInitiativeEngine._reset_actor_resources` при `turn_start`, deep-merge PATCH, логирование. См. `Omniboard_TZ.md` §2.1–2.4.

### 🧊 Иконографика колонок и индикаторов (Icons)

Назначение **векторных иконок** (Lucide, inline SVG, наборы вроде RPG Awesome) заголовкам колонок таблицы и **вместо или вместе с** цветными точками/`badge` в `checkbox_group` — визуальный язык «премиального» трекера (капли, молнии, щиты и т.д.) без потери локализации подписей.

### 🧊 Умные заметки (Smart Notes)

Для колонок `**text` / `string`**: по двойному клику — модальное окно или крупный поповер для длинных заметок; в таблице — компактная строка + полный текст в тултипе при наведении (расширение нынешнего `title` до осмысленной подсказки). *Частично в продукте:* `**TextEditorModal`** + ellipsis в ячейке; расширенный тултип / поповер — по желанию.

### 🧊 Подсказки 2.0 (Tooltips)

Переработка системы тултипов: контекстные подсказки вместо «сырых» значений — например, для пула в dot-mode `**Пул: 2 / 5**` вместо одной цифры; единый стиль для колонок, эффектов и железа.

### 🧊 Tick-Based / Countdown Initiative

Поддержка систем со стоимостью действий в инициативе (Shadowrun, Feng Shui). Ходит всегда тот, кто на первом месте. Действие вычитает очки инициативы, список пересортировывается на лету. Поддержка мгновенных реакций (Interrupts).

### 🧊 Duel Tracker (Riddle of Steel)

Специальный UI-модуль для систем с упором на пулы кубиков и дуэли (The Riddle of Steel). Визуальное противостояние двух акторов с распределением дайс-пулов на атаку/защиту и отслеживанием остатка пула на второй обмен.

### 🧊 Комментарии и Макросы (Smart Comments)

1. **Текстовое поле (Comment Field):** Широкое текстовое поле или tooltip для заметок ("У него зелье в кармане").
2. **Микро-скрипты:** Триггеры прямо в текстовых полях: `[on_turn_start: reset_reaction]`.

### 🧊 Бестиарий и Библиотека (Monster Library)

Автоматический парсинг баз данных (Open5e API, JSON дампы) и конвертация их в готовые Actor-шаблоны.

### ~~🧊 "Эксель"-формулы для статов~~ → **в продукте**

Реализовано: `StatValue`, `MechanicsManager`, `mechanics.json.formulas`, `computed_formula_id`, overrides и readonly/rollable UI в Expert Mode. См. ADR-20 и `Omniboard_TZ.md` §2.1.1–2.5.

### 🧊 Дисперсия мобов

При добавлении пачки врагов бэкенд дает им легкий разброс по HP (±20%) и индивидуально кидает инициативу.

### 🧊 Интерапты и Хотбар (Shadowrun-style)

Добавление на Хотбар быстрых действий, которые имеют `initiative_cost` и автоматически пересортировывают очередь ходов.

### ~~🧊 Player View (Второй экран)~~ → **закрыто (ADR-27 + ADR-28, май 2026)**

Реализовано: страница `/player`, лобби с бронированием, персонализированный `/ws/player` (каждый игрок видит своего актора без маскировки), `DefaultSystemSheet variant="player"` с hero-header, `usePlayerActor` hook, панель действий с GroupBy/аккордеонами, `POST /api/player/combat-report` (отчёт о бое + перезапись файлов кампании). Оставшийся icebox — полноэкранный «второй монитор» и PATCH-правка своих статов игроком.