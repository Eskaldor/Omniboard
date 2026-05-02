# Omniboard — План рефакторинга

> Создан: 01.03.2026 · Обновлено: 02.05.2026  
> Статус: Активный план работ (P0 по стейту/роутерам закрыт — см. **«Выполнено»**)

---

## Выполнено

### P0-1: Автосохранение сессии боя
- Реализовано в **`backend/state.py`**: глобальный **`CombatSession`**, **`load_state()`** / **`save_state_async()`**, путь **`data/state_autosave.json`**, уважение к **`session.autosave_enabled`**.

### P0-2: Разбивка `backend/main.py`
- Точка входа **`backend/main.py`** — инициализация приложения и подключение роутеров; логика разнесена по **`backend/routers/`** (`combat`, `systems`, `hardware`, `assets`, `encounters`, `render`, `logs`, …), сервисы в **`backend/services/`**.

### Декомпозиция стейта (ADR-18)
- В **`backend/models.py`**: **`CombatSession`** (**`core: CombatCore`**, **`display: DisplayState`**, **`hardware: HardwareState`**, **`session: SessionMeta`**), legacy-валидация, адаптеры к плоскому **`CombatState`** для движков.
- **`history_stack`** / **`history_index`** перенесены в **`SessionMeta`** (единая модель сессии вместо разнесения по «двум историям» без структуры).
- Профили раскладок мини-экрана **не** хранятся в **`DisplayState`**; загрузка через **`load_config_with_override`** и API **`/api/systems/{name}/layouts`**; глобальные миньки — **`/api/hardware/miniatures`** и **`data/miniatures.json`**.

### Линия инициативы для аппаратных миниатюр (26.04.2026)
- **`MiniatureEntry`** расширен режимами привязки: **`binding_mode`** (`actor` / `slot`), **`slot_index`** как offset от текущего хода, **`slot_led_mode`** (`actor` / `custom`) и **`slot_led_profile_id`** для LED-переопределения слота.
- **`HardwareState` public payload** теперь содержит производный список **`hardware.miniatures`**: сохранённые записи из `data/miniatures.json` + текущие mDNS-устройства (`ip`, `status`, `last_seen`) без переноса этого runtime-среза в autosave.
- **`HardwareModal`** стал единым диспетчером железа: таблица устройств, режим привязки, назначение актора/позиции очереди, LED-профиль слота, Blink/Forget и row-level loading. **`MiniaturesModal`** оставлена отдельно как редактор **вида/лейаута** экранов.
- **`ESPManager.refresh_initiative_line`** пересчитывает slot-миниатюры после смены очереди/хода и пушит только изменившиеся цели; переход экрана задаётся правилом **`initiative_shift`** в `data/systems/<system>/led_triggers.json` (**`find_hardware_trigger`**, без хардкода **`wipe_right`**). HTTP timeout для ESP `/update` поднят до **20 s** из-за синхронных анимаций прошивки.
- См. также **Фаза 10.8** в **`Progress_and_Backlog.md`**: глобальная яркость экрана (**1–100 %**), **`PATCH /api/combat/settings`**, явная валидация **`POST .../led_triggers`**.

### Безопасность данных и жизненный цикл боя (май 2026)
- Безопасность данных и жизненный цикл боя: внедрена State Machine для тулбара, исправлены гонки потоков при записи логов (ADR-21), очистка стола стала полностью обратимой (Undo) с сохранением закрепленных акторов и их бесконечных эффектов.

---

## Приоритеты рефакторинга (по убыванию важности)

### 🔥 P0 — Критические (делаем первыми)

#### ~~1. Автосохранение CombatState~~ → **выполнено** (см. «Выполнено», P0-1; тип — **`CombatSession`**)

#### ~~2. Разбивка `backend/main.py`~~ → **выполнено** (см. «Выполнено», P0-2)

---

#### 3. Разбивка `src/App.tsx` (~40 KB)
**Проблема:** Один компонент со всей логикой: WebSocket, состояние, CRUD, UI. Невозможно тестировать, любое изменение перерендеривает всё, Cursor ломает рабочий код.  
**Решение:** Custom hooks + компоненты.

