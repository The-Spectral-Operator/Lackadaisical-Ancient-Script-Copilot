# Support

## Getting Help

### Documentation

- **[Architecture](decipher-copilot/docs/ARCHITECTURE.md)** — system design, data flow, component relationships
- **[Build Guide](decipher-copilot/docs/BUILD.md)** — prerequisites, build commands, troubleshooting
- **[Security](decipher-copilot/docs/SECURITY.md)** — encryption, auth, threat model
- **[Ollama Notes](decipher-copilot/docs/OLLAMA_NOTES.md)** — model recommendations, configuration, performance tuning
- **[Decipherment Methods](decipher-copilot/docs/DECIPHERMENT_METHODS.md)** — statistical methods, algorithms, academic references

### Common Issues

| Problem | Solution |
|---------|----------|
| "Ollama not running" error | Run `ollama serve` in a separate terminal |
| Model not found | Run `ollama pull gemma4:e4b` (or your chosen model) |
| Port 7340 in use | Set `PORT=7341` environment variable |
| Database locked | Ensure only one server instance is running |
| Native module build failure | Install Visual Studio Build Tools 2022 and run `npm rebuild` |
| High memory usage | Use a smaller model (gemma4:e2b) or reduce `num_ctx` in settings |

### Reporting Bugs

Open a [GitHub Issue](../../issues/new) with:
- OS and version (Windows 10/11, Linux distro)
- Node.js version (`node --version`)
- Ollama version (`ollama --version`)
- Model being used
- Steps to reproduce
- Relevant log output from `data/logs/`

### Feature Requests

Open a [GitHub Issue](../../issues/new) with the "enhancement" label. Include:
- What you're trying to accomplish
- Which ancient script(s) this relates to
- How this would improve your research workflow

### Security Vulnerabilities

**Do not open a public issue.** See [SECURITY.md](decipher-copilot/docs/SECURITY.md) for responsible disclosure.

### Community

- [GitHub Discussions](../../discussions) — questions, ideas, show-and-tell
- [Issues](../../issues) — bug reports and feature requests

## Supported Platforms

| Platform | Status |
|----------|--------|
| Windows 10/11 x64 | Primary (full native build) |
| Linux x64 (Ubuntu 22.04+) | Supported (Node tier; C core optional) |
| macOS x64/ARM64 | Supported (Node tier; C core optional) |
| WSL2 | Supported |

## Model Compatibility

Any Ollama-compatible model works. Recommended:

| Use Case | Model | VRAM |
|----------|-------|------|
| General decipherment | `gemma4:e4b` | ~4 GB |
| Vision/OCR | `gemma4:e4b` or `llama3.2-vision:11b` | 4-8 GB |
| Deep reasoning | `gemma4:e12b` or `phi-4-reasoning:14b` | 8-12 GB |
| Embeddings | `nomic-embed-text` | ~1 GB |
| Maximum capability | `gemma4:e27b` | 16+ GB |

---

*Lackadaisical Security — Merit-based. Receipts over rhetoric.*
