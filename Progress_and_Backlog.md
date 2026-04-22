# Omniboard — Progress & Backlog

> Обновлено: 22.04.2026

---

## ✅ Фаза 1 — Перезапуск и инфраструктура
- [x] Перезапуск проекта на базе прототипа из Google AI Studio
- [x] Монорепо: `backend/` (FastAPI) + `src/` (React 19 + TypeScript)
- [x] `npm run dev` — параллельный запуск обоих серверов (`concurrently`)
- [x] Прокси Vite: `/api`, `/ws`, `/assets`, `/render`, `/locales` → `http://127.0.0.1`
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
- [x] Сохранение боёв: полный **`CombatSession`** (в т.ч. **`core`**, **`session`**, **`display`**, **`hardware`**)
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
- [x] ConfigModal: широкий grid-layout, Language Switcher *(далее: табы и декомпозиция — см. **Фаза 12**).*

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

## ✅ Отчет по спринту: Композитор, Графическое ядро ESP32 и «Кузница Баров» (The Bar Forge) — 07.03.2026

### 1. Ядро Рендера и Композитор (Pillow Compositor)
- **Математика и центровка:** Исправлена проблема "прилипания" текста к нижней грани полосок. Внедрены якоря Pillow (`anchor="mm"`), что решило проблему bounding box'ов для любых шрифтов.
- **Кастомные размеры слотов:** В Композиторе (`backend/compositor.py`) реализована поддержка динамических размеров (`width` и `height` в модели `DisplayField`). Текстурные рамки и нестандартные элементы интерфейса рендерятся в своих родных пропорциях без искажений.
- **Сборка сложного макета:** Композитор успешно протестирован на генерацию сложных многослойных изображений формата 172×320: корректно отрабатывают повороты текста (например, инициатива сбоку), наложение портретов, эффектов и новых текстурных шкал.
- **Отказоустойчивый пайплайн:** Движок рендера (`backend/routers/render.py`) переписан с учетом иерархии: читает `actor.layout_profile_id`, резолвит профиль из **merged** списка раскладок системы (не из стейта боя), при отсутствии мягко откатывается к `default`, гарантируя, что ESP32 всегда получит картинку и сервер не упадет с ошибкой.

### 2. Конфигуратор «Кузница Баров» (The Bar Forge)
- **Новая сущность BarProfileConfig:** Настройки внешнего вида шкал вынесены из слотов в отдельные переиспользуемые JSON-профили (Bar Profiles).
- **Полноценный CRUD для стилей:** Добавлены эндпоинты в `routers/assets.py` для управления профилями с поддержкой архитектуры Asset Override (Системные ассеты → Дефолтные).
- **Интерфейс Customizer'а:** Создана модалка `BarCustomizerModal` с CSS-превью в реальном времени, поддержкой загрузки ассетов и автоматической генерацией ID (slugify) с привязкой к локализации.

### 3. Продвинутые режимы отрисовки баров
- **Solid Mode:** Поддержка рамок (`border_width`, `border_color`), скруглений (`border_radius`) и сложных 2- и 3-точечных градиентов с настраиваемыми переходами.
- **Textured Mode (True Liquid / Колбы):** Внедрена система 4-х слоев: Подложка (`bg.png`), Жидкость (`fg.png`), Маска формы (`mask.png` для обрезки жидкости по форме колбы) и Блики/Рамка (`overlay.png` — поверх всего). Реализована асинхронно-безопасная фоновая загрузка и удаление текстур.

### 4. Иерархия наследования профилей
- **Массовое и индивидуальное назначение:** В `GroupCreateModal` можно выбрать профиль экрана, который применится ко всему отряду. В мини-чарнике (`DefaultSystemSheet.tsx`) можно переопределить профиль конкретному монстру. Истинное каскадное наследование!

### 5. Live-мониторинг в Трекере Инициативы
- В `ActorRow.tsx` обновлена логика вывода аватарок: если у актора заполнено поле Bind Miniature (`miniature_id`), система автоматически запрашивает `/api/render/{actor.id}`. Мастер видит в панели инициативы прямую трансляцию того, что сгенерировал Композитор для экрана ESP32. Инвалидация кэша изображения — **умный** query-параметр `?rev=<renderHash>` от снимка релевантных полей актора (см. **ADR-19**), без `Date.now()` на каждый кадр рендера React.

---

