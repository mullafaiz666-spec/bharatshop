export default String.raw`import { useCallback, useEffect, useState } from "react";

const BASE = "http://127.0.0.1:3001";

export function useMcpConnectors(refreshMs = 60000) {
  const [connectors, setConnectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(BASE + "/api/machine-ai/connectors", { cache: "no-store", mode: "cors" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "MCP status unavailable");
      setConnectors(Array.isArray(data.connectors) ? data.connectors : []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const command = useCallback(async (connector, commandName) => {
    const response = await fetch(BASE + "/api/machine-ai/connectors", {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ connector, command: commandName }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "MCP command failed");
    setDetail(data);
    if (commandName === "test" || commandName === "status") await refresh();
    return data;
  }, [refresh]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, Math.max(30000, refreshMs));
    return () => window.clearInterval(timer);
  }, [refresh, refreshMs]);

  return { connectors, loading, error, detail, setDetail, refresh, command };
}
`;
