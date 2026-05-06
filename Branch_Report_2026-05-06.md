# Omniboard — отчёт по ветке (2026‑05‑06)

Этот отчёт фиксирует изменения, сделанные в рамках улучшения **Player View (mobile UX)**, **дайс‑роллера**, **секретных бросков/шёпота** и политики **бросков вне хода** с подтверждением мастера.

## Summary

- **Player View**: добавлены тосты (react-hot-toast), haptics, новый таб **«Кубы»** с отдельным экраном бросков.
- **Secret mode**: добавлен флаг `is_secret` в лог/броски и фильтрация логов для игроков.
- **Whisper to GM**: отдельная отправка текстовых сообщений игрок → GM + тост у GM.
- **Out-of-turn rolls**: политика «в свой ход / без запросов / запрос мастеру», очередь запросов у GM, решение «Ок / Нет / На раунд».
- **PWA**: подключён `vite-plugin-pwa` и базовый манифест.

## Backend

### Модель и состояние

- `backend/models.py`
  - `LogEntry.is_secret: bool`
  - `SessionMeta.allow_out_of_turn_rolls: bool` — глобальный режим «без запросов»
  - `SessionMeta.pending_roll_requests: Dict[request_id, payload]` — очередь запросов
  - `SessionMeta.actor_out_of_turn_round_pass: Dict[actor_id, round]` — «пас на раунд» для конкретного актора

### Эндпоинты

- `POST /api/player/roll/request`
  - **200**: `{ status: "approved", result }` если бросок можно выполнить сразу
  - **202**: `{ status: "pending", request_id }` если нужен GM
- `POST /api/combat/roll-requests/{request_id}/resolve`
  - `decision: approve_once | deny | grant_actor_round`
- `PATCH /api/combat/settings`
  - `allow_out_of_turn_rolls: boolean`

### WebSocket события

- GM (`/ws/master`)
  - `roll_event` — тосты бросков (в т.ч. игрока)
  - `whisper_event` — тост «шёпота»
  - `roll_request` — запрос броска вне хода (очередь)
- Player (`/ws/player?token=...`)
  - `roll_event` — тосты (в т.ч. одобренные внеходовые)
  - `roll_request_status` — `pending|approved|denied`

## Frontend

### Player View

- Добавлен таб `dice` и экран `src/player/views/DiceView.tsx`
- В `ActionsView`, `DiceView`, `DefaultSystemSheet`:
  - учитывается `allow_out_of_turn_rolls` и `actor_out_of_turn_round_pass`
  - запросы на бросок уходят в `/api/player/roll/request`
  - при ответе `approved` результат показывается сразу (без «залипания» UI)

### GM Console

- `src/components/GMConsole/GMConsoleSlider.tsx`
  - кнопка «Броски вне хода» открывает попап с:
    - тумблером глобального режима «без запросов»
    - очередью запросов и решениями `Ок / Нет / На раунд`

### Toast UI

- `src/utils/rollToast.tsx`
  - все тосты имеют кнопку закрытия
  - добавлен тост `showRollRequestToast` для входящих `roll_request`
- `src/utils/whisperToast.tsx`
  - тематический тост «шёпота» у GM с кнопкой закрытия

### Mobile UX / PWA

- `vite-plugin-pwa` подключён в `vite.config.ts`
- `src/utils/haptics.ts` и вызовы `hapticTap()` на важных действиях UI

## Notes

- В репозитории появились/обновились файлы в `data/` (логи и автосейв) — это локальные артефакты запуска.

