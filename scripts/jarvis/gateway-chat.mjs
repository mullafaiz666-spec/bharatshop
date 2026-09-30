export async function gatewayChat(task, { baseUrl = process.env.OMNIROUTE_BASE_URL, key = process.env.OMNIROUTE_API_KEY, model = process.env.OMNIROUTE_MODEL, system = '', fetcher = fetch } = {}) {
  if (!baseUrl || !model) throw new Error('Configure OMNIROUTE_BASE_URL and OMNIROUTE_MODEL.');
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('Invalid gateway base URL.');
  if (base.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('Remote gateways require HTTPS.');
  const response = await fetcher(base.href.replace(/\/+$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) },
    body: JSON.stringify({ model, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: task }], stream: false }),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error('Gateway request failed with HTTP ' + response.status);
  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) throw new Error('Gateway returned no text answer.');
  return { answer: answer.trim(), model: typeof data.model === 'string' ? data.model : model };
}
