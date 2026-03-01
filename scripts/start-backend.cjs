/**
 * Освобождает порт 8000, ждёт 3 с, затем запускает uvicorn.
 */
const { execSync, spawn } = require('child_process');
const path = require('path');

function kill(port) {
  try {
    execSync(`npx kill-port ${port}`, { stdio: 'inherit' });
  } catch (_) {}
}

try {
  execSync('python -m pip install -q -r requirements.txt', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
} catch (_) {}

kill(8001);
setTimeout(() => {
  const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };
  const child = spawn('python', ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', '8001'], {
    stdio: 'inherit',
    shell: true,
    cwd: path.join(__dirname, '..'),
    env,
  });
  child.on('exit', (code) => process.exit(code != null ? code : 0));
}, 3000);
