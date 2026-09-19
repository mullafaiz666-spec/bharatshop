export function isMachineAiStatus(payload) {
  return Boolean(payload?.ollama && typeof payload.ollama.ready === 'boolean'
    && payload?.shim && typeof payload.shim.ready === 'boolean'
    && Number.isInteger(payload?.agents));
}
