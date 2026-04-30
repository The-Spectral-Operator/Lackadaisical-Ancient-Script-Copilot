/**
 * Chat state store — pub/sub closures, no framework.
 */

export function createStore(initialState = {}) {
  let state = { ...initialState };
  const listeners = new Map();

  function get() { return state; }

  function set(patch) {
    const prev = state;
    state = { ...state, ...patch };
    for (const [key, fns] of listeners) {
      if (key === '*' || (patch.hasOwnProperty && patch.hasOwnProperty(key))) {
        for (const fn of fns) fn(state, prev);
      }
    }
  }

  function on(key, fn) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
    return () => listeners.get(key)?.delete(fn);
  }

  return { get, set, on };
}

/** Global chat state */
export const store = createStore({
  sessionId: null,
  sessionTitle: 'New Decipherment Session',
  sessions: [],
  model: 'gemma4:e4b',
  messages: [],          // { role, content, thinking, id, stats }
  isStreaming: false,
  thinkEnabled: true,
  toolsEnabled: true,
  availableModels: [],
  scripts: [],
  activeScript: '',
  ollamaOnline: false,
  ollamaVersion: null,
  streamingMsgId: null,
  pendingThinking: '',
  pendingContent: '',
});
