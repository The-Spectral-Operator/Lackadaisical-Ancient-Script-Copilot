/**
 * Separates `message.thinking` from `message.content` in Ollama streaming responses.
 * Handles both boolean think mode and gpt-oss string levels.
 */
export class ThinkParser {
  constructor() {
    this.thinkingBuffer = '';
    this.contentBuffer = '';
    this.inThinking = false;
  }

  processChunk(frame) {
    const msg = frame.message || {};
    const result = { thinking: null, content: null, toolCalls: null, done: frame.done || false };

    if (msg.thinking) {
      this.thinkingBuffer += msg.thinking;
      result.thinking = msg.thinking;
    }

    if (msg.content) {
      this.contentBuffer += msg.content;
      result.content = msg.content;
    }

    if (msg.tool_calls) {
      result.toolCalls = msg.tool_calls;
    }

    if (frame.done) {
      result.stats = {
        total_duration: frame.total_duration,
        load_duration: frame.load_duration,
        prompt_eval_count: frame.prompt_eval_count,
        prompt_eval_duration: frame.prompt_eval_duration,
        eval_count: frame.eval_count,
        eval_duration: frame.eval_duration,
        done_reason: frame.done_reason,
      };
    }

    return result;
  }

  getFullThinking() { return this.thinkingBuffer; }
  getFullContent() { return this.contentBuffer; }
}