## ✅ Фаза 10.5 — Аппаратная прошивка ESP32-C6 и сцепка с Omniboard (28.03.2026)

Зафиксированы выполненные задачи по прошивке минек и бэкенду под HTTP-клиент ESP32 (низкая RAM, бесшовный URL там, где это критично для клиента).

- [x] **Рефакторинг прошивки ESP32-C6:** полный уход от `delay()` на конечные автоматы (`millis()`), интеграция Watchdog Timer и OTA-обновлений.
- [x] **Настройка сети:** интеграция WiFiManager с Captive Portal для настройки Wi-Fi и задания кастомного `mini_id` (с сохранением в NVS-память).
- [x] **UDP Discovery:** рассылка `{"cmd": "discover"}` и ответы по портам 8266 / 4210 для автообнаружения минек в локальной сети; на бэке: `ESPManager`, `hardware` router, диспетчер устройств в UI.
- [x] **Неблокирующий LED-движок:** режимы `static`, `blink`, `pulse`, `rainbow` для NeoPixel в зависимости от JSON-команды (вложенный объект `led` + массив `colors`).
- [x] **Оптимизация сети (бэкенд):** Uvicorn на `0.0.0.0`, целевой порт в `img_url` — стандартный HTTP (`SERVER_PORT = 80` в `esp_manager`), совместимость с HTTPClient на ESP32; Vite-прокси по-прежнему к бэку в dev.
- [x] **Оптимизация рендера (RAM на устройстве):** композитор на бэкенде — сведение в RGB, конвертация в 8-битную палитру (PNG), уменьшение размера файла для скачивания по воздуху.
- [x] **Успешный end-to-end тест:** ESP32 принимает управляющий JSON по UDP, скачивает оптимизированный PNG по HTTP и отрисовывает через PNGdec на ST7789.

**Связано в репозитории Omniboard:** `backend/services/esp_manager.py`, `backend/routers/render.py` (sanitized MAC-имя файла, static mount `/api/render/output`), привязка миньки в Expert Mode (`DefaultSystemSheet`), push на миньку только если устройство есть в списке после Discover.

---

## ✅ Фаза 10.6 — LED-профили Omnimini (данные, UI, разрешение на ESP) — 28.03.2026

### Что сделано
- [x] **Модель `LedProfile`** в `backend/models.py`: `id`, `name`, `mode`, `speed`, `brightness`, `colors` (HEX и плейсхолдеры `$ROLE_COLOR` / `$GROUP_COLOR`).
- [x] **Расширение `LayoutProfile`:** поля `led_profile_id`, `led_color_source` (`role` | `group` | `custom`), `led_custom_color` — дефолты для актора с этим профилем раскладки при синхронизации LED.
- [x] **Файл на систему:** `data/systems/{имя_системы}/led_profiles.json` — список профилей (аналогично `effects.json`).
- [x] **API:** `GET /api/systems/{name}/led_profiles` (при отсутствии файла — три встроенных пресета: static / blink / pulse с `$ROLE_COLOR`), `POST` — сохранение всего списка (`backend/routers/systems.py`, пути через `DATA_DIR`).
- [x] **Фронт:** тип `LedProfile` в `src/types.ts`, модалка `LedEffectsModal.tsx` (список + редактор + превью CSS, «Сохранить всё»), секция «Default LED» в `MiniaturesModal.tsx`, кнопка входа в профили LED из `BarCustomizerModal.tsx`, строки в `data/locales/*/core.json`.
- [x] **Разрешение перед отправкой на миниатюру:** `backend/led_resolver.py` → `resolve_led_payload(actor_id)` читает актёра, layout, `led_profiles.json`, легенду и подставляет цвета в объект `led` для прошивки.
- [x] **`announce_image_update`:** опциональный аргумент `led_payload`; если `None` — прежнее поведение (LED «выкл» / чёрный); иначе в JSON уходит разрешённый профиль (`backend/services/esp_manager.py`, вызов из `backend/routers/render.py`).
- [x] **`POST /api/combat/clear`:** при очистке боя в `sleep_all` передаются `extra_ids` привязанных минек, чтобы увести в сон и устройства вне текущего mDNS-списка (`backend/routers/combat.py`).

---

## ✅ Фаза 10.7 — Аппаратная часть: TCP, mDNS, LED-стек и прошивка (19.04.2026)

Завершён основной объём работ по надёжной связи с ESP32, неблокирующей прошивке и приоритетной подсветке.

