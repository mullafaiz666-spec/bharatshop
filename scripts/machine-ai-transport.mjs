import { AsyncLocalStorage } from 'node:async_hooks';
const inferenceScope = new AsyncLocalStorage();
export const withInferenceScope = (signal, fn) => inferenceScope.run(signal, fn);
import http from 'node:http';
import { Readable } from 'node:stream';

// Native HTTP avoids a second, hidden fetch header deadline on slow local inference.
// No retries: replaying a generation can duplicate work and exhaust laptop memory.
export function inferenceFetch(input, options = {}) {
  const url = new URL(input);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('Local inference requires a loopback HTTP endpoint.');
  }
  return new Promise((resolve, reject) => {
    const scopedSignal = inferenceScope.getStore();
    const signal = scopedSignal && options.signal ? AbortSignal.any([scopedSignal, options.signal]) : scopedSignal || options.signal;
    let settled = false;
    const request = http.request(url, {
      method: options.method || 'GET', headers: options.headers,
      signal, agent: false,
    }, incoming => {
      const abortIncoming = () => incoming.destroy(Object.assign(new Error('Local inference cancelled.'), { name: 'AbortError', code: 'ABORT_ERR' }));
      signal?.addEventListener('abort', abortIncoming, { once: true });
      incoming.once('close', () => signal?.removeEventListener('abort', abortIncoming));
      const response = new Response(Readable.toWeb(incoming), {
        status: incoming.statusCode,
        headers: Object.fromEntries(Object.entries(incoming.headers).filter(([,v]) => v !== undefined).map(([k,v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)])),
      });
      settled = true;
      resolve(response);
    });
    request.on('error', error => { if (!settled) reject(error); });
    request.end(options.body);
  });
}

export function chatError(error) {
  const code = error?.cause?.code || error?.code || error?.name;
  if (['ABORT_ERR', 'AbortError', 'TimeoutError', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'].includes(code)) {
    return 'Local inference timed out or was cancelled. Try a shorter message and check Ollama memory usage. No action was retried.';
  }
  if (['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET'].includes(code)) {
    return `Ollama connection failed (${code}). Check that Ollama is running and that the model has not crashed.`;
  }
  // Do not expose request URLs, headers, credentials or arbitrary upstream bodies.
  if (error?.safeChatError) return error.message;
  return 'Chat failed. The local server could not finish the request; no completion is confirmed.';
}

export function safeError(message) {
  const error = new Error(message);
  error.safeChatError = true;
  return error;
}

export async function readOllamaStream(response, emit) {
  if (!response.body) throw safeError('Ollama returned no response body.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', full = '', complete = false;
  function parse(line) {
    if (!line.trim()) return;
    let packet;
    try { packet = JSON.parse(line); }
    catch { throw safeError('Ollama returned malformed stream data.'); }
    if (packet.error) throw safeError('Ollama reported a generation error. Check its local logs and model availability.');
    const text = String(packet.message?.content || '');
    if (text) { full += text; emit({ type: 'delta', text }); }
    if (packet.done === true) {
      complete = true;
      emit({ type: 'meta', totalDuration: packet.total_duration || null });
    }
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
      }
      if (buffer.length > 2_000_000) throw safeError('Ollama stream frame exceeded the safety limit.');
    }
    buffer += decoder.decode();
    parse(buffer);
    if (!complete) throw safeError('Ollama disconnected before completing the answer. Any text shown is partial.');
    if (!full.trim()) throw safeError('Ollama completed without an answer. Check the selected model.');
    return full;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
