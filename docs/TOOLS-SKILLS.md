# Open Design — Tools, Skills & Design Systems Reference

## Project Overview

**Open Design** is the open-source alternative to Claude Design. Local-first, web-deployable, BYOK at every layer. 16 coding-agent CLIs auto-detected on PATH, driven by 31 composable Skills and 72 brand-grade Design Systems.

**Version:** 0.7.0 | **License:** Apache 2.0 | **Node:** ~24 | **Package Manager:** pnpm 10.33.2

## Architecture

```
open-design/
├── apps/
│   ├── web/          # Next.js 16 App Router + React 18 UI
│   ├── daemon/       # Local privileged daemon (`od` CLI), /api/*, agent spawning
│   ├── desktop/      # Electron shell
│   └── packaged/     # Thin packaged Electron runtime
├── packages/
│   ├── contracts/    # TypeScript web/daemon API contract layer
│   ├── sidecar-proto/# Sidecar business protocol
│   ├── sidecar/      # Generic sidecar runtime
│   └── platform/     # OS process primitives
├── tools/
│   ├── dev/          # Local dev lifecycle control plane
│   ├── pack/         # Packaged build/start/stop/logs + Mac release
│   └── pr/           # PR-duty control plane (gh wrapper)
├── e2e/              # Playwright UI automation
├── skills/           # 31 composable design skills
├── design-systems/   # 72 brand-grade design systems
├── design-templates/ # Rendering catalogue
├── craft/            # Universal brand-agnostic craft rules
├── specs/            # Feature specifications
├── docs/             # Architecture, contributing, protocols
└── deploy/           # Docker + docker-compose
```

## 16 Supported Agent CLIs

| Agent | Detection | Status |
|---|---|---|
| Claude Code | `claude` on PATH | Primary |
| Codex (OpenAI) | `codex` on PATH | Supported |
| Cursor Agent | `cursor-agent` on PATH | Supported |
| Gemini CLI | `gemini` on PATH | Supported |
| OpenCode | `opencode` on PATH | Supported |
| Qwen CLI | `qwen` on PATH | Supported |
| Qoder CLI | `qoder` on PATH | Supported |
| GitHub Copilot CLI | `copilot` on PATH | Supported |
| Devin for Terminal | `devin` on PATH | Supported |
| Hermes | `hermes` on PATH | Supported |
| Kimi | `kimi` on PATH | Supported |
| Pi | `pi` on PATH | Supported |
| Kiro | `kiro` on PATH | Supported |
| Kilo | `kilo` on PATH | Supported |
| Mistral Vibe | `vibe` on PATH | Supported |
| DeepSeek TUI | `deepseek` on PATH | Supported |
| **BYOK Proxy** | OpenAI-compatible endpoint | Fallback |

## 31 Design Skills

Located in `skills/`:
- **guizang-ppt/** — Magazine-style pitch deck creation with WebGL hero
- **Additional skills** — Layout generation, brand extraction, color palette creation, typography, graphic design, UI components, diagramming, infographic generation, image editing, storyboard creation, landing page design, logo/brandmark generation

Skills use YAML frontmatter for auto-discovery. Each skill can opt into craft rules via `od.craft.requires`.

## Tools (`tools/`)

### `tools/dev` — Development Lifecycle

| Command | Purpose |
|---|---|
| `pnpm tools-dev` | Start all services (daemon + web) |
| `pnpm tools-dev start web` | Start web only |
| `pnpm tools-dev run web --daemon-port X --web-port Y` | Run with custom ports |
| `pnpm tools-dev status --json` | Server status |
| `pnpm tools-dev logs --json` | Server logs |
| `pnpm tools-dev inspect desktop status --json` | Desktop status |
| `pnpm tools-dev inspect desktop screenshot` | Desktop screenshot |
| `pnpm tools-dev stop` | Stop all services |
| `pnpm tools-dev check` | Health check |

### `tools/pack` — Build & Package

| Command | Purpose |
|---|---|
| `pnpm tools-pack mac build --to all` | Build for macOS |
| `pnpm tools-pack mac install` | Install packaged app |
| `pnpm tools-pack mac cleanup` | Clean build artifacts |
| `pnpm tools-pack win build --to nsis` | Build Windows installer |
| `pnpm tools-pack linux build --to appimage` | Build Linux AppImage |
| `pnpm tools-pack linux build --containerized` | Build containerized |

### `tools/pr` — PR Review Control Plane

| Command | Purpose |
|---|---|
| `pnpm tools-pr list` | Triage PR queue |
| `pnpm tools-pr list --bucket=merge-ready` | Filter merge-ready |
| `pnpm tools-pr list --lane=skill` | Filter by lane |
| `pnpm tools-pr view <num>` | PR brief |
| `pnpm tools-pr classify --all` | Tag all PRs |

## Design Systems (72)

Brand-grade design systems in `design-systems/` providing color palettes, typography scales, spacing, and component tokens. Each system is a `DESIGN.md` file defining visual identity rules consumable by skills.

## Craft Rules (`craft/`)

Universal brand-agnostic design quality rules:

| File | Purpose |
|---|---|
| `anti-ai-slop.md` | Anti-generic-design checklist |
| `typography.md` | Typography rules |
| `typography-hierarchy.md` | Hierarchy rules |
| `typography-hierarchy-editorial.md` | Editorial typography |
| `color.md` | Color theory rules |
| `form-validation.md` | Form UX rules |
| `animation-discipline.md` | Animation restraint rules |
| `state-coverage.md` | UI state completeness |
| `accessibility-baseline.md` | WCAG baseline |
| `rtl-and-bidi.md` | RTL/BiDi text handling |
| `laws-of-ux.md` | UX laws reference |

## Key Dependencies

### Core Runtime
- **Language:** TypeScript 5.6+
- **Runtime:** Node.js ~24, pnpm >=10.33.2
- **UI:** Next.js 16, React 18, TailwindCSS
- **Desktop:** Electron
- **Database:** better-sqlite3 (daemon)
- **Deploy:** Docker, Docker Compose, Vercel

### Build & Dev
- `tsx` 4.21 — TypeScript execution
- `esbuild` — Bundling
- `vite` — Web dev server

### Testing
- Playwright — E2E UI testing (in `e2e/`)
- Vitest — Unit/integration testing
- Node test runner — Script testing

## Local Development

```bash
# Install
pnpm install

# Start all services
pnpm tools-dev

# TypeScript checks
pnpm typecheck

# Guard checks (repo policy)
pnpm guard

# Package-scoped commands
pnpm --filter @open-design/web typecheck
pnpm --filter @open-design/web test
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/desktop build
```

## Deployment

### Docker
```bash
cd deploy
cp .env.example .env
docker compose up
```

### Vercel (web only)
The `vercel.json` configures the web app for one-click Vercel deployment.

### Nix/NixOS
Nix modules in `nix/` for package-based deployment on Linux.
