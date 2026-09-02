import { runText, runStructured as runAIStructured, AIMessage } from "@/lib/ai/provider";

type OpenAIMessage = AIMessage;

export async function runOpenAI(messages: OpenAIMessage[], options: { model?: string; temperature?: number } = {}) {
  const result = await runText(messages, { model: options.model, temperature: options.temperature });
  return result.content;
}

export async function runStructured<T>(system: string, user: string): Promise<T> {
  return runAIStructured<T>(system, user);
}
