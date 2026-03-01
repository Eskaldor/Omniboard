<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/1e190f66-b156-4cd7-bff8-8dadbc2c8dba

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Просмотр логов

**Где смотреть логи**

При `npm run dev` в **одном терминале** выводятся оба процесса:

- **`[0]`** — бэкенд (Python/Uvicorn, порт 8000). Здесь видны:
  - запросы к API (`GET /api/...`, `POST /api/...`);
  - ошибки приложения и трейсбэки Python.
- **`[1]`** — фронтенд (Vite, порт 3000). Здесь видны:
  - сборка и HMR;
  - ошибки сборки и предупреждения Vite.

**Как перезапустить сервер**

1. В терминале, где запущен `npm run dev`, нажмите **Ctrl+C**.
2. Снова выполните: `npm run dev`.

Перед запуском скрипт `predev` освобождает порт 8000. Если нужно освободить и порт 3000, выполните один раз:

```powershell
npx kill-port 8000 3000
npm run dev
```

**Отдельный запуск (для отладки)**

- Терминал 1 — только бэкенд: `npm run dev:backend`
- Терминал 2 — только фронт: `npm run dev:frontend`

Так логи бэкенда и фронта не смешиваются.
