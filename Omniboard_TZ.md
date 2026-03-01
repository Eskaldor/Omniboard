# Nevrar's Omniboard — ТЗ v2.0

> Последнее обновление: 01.03.2026  
> ⚠️ Стек изменён с Vue 3 → **React 19** после ребута на Google AI Studio.

## Цель проекта

Omniboard — локальный программно-аппаратный комплекс для управления боевыми сценами настольных ролевых игр **за живым столом** (не VTT). Мастер запускает приложение на ноутбуке, управляет боем через веб-интерфейс, а умные миниатюры (ESP32) автономно отображают статусы, HP и портреты персонажей на своих экранах.

---

## 1. Технологический Стек

### Backend
| Компонент | Технология |
|---|---|
| Фреймворк | FastAPI (Python 3.11+) |
| Модели | Pydantic v2 |
| Транспорт | WebSocket (`/ws/master`) + REST |
| Хранилище | Файловая система (JSON / PNG) |
| Рендер миниатюр | Pillow (`backend/compositor.py`) |
| Запуск | `uvicorn --reload` (dev) |

### Frontend
| Компонент | Технология |
|---|---|
| Фреймворк | React 19 + TypeScript |
| Сборщик | Vite 6 |
| Стили | Tailwind CSS v4 |
| Иконки | lucide-react |
| Анимации | Framer Motion (пакет `motion`) |
| Локализация | i18next + react-i18next + i18next-http-backend |
| Транслитерация | transliteration (slugs для ID эффектов) |
| AI-интеграция | @google/genai (опционально) |

### Запуск (монорепо)
```bash
npm run dev   # запускает backend (port 8001) и frontend (port 3000) параллельно
```
Прокси в `vite.config.ts`: `/api`, `/ws`, `/assets`, `/render`, `/locales` → `http://127.0.0.1:8001`

---

## 2. Pydantic Models (`backend/models.py`)

### Effect
```python
class Effect(BaseModel):
    id: str
    name: str
    duration: Optional[int] = None       # None = бессрочный
    description: Optional[str] = None
    show_on_miniature: bool = False
```

### Visibility
```python
class Visibility(BaseModel):
    hp: bool = True
    stats: bool = True
    effects: bool = True
    name: bool = True
```

### HotbarAction *(модель готова, UI — в беклоге)*
```python
class HotbarAction(BaseModel):
    label: str
    type: Literal["damage", "heal", "effect", "note"]
    value: Optional[int] = None
    effect_id: Optional[str] = None
    effect_duration: Optional[int] = None
    source: Optional[str] = None
    targets: Literal["self", "selected", "all_enemies", "all_allies"] = "selected"
```

### DisplayField
```python
class DisplayField(BaseModel):
    type: Literal["text", "bar"]
    label: Optional[str] = None
    value_path: str
    max_value_path: Optional[str] = None
    color: Optional[str] = None
```

### MiniatureLayout
```python
class MiniatureLayout(BaseModel):
    show_portrait: bool = True
    top1: Optional[DisplayField] = None
    top2: Optional[DisplayField] = None
    bottom1: Optional[DisplayField] = None
    bottom2: Optional[DisplayField] = None
```

### Actor
```python
class Actor(BaseModel):
    id: str
    name: str
    role: Literal["character", "enemy", "ally", "neutral"]
    is_revealed: bool = True
    group_id: Optional[str] = None
    group_mode: Optional[Literal["sequential", "simultaneous"]] = None
    group_color: Optional[str] = None
    initiative: int = 0
    portrait: str
    miniature_id: Optional[str] = None
    stats: Dict[str, Any] = {}
    effects: List[Effect] = []
    visibility: Visibility = Visibility()
    hotbar: List[HotbarAction] = []
```

### LegendConfig
```python
class LegendConfig(BaseModel):
    player: str = "#10b981"   # emerald
    enemy: str = "#ef4444"    # red
    ally: str = "#3b82f6"     # blue
    neutral: str = "#a1a1aa"  # zinc
```

### LogEntry *(события боя — НЕ Undo-стэк!)*
```python
class LogEntry(BaseModel):
    type: Literal["combat_start", "combat_end", "round_start", "turn_start",
                  "hp_change", "effect_added", "effect_removed",
                  "actor_joined", "actor_left", "text"]
    round: int
    actor_id: Optional[str] = None
    actor_name: Optional[str] = None
    details: Dict[str, Any] = {}
```

