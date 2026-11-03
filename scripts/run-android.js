import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const frontend = join(root, 'frontend');
const apkPath = join(
  frontend,
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'debug',
  'app-debug.apk'
);

const jbrCandidates = [
  process.env.JAVA_HOME,
  'C:\\Program Files\\Android\\Android Studio\\jbr',
  join(process.env.LOCALAPPDATA || '', 'Programs', 'Android', 'Android Studio', 'jbr'),
  '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
].filter(Boolean);

function buildEnv() {
  const env = { ...process.env };
  const javaHome = jbrCandidates.find((p) => p && existsSync(p));

  if (javaHome) {
    env.JAVA_HOME = javaHome;
    const bin = join(javaHome, 'bin');
    const sep = process.platform === 'win32' ? ';' : ':';
    const current = env.Path || env.PATH || '';
    if (!current.includes(bin)) {
      const next = `${bin}${sep}${current}`;
      env.Path = next;
      env.PATH = next;
    }
  } else {
    console.warn(
      '[run-android] JAVA_HOME no definido. Instale JDK 17+ o Android Studio y configure JAVA_HOME.'
    );
  }

  const sdk =
    env.ANDROID_HOME ||
    env.ANDROID_SDK_ROOT ||
    join(env.LOCALAPPDATA || '', 'Android', 'Sdk');
  const sdkBin = join(sdk, 'platform-tools');
  if (existsSync(sdkBin)) {
    const sep = process.platform === 'win32' ? ';' : ':';
    const current = env.Path || env.PATH || '';
    if (!current.includes(sdkBin)) {
      const next = `${sdkBin}${sep}${current}`;
      env.Path = next;
      env.PATH = next;
    }
  }

  return env;
}

function adbPath(env) {
  const sdk =
    env.ANDROID_HOME ||
    env.ANDROID_SDK_ROOT ||
    join(env.LOCALAPPDATA || '', 'Android', 'Sdk');
  const adb = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  return existsSync(adb) ? adb : null;
}

function restartAdb(env) {
  const adb = adbPath(env);
  if (!adb) return;
  spawnSync(adb, ['kill-server'], { env, stdio: 'ignore' });
  spawnSync(adb, ['start-server'], { env, stdio: 'ignore' });
}

function run(cmd, args, cwd = root, { allowFail = false } = {}) {
  const isWin = process.platform === 'win32';
  const env = buildEnv();
  const result = spawnSync(cmd, args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: isWin,
  });
  if (result.status !== 0 && !allowFail) {
    process.exit(result.status ?? 1);
  }
  return { status: result.status ?? 1, env };
}

function tryLaunchApp(env) {
  const adb = adbPath(env);
  if (!adb) return false;
  const r = spawnSync(
    adb,
    [
      'shell',
      'am',
      'start',
      '-n',
      'com.grupodecor.portalcumplidos/.MainActivity',
    ],
    { env, stdio: 'pipe', encoding: 'utf8' }
  );
  return r.status === 0;
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

run('node', [join(frontend, 'scripts', 'sync-android-branding.js')], frontend);
run(npm, ['run', 'build:mobile'], frontend);
run(npx, ['cap', 'sync', 'android'], frontend);

const env = buildEnv();
restartAdb(env);

const capRun = spawnSync(npx, ['cap', 'run', 'android'], {
  cwd: frontend,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (capRun.status === 0) {
  process.exit(0);
}

if (existsSync(apkPath)) {
  console.warn('');
  console.warn('[run-android] Gradle/instalación OK, pero Capacitor no pudo abrir la app (ADB lento).');
  console.warn('[run-android] La APK suele estar instalada. Ábrala desde el launcher del emulador/teléfono.');
  if (tryLaunchApp(env)) {
    console.warn('[run-android] App iniciada manualmente vía adb.');
    process.exit(0);
  }
  console.warn('[run-android] Si no aparece, reinicie el emulador y ejecute de nuevo.');
  process.exit(0);
}

process.exit(capRun.status ?? 1);
