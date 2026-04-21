# Omniboard — План рефакторинга

> Создан: 01.03.2026 · Обновлено: 21.04.2026  
> Статус: Активный план работ

---

## Приоритеты рефакторинга (по убыванию важности)

### 🔥 P0 — Критические (делаем первыми)

#### 1. Автосохранение CombatState
**Проблема:** Глобальный `state` в RAM умирает при перезапуске uvicorn (reload, краш, закрытие терминала). Мастер теряет весь бой если не успел вручную сохранить Encounter.  
**Решение:** Автосохранение `state.model_dump()` в `data/state_autosave.json` при каждом `broadcast_state()`. Загрузка при старте если файл существует.  
**Сложность:** ~30 строк кода  
**Файлы:** `backend/main.py`

```python
# backend/state.py (новый файл)
from pathlib import Path
import json
from backend.models import CombatState

AUTOSAVE_PATH = Path("data/state_autosave.json")

def load_state() -> CombatState:
    if AUTOSAVE_PATH.exists():
        try:
            data = json.loads(AUTOSAVE_PATH.read_text())
            return CombatState(**data)
        except Exception:
            pass
    return CombatState()

def save_state_sync(state: CombatState):
    """Синхронное сохранение для быстрого вызова"""
    AUTOSAVE_PATH.write_text(state.model_dump_json(indent=2))
```

**Вызывать:** После каждого `await broadcast_state()` добавить `save_state_sync(state)` (синхронно, т.к. async I/O для одного файла излишен).

---

#### 2. Разбивка `backend/main.py` (31 KB)
**Проблема:** Всё в одном файле: роуты, бизнес-логика, WebSocket, файловая работа, логгер. Cursor путается в контексте 800+ строк, ломает соседний код при добавлении новых фич.  
**Решение:** Разбить по модулям FastAPI Router.

**Целевая структура:**
```
backend/
├── main.py               # ~50 строк: app init + middleware + include routers
├── models.py             # Pydantic (без изменений)
├── compositor.py         # рендер (без изменений)
├── state.py              # глобальный state + autosave + broadcast_state
├── routers/
│   ├── __init__.py
│   ├── combat.py         # /api/combat/* (start, end, next-turn, undo/redo, load, reset)
│   ├── actors.py         # /api/actors/* (POST, PATCH, DELETE)
│   ├── systems.py        # /api/systems/* (list, effects, columns, actors/roster)
│   ├── encounters.py     # /api/encounters/* (save, list, get, delete)
│   ├── assets.py         # /api/assets/* (upload, list, delete)
│   └── logs.py           # /api/combat/log/*, /api/logs/open_folder
└── services/
    └── logger.py         # add_log() + background file writer
```

**Сложность:** Средняя, ~2-3 часа ручной работы (AI тут сложно помочь из-за большого контекста).  
**Зависимости:** Автосохранение (п.1) лучше сделать до разбивки, чтобы `state.py` сразу был готов.

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

---

### 🟢 P2 — Улучшения (можно отложить)

#### 7. Миграция UI-строк на i18n
**Зависимость:** Только после разбивки `App.tsx` (п.3)!  
**Порядок:** При создании каждого нового компонента сразу добавлять `useTranslation` и выносить строки в `data/locales/ru/core.json`.

#### 8. Чистка зависимостей `package.json`
**BUG-3, BUG-4:** Удалить `express`, `better-sqlite3`, добавить `package-lock.json` в `.gitignore`, переименовать `name` → `"omniboard"`.  
**Сложность:** 2 минуты, можно сделать руками прямо сейчас.

---

## Декомпозиция `CombatState` (God Object → доменные суб-модели, Pydantic v2)

### Проблема

Сейчас **`CombatState`** (`backend/models.py`) — монолит: в одном JSON живут и чистая боевая механика, и настройки отображения стола, и флаги вокруг железа/LED, и нарративный лог боя плюс сервисные переключатели. Параллельно технический стек **undo/redo** хранится **вне** модели — в модуле `backend/state.py` (`history_stack`, `history_index`, см. ADR-3), хотя семантически это тоже «сессия боя».

**Последствия:**

1. **WebSocket:** при любом изменении (например, только `legend` или `table_centered`) клиент получает полный снимок боя → лишний трафик и широкий триггер ре-рендеров.
2. **React:** даже при мемоизации строк таблицы общий объект `state` меняется по ссылке целиком, что усложняет локальную оптимизацию и отладку «что именно изменилось».
3. **Сериализация / автосохранение:** encounter и autosave тащат всё сразу; нет явного разделения «что обязано версионироваться вместе с боем» vs «что можно кэшировать отдельно».

