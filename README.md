# Nevrar's Omniboard

**Аппаратно-программный комплекс для управления НРИ-сессиями за живым столом.**

Omniboard — это не VTT (Virtual Tabletop). Это физический планшет-контроллер (ESP32-C6 + круглый тачскрин 1.47") для мастера, который **помогает управлять боем в настольных ролевых играх** (D&D 5e, Shadowrun, WoD и др.), не заменяя живое общение и кубики цифровыми аналогами.

---

## 🎯 Философия проекта

- **Живой стол превыше всего**: никаких виртуальных карт и цифровых дайсов. Только физические миниатюры, бумажные карты и настоящие кубики.
- **Мастер — оператор**: Omniboard висит на руке мастера (как часы) и показывает **только ему** критическую информацию: порядок ходов, HP врагов, эффекты.
- **Игроки видят только то, что должны**: второй экран (опционально) отображает очередь инициативы и публичные данные для игроков, но без spoiler'ов.
- **Быстрая настройка под любую систему**: D&D 5e, Shadowrun, WoD, homebrew — настраиваешь колонки (HP, AC, Essence, etc.) через конфигуратор за 2 минуты.

---

## 🚀 Возможности

### Управление боевкой
- **Трекер инициативы** с автоматической очередью ходов
- **Групповая инициатива** (simultaneous/sequential mode)
- **Эффекты** (бафы/дебафы) с отсчётом длительности
- **Undo/Redo** для отмены ошибок
- **Журнал боя** (опционально) — текстовые логи событий с экспортом

### Гибкая система
- **Мультисистемность**: настраиваемые колонки статов под любую НРИ
- **Модульные движки инициативы** (`Standard` / `Popcorn` / `Phase`) и ручной режим мастера
- **Asset Override**: системные ассеты и JSON-конфиги поверх базового слоя `data/assets/default/` (раскладки мини-экрана, бары, LED-профили) с предсказуемым merge по `id`
- **Локализация**: русский, английский, легко добавить свой язык
- **Пресеты систем**: сохраняй и загружай конфигурации (D&D 5e, Shadowrun, custom)
- **Компендиум актёров**: база NPC/монстров с портретами и статами
- **Столкновения (Encounters)**: сохранение/загрузка готовых сцен боя (полный **`CombatSession`**)

### Визуализация
- **Экран миниатюр** (ESP32): круглый дисплей 1.47" (172x320) показывает портрет текущего актёра, HP-бар, эффекты
- **Веб-интерфейс**: полноценный UI для настройки и управления боем (React + FastAPI)
- **Второй экран для игроков** (опционально): проектор/монитор показывает очередь инициативы без spoiler'ов

---

## 🛠️ Технологический стек

### Backend
- **Python 3.11+** (FastAPI, Uvicorn, WebSockets)
- **Pydantic v2** — доменная модель сессии боя **`CombatSession`** (`core`, `display`, `hardware`, `session`) поверх плоского **`CombatState`** для движков
- **JSON-based storage** (без БД, файлы в `data/`), автосейв в `data/state_autosave.json`

### Frontend
- **React 19** + **TypeScript**
- **Vite** (сборка)
- **TailwindCSS** (стилизация)
- **i18next** (локализация)
- **WebSocket** (реал-тайм синхронизация)

### Hardware (планируется)
- **ESP32-C6** (Waveshare ESP32-C6-LCD-1.47)
- **LVGL** (UI-фреймворк для embedded)
- **Круглый TFT 1.47"** (172x320, GC9A01 driver)
- **WebSocket client** для синхронизации с бэкендом

---

## 📦 Установка и запуск

### Требования
- Python 3.11+
- Node.js 18+ (для фронтенда)
- Git

### Шаг 1: Клонирование репозитория
```bash
git clone https://github.com/Eskaldor/Omniboard.git
cd Omniboard
```

### Шаг 2: Запуск бэкенда
```bash
# Создай виртуальное окружение (опционально)
python -m venv venv
source venv/bin/activate  # Linux/macOS
# или
venv\Scripts\activate  # Windows

# Установи зависимости
pip install -r requirements.txt

# Запусти сервер
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Бэкенд будет доступен на `http://localhost:8000`

### Шаг 3: Запуск фронтенда
```bash
# Установи зависимости
npm install

# Запусти dev-сервер
npm run dev
```

Фронтенд откроется на `http://localhost:5173`

### Шаг 4 (опционально): Прошивка ESP32
*(Пока в разработке, см. `Architecture_Decisions_and_Icebox.md`)*

---

## 📖 Быстрый старт

1. **Открой конфигуратор** (иконка шестерёнки) и выбери систему (например, "D&D 5e")
2. **Добавь актёров**:
   - Из компендиума (кнопка "Roster")
   - Вручную (кнопка "+ Add Actor")
3. **Настрой инициативу** для каждого актёра (кликни по колонке "Init")
4. **Начни бой** (кнопка "Start Combat" внизу)
5. **Управляй ходами**:
   - Кнопка "Next Turn" — следующий ход
   - Двойной клик по актёру — открыть карточку
   - Кнопка "+" у актёра — добавить эффект (например, "Poisoned")

---

## 🗂️ Структура проекта

```
Omniboard/
├── backend/               # FastAPI бэкенд
│   ├── main.py           # Точка входа, WebSocket
│   ├── combat_engine.py  # Логика боя (инициатива, эффекты, undo/redo)
│   ├── models.py         # Pydantic-модели (Actor, Effect, CombatState)
│   └── routers/          # API-эндпоинты (actors, combat, systems, locales)
├── src/                  # React фронтенд
│   ├── App.tsx           # Главный компонент
│   ├── components/       # UI-компоненты (Modals, InitiativeTable, etc.)
│   ├── contexts/         # React Context (CombatState, Columns)
│   ├── types.ts          # TypeScript типы
│   └── i18n.ts           # Конфигурация i18next
├── data/                 # Хранилище данных (JSON)
│   ├── combat_state.json # Текущее состояние боя
│   ├── locales/          # Переводы (ru, en, etc.)
│   ├── systems/          # Пресеты систем (D&D 5e, Shadowrun)
│   └── assets/           # Портреты, рамки, иконки эффектов
├── docs/                 # Документация
│   ├── Omniboard_TZ.md   # Техническое задание
│   ├── Architecture_Decisions_and_Icebox.md  # Архитектурные решения
│   └── Progress_and_Backlog.md  # Журнал разработки
└── index.html            # Точка входа фронтенда
```

---

## 🔧 Конфигурация системы

Omniboard поддерживает **любую НРИ-систему** через настраиваемые колонки.

### Пример: D&D 5e
```json
{
  "columns": [
    { "key": "hp", "label": "Hit Points", "showInTable": true },
    { "key": "ac", "label": "Armor Class", "showInTable": true },
    { "key": "speed", "label": "Speed", "showInTable": false }
  ]
}
```

### Пример: Shadowrun 6e
```json
{
  "columns": [
    { "key": "physical", "label": "Physical", "showInTable": true, "maxKey": "physical_max" },
    { "key": "stun", "label": "Stun", "showInTable": true, "maxKey": "stun_max" },
    { "key": "essence", "label": "Essence", "showInTable": true }
  ]
}
```

Сохраняй пресеты через **Конфигуратор → Save** и загружай их в любой момент.

---

## 🌍 Локализация

Добавить новый язык:
1. Создай папку `data/locales/{lang_code}/` (например, `fr` для французского)
2. Скопируй `data/locales/ru/core.json` в `data/locales/fr/core.json`
3. Переведи строки
4. Добавь метаданные:
```json
{
  "_meta": {
    "language_name": "Français",
    "flag": "🇫🇷"
  },
  ...
}
```
5. Перезапусти сервер — язык появится в выпадающем списке автоматически

---

## 📡 API-эндпоинты (краткий справочник)

### Combat
- `GET /api/combat/state` — текущее состояние боя
- `POST /api/combat/start` — начать бой (активирует очередь)
- `POST /api/combat/next-turn` — следующий ход (+ отсчёт эффектов)
- `POST /api/combat/end` — закончить бой (сбрасывает is_active)
- `POST /api/combat/reset` — сброс боя (раунд=1, очистка эффектов)
- `POST /api/combat/undo` / `POST /api/combat/redo` — отмена/повтор
- `PATCH /api/combat/legend` — обновить цвета ролей (player/enemy/ally/neutral)

### Actors
- `POST /api/actors` — добавить актёра
- `PATCH /api/actors/{id}` — обновить поле актёра
- `DELETE /api/actors/{id}` — удалить актёра

### Systems
- `GET /api/systems/list` — список сохранённых систем
- `GET /api/systems/{name}/columns` — загрузить колонки системы
- `POST /api/systems/{name}/columns` — сохранить колонки системы
- `GET /api/systems/{name}/actors` — компендиум актёров системы
- `POST /api/systems/{name}/actors` — добавить актёра в компендиум

### Encounters
- `GET /api/encounters/list` — список сохранённых столкновений
- `POST /api/encounters/save` — сохранить текущий бой как столкновение
- `GET /api/encounters/get` — загрузить столкновение
- `DELETE /api/encounters/delete` — удалить столкновение

### Locales
- `GET /api/locales/languages` — список доступных языков
- `POST /api/locales/languages/refresh` — пересканировать папку локалей
- `GET /api/locales/{lang}/{namespace}` — загрузить переводы (core или systems/{name})

---

## 🎨 Кастомизация UI

### Цвета ролей (Legend)
Нажми **кнопку "Groups"** в шапке → настрой цвета для:
- Player (по умолчанию: зелёный `#10b981`)
- Enemy (красный `#ef4444`)
- Ally (синий `#3b82f6`)
- Neutral (серый `#a1a1aa`)

### Раскладка миниатюр (ESP32)
**Кнопка "Miniatures"** → настрой 4 слота на экране:
- Top-left, Top-right, Bottom-left, Bottom-right
- Для каждого: тип (текст/прогресс-бар), поле (hp, ac, speed), цвет

---

## 🐛 Known Issues / TODO

См. `docs/Progress_and_Backlog.md` для актуального списка задач.

**Критичные баги:**
- ~~Смена языка не обновляет label'ы в конфигураторе до F5~~ → **исправлено в 9.7**
- ~~Список языков hardcoded (ru, en)~~ → **исправлено в 9.6 (динамическое сканирование)**

**В разработке:**
- Прошивка ESP32-C6 (LVGL + WebSocket client)
- Bluetooth-синхронизация (опционально)
- Hotbar (быстрые действия) для актёров

---

## 🤝 Контрибьюция

Проект open-source! Pull requests приветствуются.

**Как помочь:**
1. Форкни репозиторий
2. Создай feature-branch (`git checkout -b feature/amazing-feature`)
3. Закоммить изменения (`git commit -m 'Add amazing feature'`)
4. Запуш в свой форк (`git push origin feature/amazing-feature`)
5. Открой Pull Request

---

## 📜 Лицензия

MIT License. См. `LICENSE` для деталей.

---

## 👤 Автор

**Nevrar** (системный администратор, мастер НРИ, энтузиаст ИИ)  
Астрахань → София  
GitHub: [@Eskaldor](https://github.com/Eskaldor)

**Omniboard** создан для мастеров, которые хотят управлять боем эффективно, но **не хотят терять магию живого стола**.

---

## 🙏 Благодарности

- **Ингрис** (AI tech lead) — архитектура, code review, вдохновение
- **Cursor AI** — основной инструмент разработки
- **Perplexity** — документация и research
- Сообщество мастеров D&D/Shadowrun/WoD за фидбек

---

*Для подробной технической документации см. [`docs/Omniboard_TZ.md`](docs/Omniboard_TZ.md)*
