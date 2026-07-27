// utils/log.js
//
// Phase 8 — structured, single-line JSON logging for production. Each call emits
// { ts, level, event, ...fields } so logs are machine-parseable (PM2 / log
// shippers) while staying readable. No new dependencies.
//
function emit(level, event, fields = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const logEvent = (event, fields) => emit("info", event, fields);
export const logWarn = (event, fields) => emit("warn", event, fields);
export const logError = (event, fields) => emit("error", event, fields);

export default { logEvent, logWarn, logError };
