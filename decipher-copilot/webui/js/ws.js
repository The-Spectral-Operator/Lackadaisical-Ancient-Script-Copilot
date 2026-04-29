/**
 * WebSocket client with reconnect, heartbeat, and full protocol frame handling.
 */
export function createWsClient({ url, onReady, onThinking, onContent, onToolCall, onToolResult, onDone, onCancelled, onError }) {
  let socket = null;
  let reconnectTimer = null;
  let pingTimer = null;
  let connected = false;
  let currentMessageId = null;

  function connect() {
    try { socket = new WebSocket(url); } catch { scheduleReconnect(); return; }

    socket.onopen = () => {
      connected = true;
      socket.send(JSON.stringify({ type: 'auth', token: 'local' }));
      pingTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping', t: Date.now() }));
      }, 25000);
    };

    socket.onmessage = (event) => {
      try { handleFrame(JSON.parse(event.data)); } catch { /* ignore */ }
    };

    socket.onclose = () => {
      connected = false;
      clearInterval(pingTimer);
      scheduleReconnect();
    };

    socket.onerror = () => { connected = false; };
  }

  function handleFrame(frame) {
    switch (frame.type) {
      case 'ready':
        onReady?.(frame);
        break;
      case 'auth.ok':
        break;
      case 'pong':
        break;
      case 'chat.thinking.delta':
        currentMessageId = frame.message_id;
        onThinking?.(frame.delta);
        break;
      case 'chat.content.delta':
        currentMessageId = frame.message_id;
        onContent?.(frame.delta);
        break;
      case 'chat.tool_call':
        onToolCall?.(frame.name, frame.arguments);
        break;
      case 'chat.tool_result':
        onToolResult?.(frame.name, frame.result);
        break;
      case 'chat.done':
        onDone?.(frame.message_id, frame.model, frame.stats);
        currentMessageId = null;
        break;
      case 'chat.cancelled':
        onCancelled?.();
        currentMessageId = null;
        break;
      case 'model.switched':
        console.log(`Model hotswapped to: ${frame.model}`);
        break;
      case 'pull.progress': {
        const prog = document.getElementById('pull-progress');
        if (prog) {
          if (frame.total > 0) {
            const pct = ((frame.completed / frame.total) * 100).toFixed(1);
            prog.textContent = `${frame.status}: ${pct}%`;
          } else {
            prog.textContent = frame.status;
          }
        }
        break;
      }
      case 'error':
        onError?.(frame.code, frame.message);
        break;
    }
  }

  function send(data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, 3000);
  }

  function isConnected() { return connected; }
  function close() { clearInterval(pingTimer); clearTimeout(reconnectTimer); socket?.close(); }

  connect();
  return { send, isConnected, close };
}
