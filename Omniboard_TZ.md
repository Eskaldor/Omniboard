# Nevrar's Omniboard — ТЗ v2.0

> Обновлено: 03.03.2026 (после рефакторинга архитектуры хранения систем и локализации)
> Стек сменился с Vue 3 на React 19 (сгенерировано в Google AI Studio).

## 📌 Суть проекта
Omniboard — это **локальный аппаратно-программный комплекс** для управления боем в настольных ролевых играх (не VTT). 
Система включает в себя:
1. **Веб-интерфейс (ПК/Планшет):** Трекер инициативы, управление здоровьем, эффектами.
2. **Аппаратные миниатюры (ESP32-C6):** Экраны 1.47" (172×320), которые ставятся на физический стол. Показывают портрет, HP, эффекты и подсвечиваются диодами в цвет фракции.

---

## 1. Технический Стек
- **Backend:** FastAPI (Python 3.11), Pydantic v2.
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
- Рассылает `{ "type": "state_update", "payload": CombatState }` при любых изменениях.
- Рассылает `{ "can_undo": bool, "can_redo": bool }` при изменении стека истории.

### Боевка (`/api/combat`)
- `GET /state`
- `POST /start`, `POST /end`, `POST /reset`, `POST /clear`
- `POST /next-turn` (с обработкой `duration` эффектов и одновременных групп)
- `POST /undo`, `POST /redo`
- `POST /load` (загружает encounter)
- `PATCH /system` (меняет активную систему)
- `PATCH /layout`, `PATCH /legend`, `PATCH /settings`

### Акторы (`/api/actors`)
- `POST /` (добавить в конец/начало очереди, либо пересчет инициативы)
- `PATCH /{id}` (deep-merge: обновление статов, HP, добавление эффектов)
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