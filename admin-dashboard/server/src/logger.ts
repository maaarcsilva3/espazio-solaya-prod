type LogLevel = 'info' | 'warn' | 'error';

export function log(level: LogLevel, message: string, extra: Record<string, unknown> = {}) {
  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...extra,
  });
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}