**Цель рефакторинга:** разнести ответственность на **узкие доменные суб-модели** (композиция через Pydantic v2: вложенные `BaseModel`, при необходимости — корневой агрегат с `model_validator` для обратной совместимости), затем **типизировать полезную нагрузку WebSocket** (полный снимок на connect + инкрементальные патчи по доменам или каналам).

---

### Целевая структура данных (черновик имён полей)

Все четыре блока — отдельные **`BaseModel`**. Корневой контейнер (рабочее имя **`CombatSession`** или сохранение имени **`CombatState`** как алиаса) собирает их в одно дерево для единого `model_dump()` при миграции файлов, но **сериализация для WS/API** может отдавать только изменённые поддеревья.

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
| Профили раскладки мини-экрана | `layout_profiles` |
| Цвета ролей | `legend` |
| Флаги таблицы | `show_group_colors`, `show_faction_colors`, `table_centered` |

**Инвариант:** правки здесь **не** меняют HP, очередь и статистику боя; фронт может подписаться на отдельный срез и обновлять только шапку/легенду/обёртку таблицы.

#### `HardwareState` — железо и синхронизация с миньками

Глобальные и сессионные флаги, не относящиеся к правилам боя, но влияющие на push к ESP и на UI привязки.

| Назначение | Примеры полей |
|------------|---------------|
| Политика LED от UI | `sync_led_to_ui` |
| (Расширение) срез статусов устройств | кэш «последний успешный push», версия прошивки — *по мере появления API* |

**Примечание:** поля **`miniature_id`**, **`layout_profile_id`** сейчас живут на **`Actor`** — это нормально; при необходимости для WS можно отдавать **производный** `HardwareState` или отдельное сообщение «только привязки», не дублируя весь `CombatCore`. Цель разделения — не обязательно физически перенести каждое поле, а **группировать контракты обновлений**.

#### `SessionMeta` — лог, undo/redo, сервисные настройки

| Назначение | Примеры полей / источников |
|------------|----------------------------|
| Нарративный лог | `history: List[LogEntry]`, `history_cursor` |
| Технический стек снимков | перенос **`history_stack`**, **`history_index`** из `backend/state.py` в эту модель (или в отдельный `UndoState`, вложенный в `SessionMeta`) — единая точка правды для ADR-3 |
| Логирование и автосохранение | `enable_logging`, `autosave_enabled` |

**Инвариант:** массовые правки `CombatCore` не должны по умолчанию перезаписывать мета-настройки; undo по-прежнему делает полный снимок агрегата, но внутри снимка структура уже секционирована.

---

### Маппинг: текущий `CombatState` → домены

| Текущее поле | Домен |
|--------------|--------|
| `actors`, `turn_queue`, `current_index`, `current_pass`, `round`, `is_manual_mode`, `engine_type`, `system`, `is_active`, `active_reaction_actor_id` | `CombatCore` |
| `layout_profiles`, `legend`, `show_group_colors`, `show_faction_colors`, `table_centered` | `DisplayState` |
| `sync_led_to_ui` (+ будущие поля ESP) | `HardwareState` |
| `history`, `history_cursor`, `enable_logging`, `autosave_enabled` | `SessionMeta` |
| `history_stack`, `history_index` | сегодня в `state.py` → **`SessionMeta`** (или вложенная модель) |

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

1. **Модели без поведения:** ввести `CombatCore`, `DisplayState`, `HardwareState`, `SessionMeta` в `models.py`; добавить фабрику `combat_session_from_legacy_dict` + `to_legacy_flat_dict` для round-trip тестов.
2. **Внутренний рефактор:** постепенно перевести `routers/combat.py`, движки, `broadcast_state` на чтение/запись через свойства или явные геттеры доменов (минимизировать «размазанные» обращения к плоским ключам).
3. **Объединить undo-стек** с сессионной мета-моделью или жёстко задокументировать границу «снимок = весь `CombatSession`».
4. **Autosave / encounters:** сохранять тот же корневой JSON (один файл — одна схема версии, поле `schema_version` при необходимости).
5. **WS оптимизация:** только после стабильной композиции на бэке.

### Риски

- **Миграция JSON:** старые энкаунтеры и autosave; обязателен `model_validator` и однократная миграция при `load_state`.
- **Дублирование ссылок:** `Actor` остаётся частью `CombatCore`; не плодить второй список акторов в другом домене.
- **Согласованность транзакций:** одна операция «следующий ход» может трогать и `core`, и `session` (лог); клиент должен получать согласованный снимок или одно сообщение с несколькими секциями.

---

## 🐛 Известные баги

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