- [x] Переход с UDP-броадкастов на TCP (HTTP) + mDNS для надёжной связи с ESP32.
- [x] Глубокий рефакторинг `LedController.cpp`: переход на неблокирующий опрос через `millis()`.
- [x] Реализация умных режимов для 1 светодиода (Sequential phases): `Cycle`, `Blink`, `Breathe`, `Pulse` (сердцебиение).
- [x] Аппаратная гамма-коррекция (`gamma32`) для точной цветопередачи.
- [x] Система динамических LED-триггеров (`led_interceptor`) для реакции на урон, изменение статов и начало хода.
- [x] Стек приоритетов LED: Триггер (time/turn) > Эффект > Базовый цвет фракции.
- [x] Единый интерфейс управления железом (`MiniaturesModal`).

*Ранний bring-up (фаза 10.5) опирался на UDP discovery и push; актуальная схема доставки команд и обнаружения — TCP (HTTP) поверх mDNS, см. ADR-15.*

### Логика управления LED-профилями

1. **Где живут данные**
   - Пресеты эффектов LED — **на уровень TTRPG-системы**, не глобально: один JSON на папку системы в `data/systems/<System>/led_profiles.json`.
   - Редактирование — в UI («Редактировать LED-профили» / модалка **LedEffectsModal**): загрузка списка с `GET`, сохранение целиком через `POST` (как список, без отдельного PATCH на один профиль).

2. **Связь с раскладкой миниатюры**
   - У каждого **`LayoutProfile`** заданы: какой **пресет LED** (`led_profile_id`), откуда брать **базовый цвет** для подстановки в плейсхолдеры (`led_color_source`), и при `custom` — **`led_custom_color`**.
   - Актор выбирает профиль раскладки через `layout_profile_id`; при генерации картинки и пуше на ESP бэкенд берёт layout именно для этого актёра (как в рендере: id профиля → `default` → первый в списке).

3. **Разрешение `resolve_led_payload(actor_id)` (бэкенд)**
   - Актор не найден → `None` → при `announce_image_update` остаётся **fallback «LED выкл»** (как раньше).
   - **Базовый цвет** (одна строка HEX для подстановки):
     - `led_color_source == "custom"` → `led_custom_color` (с запасным HEX при битом значении).
     - `"group"` → `actor.group_color`, если задан; иначе цвет роли.
     - `"role"` (по умолчанию) → цвет из **`LegendConfig`** по `actor.role` (`character` → `player`, `enemy` → `enemy`, и т.д.).
   - **Профиль LED:** по `layout.led_profile_id` ищется запись в `led_profiles.json`; если файла или id нет — **встроенный static** с одним цветом `$ROLE_COLOR`.
   - В массиве **`colors`** у пресета строки **`$ROLE_COLOR`** и **`$GROUP_COLOR`** обе заменяются на **этот же базовый цвет** (решение «источника цвета» целиком на стороне layout, чтобы поведение совпадало с выбором в UI).
   - На выходе объект в формате прошивки: `mode`, `colors` (уже без плейсхолдеров), `speed`, `brightness` (с ограничениями по диапазонам).

4. **Когда уходит на ESP**
   - После успешного рендера и копии PNG под MAC-имя, если цель в списке устройств, вызывается **`announce_image_update(..., led_payload=resolve_led_payload(actor_id))`** — на экране обновляется картинка и одновременно выставляется LED по выбранному пресету и цветовой схеме.

5. **Флаги стейта**
   - В **`CombatSession.hardware.sync_led_to_ui`** — глобальный переключатель идеи «тащить LED из UI»; текущая реализация опирается на **layout + led_profiles + легенду** при пуше картинки. Расширение до полного «живого» зеркалирования всех событий UI — отдельная задача в беклоге при необходимости.

---

## ✅ Фаза 11 — Движки Систем (Modular Engines)

- [x] Создан Core SDK: абстрактный класс `BaseInitiativeEngine` с поддержкой проходов (`passes`) и фаз.
- [x] Реализован `StandardInitiativeEngine` (классическая убывающая очередь с поддержкой simultaneous-групп).
- [x] Реализован `PopcornInitiativeEngine` (нарративная передача хода по клику, авто-смена раунда при завершении круга).
- [x] Реализован `PhaseInitiativeEngine` (гибрид попкорна и классики: клики разрешены только по акторам в наивысшей активной фазе).
- [x] Реализован Диспетчер движков (`backend/engines/manager.py`), переключающий логику на лету через `engine_type`.
- [x] На фронтенде (Тулбар) выведена кнопка `Manual Mode` (Ручной режим — ADR-14) для перехвата управления Мастером.
- [x] Интерактивный UI таблицы: умное затенение `has_acted`, скрытие колонки инициативы для Popcorn, передача хода кликом по строке.

