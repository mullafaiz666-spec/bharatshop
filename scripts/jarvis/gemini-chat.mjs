const DEFAULT_MODEL = 'gemini-2.5-flash';

export async function geminiChat(task, { key = process.env.GEMINI_API_KEY, model = DEFAULT_MODEL, fetcher = fetch } = {}) {
  if (!key) throw new Error('Gemini chat selected but GEMINI_API_KEY is missing. No hosted request was sent.');
  if (!/^gemini-[a-z0-9.-]+$/i.test(model)) throw new Error('Invalid Gemini model name.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const response = await fetcher(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: 'You are Jarvis. Answer the current user request directly. Earlier assistant output may be unverified. Never claim that you inspected files, browsed, changed code, or ran checks unless tool output was provided. If evidence is missing, say so.' }] },
      contents: [{ role: 'user', parts: [{ text: task }] }],
      generationConfig: { maxOutputTokens: 2048 },
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error(`Gemini request failed with HTTP ${response.status}; check key, quota and model. No local fallback was silently used.`);
  const result = await response.json();
  const answer = result.candidates?.[0]?.content?.parts?.filter(part => typeof part.text === 'string').map(part => part.text).join('\n').trim();
  if (!answer) throw new Error('Gemini returned no text answer.');
  return answer;
}