**Целевая структура:**
```
src/
├── App.tsx                     # ~100 строк: layout + routing + context provider
├── hooks/
│   ├── useCombatState.ts       # WebSocket + global state
│   ├── useActors.ts            # CRUD акторов (add, update, delete)
│   ├── useEncounters.ts        # save/load encounter
│   ├── useSystems.ts           # загрузка systems/effects/columns
│   └── useUndo.ts              # undo/redo logic
├── components/
│   ├── InitiativeTracker/
│   │   ├── InitiativeTable.tsx # таблица с акторами
│   │   └── ActorRow.tsx        # одна строка таблицы
│   ├── ActorModal/             # модалка создания/редактирования актора
│   ├── ConfigModal/            # (уже есть?)
│   ├── EncountersModal/        # save/load UI
│   ├── RosterModal/            # библиотека сохранённых акторов
│   ├── LogPanel/               # лог боя
│   └── Toolbar/                # верхняя панель с кнопками
└── contexts/
    └── CombatContext.tsx       # React Context для глобального state
```

**Сложность:** Высокая, ~5-8 часов.  
**Порядок разбивки:**
1. Вынести WebSocket в `useCombatState` hook
2. Создать `CombatContext` и обернуть `<App />`
3. По одному компоненту выносить из `App.tsx` (начать с `Toolbar`, затем `InitiativeTable`)
4. Каждый шаг коммитить отдельно

---

### 🟡 P1 — Важные (после P0)

#### 4. Автогенерация TypeScript-типов из Pydantic
**Проблема:** `src/types.ts` дублирует `backend/models.py` вручную. Рассинхронизация приведёт к runtime-ошибкам.  
**Решение:** `openapi-typescript` — генерирует типы из FastAPI OpenAPI-схемы.

```bash
npm install --save-dev openapi-typescript
# В package.json scripts:
"generate-types": "openapi-typescript http://localhost/openapi.json -o src/types/api.ts"
```

**Запускать:** После изменения моделей на бэке. Можно автоматизировать в `predev` hook.

#### 5. Обработка ошибок API на фронте
**Проблема:** Большинство `fetch` вызовов не обрабатывают ошибки. Мастер нажимает кнопку — ничего не происходит, никакой индикации.  
**Решение:** Обёртка над `fetch` с toast-уведомлениями (например, `react-hot-toast`).

```typescript
// src/utils/api.ts
export async function apiCall<T>(url: string, options?: RequestInit): Promise<T> {
  try {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    toast.error(`API error: ${err.message}`);
    throw err;
  }
}
```

#### 6. WebSocket reconnect-логика
**Проблема:** Потеря соединения (спящий режим ноутбука) не восстанавливается автоматически.  
**Решение:** Добавить в `useCombatState.ts` reconnect с exponential backoff.

#### 7. Масштабирование proactive render / ESP push до 20 миниатюр
**Проблема:** При 10-20 online ESP32 один ход может породить бурст CPU-рендера, дисковых операций и HTTP `/update`. UI уже не должен ждать эти side effects (см. ADR-21), но без ограничений фоновые задачи могут забить threadpool, Wi-Fi или сам event loop косвенной нагрузкой.

**Предлагаемый план:**
1. **Bounded render concurrency:** добавить общий `asyncio.Semaphore(2..4)` вокруг `asyncio.to_thread(render_miniature, ...)`, чтобы 20 рендеров не заняли весь threadpool/CPU одновременно.
2. **Bounded ESP concurrency:** добавить semaphore на ESP `/update` (ориентир 4..6 одновременных запросов), чтобы не создавать сетевой шторм на роутере и ESP32.
3. **Shared HTTP client for image announce:** не создавать новый `httpx.AsyncClient` в каждом `announce_image_update`; использовать общий клиент с firmware-aware timeout (сейчас принят ориентир **20 s** для экранных transition) и `Limits(max_connections=...)`.
4. **Latest-wins render queue:** оформить coalescing по `actor_id` как явную очередь сервиса: если актор обновился 10 раз за секунду, рендерится только последнее состояние.
5. **Priority lanes:** LED/turn feedback — быстрый lane; full PNG render/push — low-priority lane с debounce. На смене хода мастер должен сразу видеть UI, железо может догонять.
6. **Timing logs / metrics:** логировать длительность `next_turn`, `broadcast_state`, `render_miniature`, atomic copy, ESP `/update`; без этого деградация на 20 миниатюрах будет плохо диагностироваться.

