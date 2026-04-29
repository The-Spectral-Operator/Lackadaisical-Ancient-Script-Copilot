/**
 * Ollama REST API client with streaming support, retry/backoff, and AbortController.
 * Supports hotswap between any available model (gemma4:e4b, gpt-oss, etc.)
 */

export async function* ollamaChatStream({
  baseUrl, model, messages, tools, format, think, options, keepAlive, signal,
}) {
  const body = {
    model,
    messages,
    stream: true,
    ...(tools && { tools }),
    ...(format !== undefined && { format }),
    ...(think !== undefined && { think }),
    ...(options && { options }),
    ...(keepAlive !== undefined && { keep_alive: keepAlive }),
  };

  const res = await fetchWithRetry(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`ollama ${res.status}: ${text}`);
  }

  const decoder = new TextDecoder('utf-8');
  let buf = '';
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      yield JSON.parse(line);
    }
  }
  if (buf.trim()) yield JSON.parse(buf);
}

export async function ollamaChat({ baseUrl, model, messages, tools, format, think, options, keepAlive }) {
  const body = {
    model,
    messages,
    stream: false,
    ...(tools && { tools }),
    ...(format !== undefined && { format }),
    ...(think !== undefined && { think }),
    ...(options && { options }),
    ...(keepAlive !== undefined && { keep_alive: keepAlive }),
  };

  const res = await fetchWithRetry(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ollama ${res.status}: ${text}`);
  }
  return res.json();
}

export async function ollamaGenerate({ baseUrl, model, prompt, system, format, think, options, images }) {
  const body = {
    model,
    prompt,
    stream: false,
    ...(system && { system }),
    ...(format !== undefined && { format }),
    ...(think !== undefined && { think }),
    ...(options && { options }),
    ...(images && { images }),
  };

  const res = await fetchWithRetry(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ollama ${res.status}: ${text}`);
  }
  return res.json();
}

export async function ollamaEmbed({ baseUrl, model, input }) {
  const res = await fetchWithRetry(`${baseUrl}/api/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, input }),
  });
  if (!res.ok) throw new Error(`ollama embed ${res.status}`);
  return res.json();
}

export async function ollamaVersion(baseUrl) {
  const res = await fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error('ollama unreachable');
  return res.json();
}

export async function ollamaTags(baseUrl) {
  const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error('ollama tags failed');
  return res.json();
}

export async function ollamaShow(baseUrl, model) {
  const res = await fetch(`${baseUrl}/api/show`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: model }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`ollama show ${model} failed`);
  return res.json();
}

/**
 * Fetch with exponential backoff retry for 503 (queue full)
 */
async function fetchWithRetry(url, opts, maxRetries = 6) {
  let delay = 50;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, opts);
    if (res.status !== 503 || attempt === maxRetries) return res;
    await new Promise(r => setTimeout(r, delay));
    delay = Math.min(delay * 2, 1600);
  }
  return fetch(url, opts);
}

export function ollamaFetch(baseUrl) {
  return {
    chatStream: (opts) => ollamaChatStream({ baseUrl, ...opts }),
    chat: (opts) => ollamaChat({ baseUrl, ...opts }),
    generate: (opts) => ollamaGenerate({ baseUrl, ...opts }),
    embed: (opts) => ollamaEmbed({ baseUrl, ...opts }),
    version: () => ollamaVersion(baseUrl),
    tags: () => ollamaTags(baseUrl),
    show: (model) => ollamaShow(baseUrl, model),
  };
}
