/**
 * WebSocket client with automatic reconnection and heartbeat.
 */
export function createWsClient({ url, onThinking, onContent, onToolCall, onDone, onError }) {
  let socket = null;
  let reconnectTimer = null;
  let pingTimer = null;
  let connected = false;

  function connect() {
    try {
      socket = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      connected = true;
      // Auth
      socket.send(JSON.stringify({ type: 'auth', token: 'local' }));
      // Start heartbeat
      pingTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping', t: Date.now() }));
        }
      }, 25000);
    };

    socket.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data);
        handleFrame(frame);
      } catch { /* ignore */ }
    };

    socket.onclose = () => {
      connected = false;
      clearInterval(pingTimer);
      scheduleReconnect();
    };

    socket.onerror = () => {
      connected = false;
    };
  }

  function handleFrame(frame) {
    switch (frame.type) {
      case 'chat.thinking.delta':
        onThinking?.(frame.delta);
        break;
      case 'chat.content.delta':
        onContent?.(frame.delta);
        break;
      case 'chat.tool_call':
        onToolCall?.(frame.name, frame.arguments);
        break;
      case 'chat.done':
        onDone?.(frame.stats);
        break;
      case 'error':
        onError?.(frame);
        break;
      case 'model.switched':
        console.log(`Model switched to: ${frame.model}`);
        break;
    }
  }

  function send(data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 3000);
  }

  function isConnected() { return connected; }

  connect();
  return { send, isConnected };
}