**Критерий готовности:** при 20 привязанных online-миниатюрах `/api/combat/next-turn` отдаёт HTTP-ответ и WS-обновление без заметного UI лага, а фоновые render/ESP задачи завершаются best-effort без накопления бесконечной очереди.

---

### 🟢 P2 — Улучшения (можно отложить)

#### 8. Миграция UI-строк на i18n
**Статус:** основной блок настроек и таблицы уже переведён (**Фаза 12** в `Progress_and_Backlog.md`); полная разбивка `App.tsx` (п.3) к этому **не была** обязательным prerequisite.  
**Дальше:** при создании новых компонентов сразу добавлять `useTranslation`; точечный хардкод / `defaultValue` в старых модалках убирать по мере обнаружения.

#### 9. Чистка зависимостей `package.json`
**Сделано:** нет `express` / `better-sqlite3` в dependencies; **`name`** — **`omniboard`**; **`package-lock.json`** в **`.gitignore`**.  
**Опционально:** удалить **`@types/express`** из devDependencies, если типы Express больше не нужны ни для чего в проекте.

---

## Декомпозиция `CombatState` (God Object → доменные суб-модели, Pydantic v2)

**Статус:** первый этап **выполнен** — корневая модель **`CombatSession`**, см. **«Выполнено»** и ADR-18 в `Architecture_Decisions_and_Icebox.md`. Ниже — зафиксированный дизайн и **оставшаяся** оптимизация (WS-патчи по доменам).

### Проблема (было)

Ранее плоский **`CombatState`** смешивал механику боя, отображение, железо и сессионные метаданные; стек undo жил отдельно от Pydantic-модели.

**Что остаётся улучшать:**

1. **WebSocket:** при любом изменении клиент по-прежнему может получать полный снимок → следующий шаг — инкрементальные патчи по доменам (`core` / `display` / …).
2. **React:** селекторы/мемоизация по веткам **`CombatSession`** — довести до конца там, где ещё держится плоский merge.
3. **Кэширование:** списки **`LayoutProfile`** и глобальные миньки уже вынесены из стейта боя; дальнейшее версионирование схемы — по полю **`schema_version`** при необходимости.

---

### Целевая структура данных (черновик имён полей)

Все четыре блока — отдельные **`BaseModel`**. Корневой контейнер **`CombatSession`** собирает их в одно дерево для **`model_dump()`** (autosave / encounter); **сериализация для WS/API** в перспективе — только изменённые поддеревья.

#### `CombatCore` — «чистая боёвка»

Отвечает за правила очереди и содержимое боя, без визуальных пресетов и без лога.

| Назначение | Примеры полей (из текущего стейта) |
|------------|-----------------------------------|
| Участники и очередь | `actors`, `turn_queue`, `current_index`, `current_pass` |
| Фаза боя | `round`, `is_active` |
| Движок и ручной режим | `engine_type`, `is_manual_mode` |
| Контекст системы | `system` (активная TTRPG-система для правил/колонок) |
| Тактика (по желанию в core) | `active_reaction_actor_id` |

**Инвариант:** изменения здесь должны триггерить пересчёт инициативы, валидацию движка и push на ESP только там, где это следует из события (не от каждого движения легенды).

#### `DisplayState` — визуал стола и легенды

| Назначение | Примеры полей |
|------------|---------------|
| Выбранный профиль раскладки мини-экрана | **`selected_layout_id`** (список **`LayoutProfile`** — в файлах + API системы, не в стейте) |
| Цвета ролей | **`legend`** |
| Флаги таблицы | **`show_group_colors`**, **`show_faction_colors`**, **`table_centered`**, **`sticky_first_column`**, **`sticky_last_column`** |