### CombatState (главная модель)
```python
class CombatState(BaseModel):
    actors: List[Actor] = []
    turn_queue: List[str] = []          # actor.id в порядке инициативы
    current_index: int = 0
    round: int = 1
    system: str = "D&D 5e"
    layout: MiniatureLayout = MiniatureLayout()
    legend: LegendConfig = Field(default_factory=LegendConfig)
    show_group_colors: bool = True
    show_faction_colors: bool = True
    sync_led_to_ui: bool = True         # синхр. LED с UI цветами (ESP32, в разработке)
    history: List[LogEntry] = []        # ЛОГ СОБЫТИЙ (не путать с Undo!)
    history_cursor: int = -1            # зарезервировано
    is_active: bool = False
    active_reaction_actor_id: Optional[str] = None  # зарезервировано
    enable_logging: bool = True
```

> ⚠️ **КРИТИЧЕСКИ ВАЖНО — Две разные «истории»:**
>
> | Переменная | Где | Что это |
> |---|---|---|
> | `CombatState.history: List[LogEntry]` | Pydantic-модель | **Лог событий** боя (HP, эффекты, ходы) |
> | `history_stack: list` + `history_index: int` | Глобальные в `main.py` | **Снэпшоты** для Undo/Redo (20 шт.) |
>
> Это две независимые несвязанные системы!

---

## 3. API Reference

### WebSocket
| Endpoint | Описание |
|---|---|
| `WS /ws/master` | При подключении сразу шлёт текущий стейт. Формат сообщений: `{ "type": "state_update", "payload": {...CombatState} }` |

### Combat Control
| Method | Endpoint | Описание |
|---|---|---|
| GET | `/api/combat/state` | Текущий стейт + флаги `can_undo` / `can_redo` |
| POST | `/api/combat/start` | Старт боя; выравнивает initiative в `simultaneous`-группах по max; сортирует queue |
| POST | `/api/combat/end` | Завершить бой (акторы остаются) |
| POST | `/api/combat/reset` | Сброс: очередь + эффекты + лог; акторы остаются |
| POST | `/api/combat/clear` | Полная очистка: все акторы + лог |
| POST | `/api/combat/next-turn` | Следующий ход; `simultaneous`-группы — единый слот; тикает `duration` эффектов при смене раунда |
| POST | `/api/combat/undo` | Откат состояния из `history_stack` |
| POST | `/api/combat/redo` | Повтор отменённого действия |
| POST | `/api/combat/load` | Загрузить encounter: actors + history + round + turn_queue + current_index + is_active |
| PATCH | `/api/combat/system` | `{ "system": "Pathfinder" }` |
| PATCH | `/api/combat/legend` | Цвета фракций + `show_group_colors` / `show_faction_colors` |
| PATCH | `/api/combat/settings` | `{ "enable_logging": true }` |

### Actors
| Method | Endpoint | Описание |
|---|---|---|
| POST | `/api/actors` | Создать актора; если бой активен — добавляет в queue + `reorder_turn_queue()` |
| PATCH | `/api/actors/{id}` | Обновить актора; deep-merge для `stats`; логирует `hp_change` и diff эффектов; синхронизирует initiative внутри `simultaneous`-группы |
| DELETE | `/api/actors/{id}` | Удалить; чистит из queue |

### Layout
| Method | Endpoint | Описание |
|---|---|---|
| PATCH | `/api/combat/layout` | Обновить `MiniatureLayout` (поля для экрана ESP32) |

### Combat Log
| Method | Endpoint | Описание |
|---|---|---|
| POST | `/api/combat/log/note` | `{ "message": "..." }` — GM-заметка в лог |
| DELETE | `/api/combat/log` | Очистить лог боя |
| POST | `/api/logs/open_folder` | Открыть `data/logs/` в проводнике (Win/Mac/Linux) |

### Systems
| Method | Endpoint | Описание |
|---|---|---|
| GET | `/api/systems/list` | Список систем (из `*_columns.json` файлов) |
| GET | `/api/systems/{name}/effects` | Эффекты системы |
| POST | `/api/systems/{name}/effects` | Сохранить/обновить эффект |
| GET | `/api/systems/{name}/columns` | Колонки (stat groups) |
| POST | `/api/systems/{name}/columns` | Сохранить колонки |
| GET | `/api/systems/{name}/actors` | Roster — сохранённые акторы |
| POST | `/api/systems/{name}/actors` | Сохранить актора в Roster |