**Где искать:** `src/components/` — скорее всего файл с таблицей инициативы или внутри `App.tsx`.  
**Приоритет:** P1 (важный UX-баг, но не критичный для работы).

---

### BUG-2: Мерцание столбцов при смене раунда
**Описание:** При вызове `POST /api/combat/next-turn` (смена хода/раунда) столбцы справа (stat groups) и столбец Effects мерцают (flickering) — видимо перерисовываются полностью.  
**Причина:** Скорее всего вся таблица перерендеривается из-за изменения `state.round` или `state.current_index` в WebSocket update. React перестраивает весь список акторов вместо обновления только текущей строки.

**Решение:**
1. `React.memo` на компонент `<ActorRow>` с правильным `areEqual` comparator — перерисовывать только если изменился конкретный актор.
2. Проверить что у каждого `<ActorRow key={actor.id}>` стабильный `key` (не индекс!).
3. Если используется CSS-анимация — она может триггериться при любом изменении DOM.

**Где искать:** Таблица инициативы в `App.tsx` или компоненте `InitiativeTable`.  
**Приоритет:** P1 (раздражает, но не ломает функционал).

---

### BUG-3: Мусорные зависимости в `package.json`
**Описание:** `express` и `better-sqlite3` остались от шаблона Google AI Studio, но не используются (бэк на FastAPI).  
**Решение:**
```bash
npm uninstall express better-sqlite3
```

**Приоритет:** P2 (безопасность + чистота проекта, но не влияет на работу).

---

### BUG-4: `package-lock.json` в репозитории
**Описание:** `package-lock.json` (201 KB) закоммичен, хотя обычно его не коммитят (или коммитят только для продакшн-релизов).  
**Решение:** Добавить в `.gitignore`, удалить из репо.

```bash
echo "package-lock.json" >> .gitignore
git rm --cached package-lock.json
git commit -m "chore: add package-lock.json to .gitignore"
```

**Приоритет:** P2 (косметика).

---

### BUG-5: `package.json` name = "react-example"
**Описание:** Поле `"name"` не переименовано после ребрендинга.  
**Решение:** Изменить на `"omniboard"` вручную.  
**Приоритет:** P2 (косметика).

---

## 💡 Архитектурные проблемы (для будущего)

### 1. Нет валидации входящих данных на бэке
`PATCH /api/actors/{id}` принимает `updates: dict` — любой JSON проходит до момента `Actor(**actor_dict)`. Риск: крэш при невалидных данных или path traversal через имена файлов.

**Решение:** Создать Pydantic-модели для всех request body (например `ActorUpdateRequest`).

### 2. WebSocket без heartbeat и авторизации
`/ws/master` — один канал без пингов, без reconnect на клиенте. Потеря соединения не детектируется.  
**Решение:** Добавить `ping/pong` каждые 30 секунд, на клиенте — reconnect с exponential backoff.

### 3. ESP32 JSON-конфиг для миниатюр (задел на будущее)
**Описание:** В коде есть намёк на то, что каждая миниатюра должна хранить свой конфиг (`data/miniatures/{id}.json`?), но реализации нет.  
**Нужно решить:**
- Формат конфига: `{ "actor_id": "...", "wifi_ssid": "...", "display_mode": "..." }`
- Где хранить: `data/miniatures/` или в самой прошивке ESP32?
- Как регистрировать: QR-код с `miniature_id` при первом подключении?

**Приоритет:** Отложено до начала разработки ESP32-прошивки.

---

## Порядок выполнения (рекомендуемый)

1. ✅ **Обновить документацию** (сделано)
2. 🔧 **BUG-3, BUG-4, BUG-5** — быстрая чистка вручную (5 минут)
3. 🔥 **P0-1: Автосохранение state** → промпт для Cursor
4. 🔥 **P0-3: Разбивка App.tsx** → пошаговый рефакторинг с коммитами
5. 🐛 **BUG-1, BUG-2** → после разбивки App.tsx, когда код станет читаемым
6. 🔥 **P0-2: Разбивка main.py** → ручная работа или промпт для AI (но осторожно)
7. 🟡 **P1: API errors, reconnect, typegen** → по мере необходимости
8. 🏛️ **Декомпозиция `CombatSession` / `CombatState`** → после стабилизации сетевого слоя (см. раздел «Декомпозиция CombatState» выше); не смешивать с первым же патчем WS без фазы совместимости
9. 🟢 **P2: i18n миграция** → постепенно при создании новых компонентов

---

## Текущий статус

- [x] Документация актуализирована
- [ ] План согласован с Nevrar
- [ ] Начало рефакторинга