**Инвариант:** правки здесь **не** меняют HP, очередь и статистику боя; фронт может подписаться на отдельный срез и обновлять только шапку/легенду/обёртку таблицы.

#### `HardwareState` — железо и синхронизация с миньками

Глобальные и сессионные флаги, не относящиеся к правилам боя, но влияющие на push к ESP и на UI привязки.

| Назначение | Примеры полей |
|------------|---------------|
| Политика LED от UI | `sync_led_to_ui` |
| Яркость экрана минек | **`screen_brightness`** (1–100 %, см. Фаза 10.8 Progress) |
| (Расширение) срез статусов устройств | производный **`hardware.miniatures`** + кэш «последний успешный push», версия прошивки — *по мере появления API* |

**Примечание:** поля **`miniature_id`**, **`layout_profile_id`** сейчас живут на **`Actor`** — это нормально; при необходимости для WS можно отдавать **производный** `HardwareState` или отдельное сообщение «только привязки», не дублируя весь `CombatCore`. Цель разделения — не обязательно физически перенести каждое поле, а **группировать контракты обновлений**.

#### `SessionMeta` — лог, undo/redo, сервисные настройки

| Назначение | Примеры полей / источников |
|------------|----------------------------|
| Нарративный лог | `history: List[LogEntry]`, `history_cursor` |
| Технический стек снимков | **`history_stack`**, **`history_index`** — единая точка правды для ADR-3 внутри сессии (глобальный объект по-прежнему в `backend/state.py`, но поля — в **`SessionMeta`**) |
| Логирование и автосохранение | `enable_logging`, `autosave_enabled` |

**Инвариант:** массовые правки `CombatCore` не должны по умолчанию перезаписывать мета-настройки; undo по-прежнему делает полный снимок агрегата, но внутри снимка структура уже секционирована.

---

### Маппинг: текущий `CombatState` → домены

| Текущее поле | Домен |
|--------------|--------|
| `actors`, `turn_queue`, `current_index`, `current_pass`, `round`, `is_manual_mode`, `engine_type`, `system`, `is_active`, `active_reaction_actor_id` | `CombatCore` |
| `selected_layout_id`, `legend`, `show_group_colors`, `show_faction_colors`, `table_centered`, `sticky_first_column`, `sticky_last_column` | `DisplayState` (legacy-ключи `layout_profiles` / `layout` отбрасываются валидатором) |
| `sync_led_to_ui`, `screen_brightness` | `HardwareState` |
| Производный список устройств (`miniatures`, `ip`, `status`, `last_seen`) | `HardwareState` public payload; источник — `data/miniatures.json` + mDNS, не обязательный autosave-контракт |
| `history`, `history_cursor`, `enable_logging`, `autosave_enabled` | `SessionMeta` |
| `history_stack`, `history_index` | **`SessionMeta`** (в `state.py` остаётся только глобальный экземпляр **`CombatSession`**) |

Корневой тип может выглядеть так (псевдокод):

```python
class CombatSession(BaseModel):
    core: CombatCore
    display: DisplayState
    hardware: HardwareState
    session: SessionMeta

    # model_validator(mode="before"): принять legacy-плоский dict и разложить по доменам
```

---

### WebSocket и API

1. **Фаза совместимости:** сервер по-прежнему отдаёт один JSON, собранный из четырёх частей (`model_dump()` корня), чтобы не ломать текущий фронт.
2. **Фаза оптимизации:** ввести в payload поле вроде `changed: Literal["core","display","hardware","session","full"]` или **раздельные сообщения** по каналам; клиент мержит только нужную ветку в React state (отдельные контексты или селекторы).
3. **`GET /api/combat/state`:** опционально query-параметр `?sections=core,display` для тяжёлых клиентов (если понадобится).

---

### Фронтенд (React)

- Разнести контекст или состояние на **`core` / `display` / `hardware` / `session`** (или мемоизированные селекторы из одного стора с shallow compare по путям).
- Подписка на WS: при патче только `display` не трогать список акторов и **InitiativeTable** (снижение лишних рендеров — прямой ответ на цель задачи).
- Типы: после стабилизации схемы — связка с п. **«Автогенерация TypeScript из OpenAPI»** (существующий P1 в этом документе).