---

## ✅ Фаза 11.5 — Экономика действий (Action Economy) и синхронизация стейта — 21.04.2026

- [x] **Тип колонки `checkbox_group`:** `items[]` (`id`, `label`, `color`), `reset_policy`, `display_style` (`badge` | `dot`), конфиг в `ConfigModal`, сохранение в `columns.json`.
- [x] **Трекер:** компонент **`CheckboxGroupCell`** (бейджи и точки; в **`dot`** — последовательный пул слева направо); текстовые колонки **`text` / `string`** в таблице (`InlineInput` без принудительного `parseInt`); защита от `[object Object]` при смене типа колонки; `stopPropagation` / **`onDoubleClick`** на группе, чтобы не открывать мини-чарник случайно.
- [x] **Бэкенд:** `_reset_actor_resources` + `_apply_turn_start_checkbox_resets` в движках при **`turn_start`**; deep-merge **`stats`** в `PATCH /api/actors/{id}`; обновление локалей при переименовании колонок (`save_system_columns`).
- [x] **Клиент — гонки WebSocket vs PATCH:** модуль **`actorPatchMerge`** (`pendingByActorId`) + обёртка **`setCombatState`** в **`useCombatState`**; **Anti-Stuck Timeout (3 s)** для локальных **`overrides`** в **`CheckboxGroupCell`**.
- [x] **Лог боя:** вложенные изменения **`checkbox_group`** (по слотам) и **`text` / `string`**; поле **`details.message`** + цвет колонки; markdown-строка в **`logger.py`**.

---

## ✅ Фаза 11.8 — Декомпозиция стейта боя, Asset Override (JSON-merge), системные layouts и глобальные миньки — 21.04.2026

Архитектурная чистка: вложенный **`CombatSession`**, вынесение списков раскладок из живого стейта, единый слой merge для конфигов.

- [x] **`CombatSession`** в `backend/models.py`: **`CombatSession.core`**, **`display`**, **`hardware`**, **`session`**; **`DisplayState`** без **`layout_profiles`** (только **`selected_layout_id`** и флаги стола/легенды); **`SessionMeta`** включает **`history_stack`** / **`history_index`** (undo/redo изолированы в домене сессии).
- [x] Совместимость: **`CombatSession.model_validate`** принимает вложенный JSON и плоский legacy; адаптеры **`combat_session_to_combat_state`** / **`combat_session_merged_with_combat_state`** для движков инициативы.
- [x] Автосейв и старт: **`backend/state.py`** — **`CombatSession`**, **`data/state_autosave.json`**.
- [x] **`backend/utils/config_loader.py`**: **`load_config_with_override`** — merge списков по **`id`**, deep-merge объектов; база **`data/assets/default/config/`**, оверрайд **`data/systems/<name>/`** для **`layout_profiles.json`**, **`bars_config.json`**, **`led_profiles.json`**.
- [x] API: **`GET` / **`POST /api/systems/{name}/layouts`**; глобальные миньки — **`/api/hardware/miniatures`** (список **`GET`**, замена всего списка **`PUT`**, точечно **`POST`**, **`PATCH /{id}`**, **`DELETE /{id}`**) + **`data/miniatures.json`** (**`MiniatureEntry`**: **`id`**, **`mac`**, **`name`**, **`notes`**).
- [x] Рендер: профили раскладок из store/merge; композитор избегает гибридных текстурных баров при неполном пакете системы.
- [x] Фронт: типы и **`useCombatState`** / контексты согласованы с вложенным стейтом; при смене системы сброс кэша списка раскладок до загрузки нового.

---

## ✅ Фаза 12 — ConfigModal, i18n настроек, таблица и редактор текста (22.04.2026)

