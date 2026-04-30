# Contributing to Ancient Script Decipherment Copilot

Thank you for your interest in contributing! This project aims to build the most capable local AI copilot for ancient script decipherment research.

## How to Contribute

### Reporting Issues

- Use [GitHub Issues](../../issues) to report bugs or request features
- Include your OS, Node.js version, Ollama version, and model being used
- For bugs, include steps to reproduce and relevant log output from `data/logs/`
- For dataset issues, specify which script/lexicon file is affected

### Submitting Changes

1. **Fork** the repository
2. **Create a branch** from `main` (`git checkout -b feature/your-feature`)
3. **Make your changes** following the guidelines below
4. **Test** your changes (see Testing section)
5. **Commit** with clear, descriptive messages
6. **Push** to your fork and open a Pull Request

### Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include a clear description of what changed and why
- Update documentation if your change affects user-facing behavior
- Ensure all existing tests pass
- Add tests for new functionality

## Development Setup

### Prerequisites

- Node.js 22.13 LTS
- Ollama >= 0.16.0
- (Optional) Visual Studio Build Tools 2022 + NASM 2.16 for C core engine
- (Optional) CMake 3.28 for native builds

### Getting Started

```bash
git clone https://github.com/Lackadaisical-Security/Lackadaisical-Ancient-Script-Copilot
cd Lackadaisical-Ancient-Script-Copilot/decipher-copilot/server
npm install
node src/index.js
```

### Project Structure

| Directory | Purpose |
|-----------|---------|
| `server/src/` | Node.js backend (HTTP, WebSocket, Ollama client, DB) |
| `server/src/tools/` | LLM-callable analysis tools |
| `server/src/ollama/` | Ollama REST API client and parsers |
| `server/migrations/` | SQL schema migrations |
| `webui/` | Vanilla JS frontend (zero frameworks) |
| `core/` | C17/C++20/NASM native engine |
| `datasets/` | Ancient script lexicon JSON/CSV files |
| `docs/` | Architecture, build, security documentation |

## Coding Standards

### JavaScript (Server + WebUI)

- ESM modules (`import`/`export`) throughout
- No TypeScript — plain JS with JSDoc annotations for type hints
- No external frameworks (server uses `node:http` + `ws`, UI is vanilla)
- No CDN imports — all vendor code is vendored locally
- No `eval()`, `Function()`, or dynamic code execution
- No telemetry, analytics, or external network calls
- Use `node:crypto` for all random/hash operations
- Error handling: never swallow errors silently; log via pino

### C/C++ (Core Engine)

- C17 standard for core modules, C++20 for facade layer
- MSVC `/W4` clean (or `-Wall -Wextra -Wpedantic` on clang/gcc)
- All public API functions prefixed with `dc_`
- Memory: explicit ownership, no shared mutable state
- Error handling via `dc_status_t` return codes
- NASM x86-64 with MS x64 calling convention

### CSS/HTML (WebUI)

- No CSS frameworks — custom design tokens in `tokens.css`
- Semantic HTML with ARIA attributes for accessibility
- Dark theme via `prefers-color-scheme` media query
- No inline styles or inline scripts

## Testing

### Server Tests

```bash
cd decipher-copilot/server
npm test
```

### Native Core Tests (requires CMake build)

```bash
cmake --preset windows-release
cmake --build --preset windows-release
ctest --preset windows-release
```

### Verify No Telemetry

```powershell
pwsh scripts/verify_no_telemetry.ps1
```

## Adding Ancient Script Datasets

We welcome contributions of new lexicon datasets! To add a new script:

1. Create a JSON file in `datasets/` following the existing format
2. Include metadata: script name, era, region, sources
3. Each entry needs: `token`, `gloss` (if known), `confidence`, `source`
4. Use established sign-ID conventions for the script
5. Cite your sources (publication, inscription ID, etc.)
6. The dataset importer auto-detects format on server startup

### Dataset Format Example

```json
{
  "metadata": {
    "script": "Script Name",
    "version": "1.0",
    "sources": ["Publication 2025", "Corpus reference"]
  },
  "entries": [
    { "token": "SIGN-01", "gloss": "proposed reading", "confidence": 0.7, "source": "HT 31" }
  ]
}
```

## Areas We Need Help With

- **New script datasets** — especially undeciphered scripts with published sign inventories
- **Statistical analysis methods** — new decipherment algorithms and metrics
- **Vision model testing** — evaluating glyph transcription accuracy across models
- **Documentation** — tutorials, guides for specific scripts, API examples
- **Accessibility** — screen reader testing, keyboard navigation improvements
- **Cross-platform testing** — Linux/macOS builds, ARM64 support

## Security

- Never commit secrets, tokens, or keys
- Report security vulnerabilities privately (see SECURITY.md)
- All contributions are scanned for forbidden patterns (telemetry, external calls)
- Review `scripts/verify_no_telemetry.ps1` for the full blocklist

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (see LICENSE file).

## Questions?

Open a [Discussion](../../discussions) for questions about architecture, decipherment methods, or how to get started with a specific area of the codebase.

---

*Lackadaisical Security — Merit-based. Receipts over rhetoric.*
