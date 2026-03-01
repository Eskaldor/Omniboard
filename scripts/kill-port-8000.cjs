/**
 * Предохранитель: освобождает порт 8000 перед запуском dev-сервера,
 * чтобы избежать WinError 10013 (порт занят старым uvicorn).
 * Всегда завершается с кодом 0, чтобы npm run dev продолжал запуск.
 */
const { execSync } = require('child_process');

try {
  execSync('npx kill-port 8000', { stdio: 'inherit' });
} catch (_) {
  // Порт свободен или нет прав — не мешаем запуску dev
}
process.exit(0);
