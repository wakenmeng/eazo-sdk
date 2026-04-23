import OpenAI from "openai";
import { getApiBase } from "../config";

// ---------------------------------------------------------------------------
// Private key storage
// ---------------------------------------------------------------------------

let privateKey: string | null = null;

function setPrivateKey(key: string): void {
  privateKey = key;
}

function getPrivateKey(): string | null {
  if (privateKey) return privateKey;
  if (typeof process !== "undefined" && process.env.EAZO_PRIVATE_KEY) {
    return process.env.EAZO_PRIVATE_KEY;
  }
  return null;
}

function buildClient(): OpenAI {
  const key = getPrivateKey();
  if (!key) {
    throw new Error(
      "@eazo/sdk: missing private key. Set EAZO_PRIVATE_KEY env var or call ai.configure({ privateKey }).",
    );
  }
  return new OpenAI({
    baseURL: `${getApiBase()}/v1`,
    apiKey: key,
  });
}

// Re-export openai types so callers don't need to install openai separately
export type { ChatCompletion, ChatCompletionChunk } from "openai/resources/chat/completions";
export type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";

// ---------------------------------------------------------------------------
// chat() — extracted so TypeScript overloads work (not valid inside object literals)
// ---------------------------------------------------------------------------

/**
 * Send a chat completion request to the built-in AI (AWS Bedrock via bedrock-mantle).
 *
 * Uses the official `openai` package under the hood — all parameter types are
 * identical to the OpenAI SDK. The response is returned as-is in OpenAI standard
 * format, including streaming chunks.
 *
 * @example Non-streaming
 * ```ts
 * const result = await ai.chat({
 *   model: 'deepseek.v3.1',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * console.log(result.choices[0].message.content);
 * ```
 *
 * @example Streaming
 * ```ts
 * const stream = await ai.chat({
 *   model: 'deepseek.v3.1',
 *   messages: [{ role: 'user', content: 'Tell me a story.' }],
 *   stream: true,
 * });
 * for await (const chunk of stream) {
 *   process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
 * }
 * ```
 *
 * @example Function calling
 * ```ts
 * const result = await ai.chat({
 *   model: 'deepseek.v3.1',
 *   messages: [{ role: 'user', content: 'What is the weather in Shanghai?' }],
 *   tools: [{ type: 'function', function: { name: 'get_weather', description: '...', parameters: {...} } }],
 *   tool_choice: 'auto',
 * });
 * ```
 */
async function chat(
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
): Promise<OpenAI.Chat.ChatCompletion>;
async function chat(
  params: OpenAI.Chat.ChatCompletionCreateParamsStreaming,
): Promise<AsyncIterable<OpenAI.Chat.ChatCompletionChunk>>;
async function chat(
  params:
    | OpenAI.Chat.ChatCompletionCreateParamsNonStreaming
    | OpenAI.Chat.ChatCompletionCreateParamsStreaming,
): Promise<OpenAI.Chat.ChatCompletion | AsyncIterable<OpenAI.Chat.ChatCompletionChunk>> {
  const client = buildClient();

  if ((params as OpenAI.Chat.ChatCompletionCreateParamsStreaming).stream) {
    // openai SDK Stream is itself an AsyncIterable<ChatCompletionChunk>
    return client.chat.completions.create(
      params as OpenAI.Chat.ChatCompletionCreateParamsStreaming,
    ) as Promise<AsyncIterable<OpenAI.Chat.ChatCompletionChunk>>;
  }

  return client.chat.completions.create(
    params as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const ai = {
  /**
   * Configure the private key for AI requests.
   * Alternative to setting the EAZO_PRIVATE_KEY environment variable.
   */
  configure(opts: { privateKey: string }): void {
    setPrivateKey(opts.privateKey);
  },

  chat,
};