---

### Этапы внедрения (рекомендуемый порядок)

1. ~~**Модели без поведения:**~~ введены **`CombatCore`**, **`DisplayState`**, **`HardwareState`**, **`SessionMeta`**, **`CombatSession`**; legacy через **`model_validate`**.
2. **Внутренний рефактор:** по мере правок — меньше плоских обращений, больше явных путей **`state.core.*`** / **`state.display.*`** на бэке и фронте.
3. ~~**Объединить undo-стек**~~ — стек в **`SessionMeta`**; граница снимка = весь **`CombatSession`** при undo/redo.
4. ~~**Autosave / encounters:**~~ корневой JSON **`CombatSession`**; при необходимости — поле **`schema_version`**.
5. **WS оптимизация:** только после стабильной композиции на бэке (текущий клиент — полный снимок).

### Риски

- **Миграция JSON:** старые энкаунтеры и autosave; обязателен `model_validator` и однократная миграция при `load_state`.
- **Дублирование ссылок:** `Actor` остаётся частью `CombatCore`; не плодить второй список акторов в другом домене.
- **Согласованность транзакций:** одна операция «следующий ход» может трогать и `core`, и `session` (лог); клиент должен получать согласованный снимок или одно сообщение с несколькими секциями.

---

## 🐛 Известные баги и исторический трекинг

Сводка синхронизирована с аудитом документации (**02.05.2026**) и с тем, что зафиксировано в **`Progress_and_Backlog.md`** («активные баги» там помечены закрытыми — ниже указано, какие пункты этого файла всё ещё полезны как чеклист).

### BUG-1: Stat Groups — разъезжание заголовков столбцов
**Скриншот:** [Прикреплён в issue]  
**Описание:** Заголовки столбцов (HP, AC, Speed, mana) не совпадают с полями в строках таблицы. Заголовки живут в отдельном `<div>`, поля внутри акторов — в другом. Tailwind grid/flexbox с разной шириной из-за контента.

**Причина:** Скорее всего используется два отдельных контейнера:
```tsx
<div className="grid grid-cols-[auto_1fr_100px_100px_100px_100px]"> {/* заголовки */}
  <div>Init</div><div>Name</div><div>HP</div>...
</div>
<div> {/* строки акторов */}
  {actors.map(a => <ActorRow ... />)} {/* внутри своя сетка */}
</div>
```

**Решение:**  
Опция 1 (простая): Единая таблица `<table>` с `<thead>` и `<tbody>`, CSS Grid для колонок внутри `<td>`.  
Опция 2 (сложная): Синхронизировать ширину через JavaScript `ResizeObserver` (overkill).  
Опция 3 (средняя): Фиксированные ширины для всех stat-колонок через Tailwind classes (например `w-24`), чтобы они совпадали в заголовке и строках.

**Где искать:** `src/components/InitiativeTracker/` (`InitiativeTable`, заголовки колонок).  
**Приоритет:** P1 (UX). **Статус:** не закрыт явным пунктом в Progress — верифицировать при следующем проходе по таблице.

---

### BUG-2: Мерцание столбцов при смене раунда
**Описание:** При вызове `POST /api/combat/next-turn` (смена хода/раунда) столбцы справа (stat groups) и столбец Effects мерцают (flickering) — видимо перерисовываются полностью.  
**Причина:** Скорее всего вся таблица перерендеривается из-за изменения `state.round` или `state.current_index` в WebSocket update. React перестраивает весь список акторов вместо обновления только текущей строки.

**Решение:**
1. `React.memo` на компонент `<ActorRow>` с правильным `areEqual` comparator — перерисовывать только если изменился конкретный актор.
2. Проверить что у каждого `<ActorRow key={actor.id}>` стабильный `key` (не индекс!).
3. Если используется CSS-анимация — она может триггериться при любом изменении DOM.