### Encounters
| Method | Endpoint | Описание |
|---|---|---|
| GET | `/api/encounters/list?system_name=` | Список encounters |
| POST | `/api/encounters/save` | Сохранить полный стейт боя |
| GET | `/api/encounters/get?system_name=&filename=` | Загрузить encounter |
| DELETE | `/api/encounters/delete?system_name=&filename=` | Удалить encounter |

> Legacy-маршруты `/api/systems/{name}/encounters` оставлены для обратной совместимости.

### Assets
| Method | Endpoint | Описание |
|---|---|---|
| GET | `/api/assets/{category}?system=` | Список файлов; system-папка override над default |
| POST | `/api/assets/{category}?system=` | Загрузить файл |
| DELETE | `/api/assets/{category}/{filename}?system=` | Удалить файл |

`category`: `portraits` \| `frames` \| `effects`

### Render & Static
| | |
|---|---|
| `GET /api/render/{actor_id}` | PNG для ESP32 через `compositor.py` |
| `/assets/` | статика → `data/assets/` |
| `/render/` | статика → `data/render/` |
| `/locales/` | статика → `data/locales/` |

---

## 4. Структура данных (`data/`)

```
data/
├── systems/
│   ├── {safe_name}_columns.json     # { "displayName": "...", "columns": [...] }
│   └── {system}_effects.json        # [{id, name, duration, ...}]
├── actors/
│   └── {system_name}/
│       └── {Actor Name}.json
├── encounters/
│   └── {system_name}/
│       └── enc_{name}.json          # actors + history + round + turn_queue + current_index + is_active
├── assets/
│   ├── default/
│   │   ├── portraits/
│   │   ├── frames/
│   │   └── effects/
│   └── systems/
│       └── {system_name}/
│           ├── portraits/
│           ├── frames/
│           └── effects/             # override: если имя совпадает — system > default
├── render/                          # PNG кэш рендеров для ESP32
├── locales/
│   └── {lang}/                      # en/, ru/
│       ├── core.json                # UI-строки
│       └── systems/
│           └── {system}.json        # термины системы (hp, ac, wounds...)
└── logs/
    ├── latest_combat.json
    └── latest_combat.md
```

---

## 5. Фронтенд — структура (`src/`)

```
src/
├── main.tsx          # точка входа; импортирует i18n; обёртка <Suspense>
├── App.tsx           # главный компонент (~40KB — рефакторинг в беклоге!)
├── types.ts          # TypeScript-типы (зеркало Pydantic-моделей)
├── i18n.ts           # инициализация i18next-http-backend
├── index.css         # глобальные стили (Tailwind)
├── components/       # UI-компоненты
└── contexts/         # React-контексты
```

### i18n
- Файлы грузятся динамически с бэка: `/locales/{lang}/core.json`
- Системные термины: namespace `systems/{system}` (lazy-load при выборе системы)
- Переключение: `i18n.changeLanguage('ru')` в ConfigModal
- **Статус:** фундамент заложен; полная миграция UI-строк — в беклоге

---

## 6. Аппаратная часть (ESP32)

> Статус: прошивка в разработке

- Экран: **172×320 px** (Waveshare ESP32-C6-LCD-1.47)
- Связь: Wi-Fi → WebSocket к `backend/`
- Рендер: `GET /api/render/{actor_id}` → PNG → display
- Поля: конфигурируются через `MiniatureLayout` (top1/top2/bottom1/bottom2)
- Ассеты: **кроппер под 172×320 (`react-image-crop`) — в беклоге**

---

## 7. Известные баги

| # | Описание | Файл |
|---|---|---|
| BUG-1 | Stat Groups — визуальный баг отображения в столбце таблицы | `src/components/` |
| BUG-2 | `package.json` name = `"react-example"` | `package.json` |
| BUG-3 | Мусорные зависимости `express` + `better-sqlite3` от AI Studio шаблона | `package.json` |
| BUG-4 | `package-lock.json` закоммичен в репо | `.gitignore` |
