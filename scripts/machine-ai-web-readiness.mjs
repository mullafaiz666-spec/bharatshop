export function isMachineAiIdentity(payload, { root, pid } = {}) {
  return Boolean(root && payload?.service === 'bharatshop-machine-ui'
    && payload?.root === root && Number.isInteger(payload?.pid) && payload.pid > 0
    && (!pid || payload.pid === pid));
}

export function isMachineAiStatus(payload, expected = {}) {
  return Boolean(payload?.ollama && typeof payload.ollama.ready === 'boolean'
    && payload?.shim && typeof payload.shim.ready === 'boolean'
    && Number.isInteger(payload?.agents)
    && (!expected.root || payload?.project?.root === expected.root)
    && (!expected.pid || payload?.runtime?.pid === expected.pid));
}