**Где искать:** `InitiativeTable`, `ActorRow`, контексты состояния боя.  
**Приоритет:** было P1. **Статус (02.05.2026):** в Progress указано как исправленное (**BUG-2**, мemoization / стабильные ключи); описание ниже сохранено для регрессионной диагностики.

---

### ~~BUG-3~~ — мусорные зависимости `package.json`
**Было:** `express`, `better-sqlite3` из шаблона.  
**Сейчас:** в **`dependencies`** этих пакетов **нет**. Задача закрыта.

---

### ~~BUG-4~~ — `package-lock.json` в репозитории
**Сейчас:** **`package-lock.json`** перечислен в **`.gitignore`**; ориентация репозитория — не коммитить lockfile. Задача по политике закрыта.

---

### ~~BUG-5~~ — имя пакета
**Сейчас:** в **`package.json`** указано **`"name": "omniboard"`**. Задача закрыта.

---

## 💡 Архитектурные проблемы (для будущего)

### 1. Нет валидации входящих данных на бэке
`PATCH /api/actors/{id}` принимает `updates: dict` — любой JSON проходит до момента `Actor(**actor_dict)`. Риск: крэш при невалидных данных или path traversal через имена файлов.

**Решение:** Создать Pydantic-модели для всех request body (например `ActorUpdateRequest`).

### 2. WebSocket без heartbeat и авторизации
`/ws/master` — один канал без пингов, без reconnect на клиенте. Потеря соединения не детектируется.  
**Решение:** Добавить `ping/pong` каждые 30 секунд, на клиенте — reconnect с exponential backoff.

### 3. ESP32 JSON-конфиг для миниатюр (задел на будущее)
**Описание:** Глобальный реестр — **`data/miniatures.json`** (**`MiniatureEntry`**); отдельные файлы `data/miniatures/{id}.json` в продукте не используются. При желании расширить пер-устройочный конфиг — отдельное решение.  
**Исторически обсуждалось:**
- Формат конфига: `{ "actor_id": "...", "wifi_ssid": "...", "display_mode": "..." }`
- Где хранить: `data/miniatures/` или в самой прошивке ESP32?
- Как регистрировать: QR-код с `miniature_id` при первом подключении?

**Приоритет:** низкий / по необходимости (базовый сценарий уже покрыт `miniatures.json` и прошивкой).

---

## Порядок выполнения (рекомендуемый)

1. ✅ **Обновить документацию** (актуализировать при изменении архитектуры)
2. ✅ ~~**BUG-3, BUG-4, BUG-5**~~ — закрыты (см. выше)
3. ✅ **P0-1: Автосохранение** — **`CombatSession`** в **`state.py`**
4. 🔥 **P0-3: Разбивка App.tsx** → пошаговый рефакторинг с коммитами (hooks **`useActors` / `useEncounters` / …** из целевой структуры пока **не** заведены — см. **`src/hooks/`**)
5. 🐛 **BUG-1** — UX-проход по выравниванию колонок; **BUG-2** считать закрытым, пока нет регресса (см. Progress)
6. ✅ **P0-2: Разбивка main.py** — роутеры в **`backend/routers/`**
7. 🟡 **P1: API errors, reconnect, typegen** → по мере необходимости
8. ✅ **Декомпозиция `CombatSession`** (фаза 1) — модели + адаптеры + вынесение layouts/miniatures; **дальше:** WS-патчи по доменам (см. раздел «Декомпозиция CombatState»)
9. 🟢 **P2: хвост i18n** → новые компоненты сразу с `useTranslation`; старые модалки точечно

---

## Текущий статус

- [x] Документация актуализирована (в т.ч. сверка с кодом — май 2026)
- [x] P0-1, P0-2 и декомпозиция стейта (ADR-18, фаза 1) выполнены
- [x] Линия инициативы и единый диспетчер железа реализованы (см. Progress Фазы 13.6 и 10.8)
- [ ] План согласован с Nevrar (при необходимости — уточнение следующих приоритетов)
- [x] Начало рефакторинга (архитектура бэкенда и стейта); **P0-3 (разбивка App.tsx)** остаётся открытым
