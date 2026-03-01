/**
 * Освобождает порты 8001 (бэкенд) и 3000 (фронт) перед запуском dev-сервера.
 * Удаляет backend/__pycache__ чтобы не подхватывать старый байткод.
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

kill(8001);
kill(3000);
setTimeout(() => {
  kill(8001);
  kill(3000);
  setTimeout(() => process.exit(0), 4000);
}, 800);
