/**
 * Освобождает порты 8000 и 3000 перед запуском dev-сервера.
 * Удаляет backend/__pycache__ чтобы worker не подхватывал старый байткод.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function kill(port) {
  try {
    execSync(`npx kill-port ${port}`, { stdio: 'inherit' });
  } catch (_) {}
}

const pycache = path.join(__dirname, '..', 'backend', '__pycache__');
if (fs.existsSync(pycache)) {
  try {
    fs.rmSync(pycache, { recursive: true });
  } catch (_) {}
}

kill(8000);
kill(3000);
setTimeout(() => {
  kill(8000);
  kill(3000);
  // Даём Windows время освободить порт (TIME_WAIT) перед запуском серверов
  setTimeout(() => process.exit(0), 4000);
}, 800);
