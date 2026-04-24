const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
const MODEL = 'deepseek/deepseek-chat'

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function chatCompletion(messages: Message[]): Promise<string> {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    },
    body: JSON.stringify({ model: MODEL, messages }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenRouter error ${res.status}: ${err}`)
  }

  const data = await res.json()
  return data.choices[0].message.content as string
}

export async function streamCompletion(messages: Message[]): Promise<Response> {
  return fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    },
    body: JSON.stringify({ model: MODEL, messages, stream: true }),
  })
}
