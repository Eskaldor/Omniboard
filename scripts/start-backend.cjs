/**
 * Освобождает порт 80, ждёт 3 с, затем запускает uvicorn.
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

kill(80);
setTimeout(() => {
  const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };
  const child = spawn('python', ['-m', 'uvicorn', 'backend.main:app', '--host', '0.0.0.0', '--port', '80'], {
    stdio: 'inherit',
    shell: false,
    cwd: path.join(__dirname, '..'),
    env,
  });
  child.on('exit', (code) => process.exit(code != null ? code : 0));
}, 3000);