- [x] **ConfigModal:** разбиение на **табы** (System / Columns / Table / Language), вынесение в `src/components/Modals/ConfigTabs/*`; общие PATCH-обёртки (`usePatchCombatSettings`, `usePatchLegend`) и стабильные колбэки.
- [x] **i18n (основная часть UI настроек):** исправлен конфликт в `core.json` (корневая строка `"config"` заменена на объект `config.columns` / `config.table` для ключей `t('config.*')`); кнопка настроек в шапке — `header.config`; дополнены ключи `config_modal.*`, `modals.config`, `text_editor.title`, `common.selected`, `common.empty_dash` и синхронизация локалей (en / ru / je / ger).
- [x] **Sticky columns:** флаги `sticky_first_column` / `sticky_last_column` в стейте, UI в **TableTab**, `sticky` + тени в **InitiativeTable** / **ActorRow** (портрет слева, действия справа).
- [x] **UI раундов (Shield Maiden):** крупная плашка раунда в **AppHeader** в едином стиле с остальной шапкой.
- [x] **TextEditorModal:** редактирование длинных значений колонок **`text` / `string`** по двойному клику в трекере; компактная ячейка с ellipsis + опциональный native tooltip.

---

## 🎯 ПЛАН НА СЛЕДУЮЩИЙ СПРИНТ

### Фаза 10 — The Compositor & Live Preview (выполнено)
- [x] **`compositor.py`:** Python (Pillow) — послойная сборка рендера 172×320 с альфа-каналом (Портрет → Эффекты → Рамка → UI overlay), экспорт PNG + палитра для минек.
- [x] **Render API:** Эндпоинт `GET /api/render/{actor_id}` для отдачи склеенного изображения (PNG); раздача файлов для ESP по `/api/render/output/{filename}`.
- [x] **Live Preview:** Предпросмотр экрана 172×320 в модалке настройки раскладки миниатюр (MiniaturesModal), выбор актора и профиля, тестовые эффекты.
- [x] **ESP32 по сети:** push команд и картинки по TCP (HTTP) + mDNS; см. Фазы 10.5–10.7 и ADR-15.

### Следующий фокус (см. беклог)
**Экономика действий** (Фаза 11.5), **архитектурная декомпозиция стейта** (Фаза 11.8) и **UI настроек / таблица / i18n конфига** (Фаза 12) закрыты. **Текущая фаза: Phase 13 — Dice Engine** (модульные броски, интеграция с треком и логом). Плагин `logic.py` на уровне системы (ADR-12) остаётся в дорожной карте для кастомных правил.

---

## 🐛 Активные баги

*Все известные баги исправлены!* 🎉

---

## 📋 Беклог

**Активные задачи (текущий спринт):**
- [ ] **Dice Engine:** модульная система бросков кубиков (d20, пулы, успехи), интеграция с трекером и логом.

### 🔧 Рефакторинг (приоритет перед новыми фичами)
- [x] **ConfigModal:** разбиение на **табы** (система / колонки / таблица / язык) и декомпозиция — см. Фаза 12.
- [x] Полная миграция UI-строк на i18n для зоны настроек и таблицы (основная часть); точечный хвост хардкода / `defaultValue` в других модалках — по мере обнаружения.

### ✨ Новые фичи
- [ ] **Hotbar**: UI для `HotbarAction` (быстрые атаки, заклинания)
- [ ] **Reactions**: UI для `active_reaction_actor_id` (отслеживание реакций)
- [x] **Sticky Columns:** фиксация первой/последней колонки при горизонтальной прокрутке широкой таблицы — см. Фаза 12.
- [x] **Улучшенный UI Раундов:** крупная плашка раунда в **AppHeader** (стиль Shield Maiden); опционально позже — framer-motion и дублирование в тулбаре.

### 🔩 Аппаратная часть (основной объём ✅ — см. Фазы 10.5–10.7)
- [x] ESP32-C6: конечные автоматы, WiFiManager, OTA; связь и push — **TCP (HTTP) + mDNS**, неблокирующий LED, гамма, триггеры и стек приоритетов (фазы 10.5–10.7).
- [x] Подключение по Wi-Fi с Captive Portal; Bluetooth — при необходимости отдельным спринтом.
- [x] LED: `LayoutProfile` + `led_profiles.json` + легенда + `led_interceptor` + стек приоритетов (`resolve_led_payload`, триггеры `time`/`turn`).
- [ ] Расширенная синхронизация LED (`sync_led_to_ui`): помимо пуша при рендере — например, обновление LED при смене хода/HP без перерисовки экрана (отдельные вызовы `send_update` по правилам UI).

