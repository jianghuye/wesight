/**
 * Logger module using electron-log
 * Intercepts console.* methods and writes to file + console simultaneously.
 *
 * Log file locations:
 *   macOS:   ~/Library/Logs/WeSight/main-YYYY-MM-DD.log
 *   Windows: %USERPROFILE%\AppData\Roaming\WeSight\logs\main-YYYY-MM-DD.log
 *   Linux:   ~/.config/WeSight/logs/main-YYYY-MM-DD.log
 *
 * Rotation policy:
 *   - Daily log files (one file per calendar day)
 *   - Max 80 MB per file; on overflow electron-log rotates to .old.log
 *   - Files older than 7 days are pruned on startup
 */

import log from 'electron-log/main';
import fs from 'fs';
import path from 'path';

const LOG_RETENTION_DAYS = 7;
const LOG_MAX_SIZE = 80 * 1024 * 1024; // 80 MB
type ConsoleWriter = (...args: unknown[]) => void;

/** Captured on first resolvePathFn call; used for pruning and export. */
let _logDir: string | undefined;
let loggerInitialized = false;

function isBrokenPipeError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'EPIPE';
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function consoleTimestamp(): string {
  const now = new Date();
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
}

function logDir(): string {
  return _logDir ?? path.dirname(log.transports.file.getFile().path);
}

/**
 * Initialize logging system.
 * Must be called early in main process, before any console output.
 */
export function initLogger(): void {
  if (loggerInitialized) return;
  loggerInitialized = true;

  // Daily rotation: one file per calendar day
  log.transports.file.resolvePathFn = (vars) => {
    _logDir = vars.libraryDefaultDir;
    return path.join(vars.libraryDefaultDir, `main-${todayStr()}.log`);
  };

  // File transport config
  log.transports.file.level = 'debug';
  log.transports.file.maxSize = LOG_MAX_SIZE;
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

  // electron-log writes to file only; native console mirroring is handled below.
  log.transports.console.level = false;

  // Intercept console.* methods so all existing console.log/error/warn
  // across 25+ files are automatically captured without any code changes.
  // electron-log correctly serializes Error objects (with stack traces),
  // unlike JSON.stringify which outputs '{}' for Error instances.
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;
  const originalDebug = console.debug;
  let consoleMirrorEnabled = true;

  const handleConsoleStreamError = (error: Error & { code?: string }) => {
    if (isBrokenPipeError(error)) {
      consoleMirrorEnabled = false;
      log.warn('[Logger] terminal output pipe closed; file logging remains active');
      return;
    }
    consoleMirrorEnabled = false;
    log.warn('[Logger] terminal output failed; file logging remains active:', error);
  };

  process.stdout.on('error', handleConsoleStreamError);
  process.stderr.on('error', handleConsoleStreamError);

  const writeOriginalConsole = (writer: ConsoleWriter, args: unknown[]) => {
    if (!consoleMirrorEnabled) return;
    try {
      writer.apply(console, [`[${consoleTimestamp()}]`, ...args]);
    } catch (error) {
      consoleMirrorEnabled = false;
      if (isBrokenPipeError(error)) {
        log.warn('[Logger] terminal output pipe closed; file logging remains active');
        return;
      }
      log.warn('[Logger] terminal output failed; file logging remains active:', error);
    }
  };

  console.log = (...args: unknown[]) => {
    writeOriginalConsole(originalLog, args);
    log.info(...args);
  };
  console.error = (...args: unknown[]) => {
    writeOriginalConsole(originalError, args);
    log.error(...args);
  };
  console.warn = (...args: unknown[]) => {
    writeOriginalConsole(originalWarn, args);
    log.warn(...args);
  };
  console.info = (...args: unknown[]) => {
    writeOriginalConsole(originalInfo, args);
    log.info(...args);
  };
  console.debug = (...args: unknown[]) => {
    writeOriginalConsole(originalDebug, args);
    log.debug(...args);
  };

  // Remove log files older than retention window
  pruneOldLogs();

  // Log startup marker
  log.info('='.repeat(60));
  log.info(`WeSight started (${process.platform} ${process.arch})`);
  log.info('='.repeat(60));
}

/** Delete daily main-*.log files whose mtime exceeds the retention window. */
function pruneOldLogs(): void {
  const dir = logDir();
  if (!fs.existsSync(dir)) return;

  const cutoffMs = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  for (const file of fs.readdirSync(dir)) {
    if (!/^main-\d{4}-\d{2}-\d{2}(\.old)?\.log$/.test(file)) continue;
    const filePath = path.join(dir, file);
    try {
      if (fs.statSync(filePath).mtimeMs < cutoffMs) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // ignore individual failures
    }
  }
}

/**
 * Get today's log file path (for display / open-in-folder).
 */
export function getLogFilePath(): string {
  return log.transports.file.getFile().path;
}

/**
 * Return archive entries for all daily main log files within the last 7 days.
 * Suitable for passing directly to exportLogsZip.
 */
export function getRecentMainLogEntries(): Array<{ archiveName: string; filePath: string }> {
  const dir = logDir();
  if (!fs.existsSync(dir)) return [];

  const cutoffMs = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  return fs.readdirSync(dir)
    .filter((f) => /^main-\d{4}-\d{2}-\d{2}(\.old)?\.log$/.test(f))
    .map((f) => ({ archiveName: f, filePath: path.join(dir, f) }))
    .filter(({ filePath }) => {
      try {
        return fs.statSync(filePath).mtimeMs >= cutoffMs;
      } catch {
        return false;
      }
    })
    .sort((a, b) => a.archiveName.localeCompare(b.archiveName));
}

/**
 * Log instance for direct usage if needed
 */
export { log };
