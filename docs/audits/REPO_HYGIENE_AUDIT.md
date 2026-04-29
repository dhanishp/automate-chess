# Repo Hygiene Audit

## 1. Current root directory inventory

Current working-tree note: the three submission docs are untracked at audit time: `HANDSHAKE_SUMMARY.md`, `DEMO_PLAN.md`, and `SUBMISSION_BLURB.md`. Generated local directories are ignored: `.pytest_cache/`, `client/dist/`, `client/node_modules/`, `server/.venv/`, server pytest caches, and Python `__pycache__/`.

| Root item | Recommendation | Notes |
| --- | --- | --- |
| `README.md` | Stay in root | Primary judge/user entry point. Needs a small accuracy pass. |
| `HANDSHAKE_SUMMARY.md` | Stay in root | Submission-facing and useful for judges. |
| `DEMO_PLAN.md` | Stay in root | Submission/demo-facing and easy to find. |
| `SUBMISSION_BLURB.md` | Stay in root | Submission-facing pasteable copy. |
| `DEPLOYMENT.md` | Stay in root | README links to it. Root placement is acceptable for deployment-critical docs. |
| `Dockerfile` | Stay in root | Render/Docker expects root path. |
| `render.yaml` | Stay in root | Render Blueprint discovery is clearest from root. |
| `.dockerignore` | Stay in root | Correct Docker hygiene file. |
| `.gitignore` | Stay in root | Correct Git hygiene file. |
| `Makefile` | Stay in root | Common developer entry point. |
| `run-dev.sh` | Stay in root | Referenced by README; keep unless creating a `scripts/` migration. |
| `run-lan.sh` | Stay in root | Referenced by README; keep unless creating a `scripts/` migration. |
| `run-prod.sh` | Stay in root | Referenced by README/DEPLOYMENT; keep. |
| `Launch Automate Chess.command` | Stay in root or move to `scripts/` | Convenient macOS launcher; no hardcoded personal path. Root is okay but mildly cluttery. |
| `docs/` | Stay | Existing docs home. Should be expanded into `docs/progress/` and `docs/audits/`. |
| `docs/automate_rules.md` | Stay in `docs/` | Current rules reference. |
| `client/` | Stay | Application source. |
| `server/` | Stay | Application source. |
| `AGENTS.md` | Move to `docs/progress/` or update in root | It is stale: says current objective is room-code multiplayer v1. Public readers may be confused. |
| `PROJECT_AUDIT.md` | Move to `docs/audits/` | Stale historical audit with fixed issues still listed as current risks. |
| `CURRENT_STATE_AUDIT.md` | Move to `docs/audits/` | Useful history, but stale and contradictory after stabilization/deployment work. |
| `REPO_HYGIENE_AUDIT.md` | Move to `docs/audits/` after cleanup | Created in root per request; final structure should probably archive it. |
| `BOT_PROGRESS.md` | Move to `docs/progress/` | Historical implementation log. |
| `MULTIPLAYER_PROGRESS.md` | Move to `docs/progress/` | Historical implementation log; partly stale. |
| `OVERNIGHT_PROGRESS.md` | Move to `docs/progress/` | Historical implementation log; internal and noisy. |
| `STABILIZATION_PROGRESS.md` | Move to `docs/progress/` | Useful historical log, not root-facing. |
| `DEPLOYMENT_PROGRESS.md` | Move to `docs/progress/` | Historical log; includes local Docker daemon failure that should not be root-facing. |
| `FRIEND_TEST_POLISH.md` | Move to `docs/progress/` | Historical sprint log. |
| `FINAL_FIXES_PROGRESS.md` | Move to `docs/progress/` | Historical sprint log. |
| `OPEN_ROOMS_PROGRESS.md` | Move to `docs/progress/` | Historical sprint log. |
| `PRODUCTION_READINESS_PROGRESS.md` | Move to `docs/progress/` | Historical sprint log. |
| `.pytest_cache/` | Ignore / optional local delete | Ignored; not tracked. |
| `client/dist/` | Ignore / optional local delete | Ignored build output. Docker rebuilds it. |
| `client/node_modules/` | Ignore / optional local delete | Ignored dependency install. |
| `server/.venv/` | Ignore / optional local delete | Ignored local virtualenv. |
| `server/**/__pycache__/` | Ignore / optional local delete | Ignored Python cache. |

## 2. Markdown file audit

| Markdown file | Purpose | Audience | Current/stale | Recommended final location | Link updates needed |
| --- | --- | --- | --- | --- | --- |
| `README.md` | Primary overview, local/dev/deploy guide | Judges, users, developers | Mostly current; small feature/failure wording edits needed | Root | Keep link to `DEPLOYMENT.md` if it stays root |
| `DEPLOYMENT.md` | Render/Docker deployment guide | Developers/judges testing deploy | Current and useful | Root | None if kept root |
| `HANDSHAKE_SUMMARY.md` | Competition summary | Judges/submission reviewers | Current and polished | Root | None |
| `DEMO_PLAN.md` | 3-minute demo script | Presenter/judges | Current and useful | Root | None |
| `SUBMISSION_BLURB.md` | Short pasteable submission copy | Submission form/judges | Current and polished | Root | None |
| `docs/automate_rules.md` | Ruleset reference | Developers/curious users | Current enough; says "working implementation spec" | `docs/automate_rules.md` | None |
| `AGENTS.md` | Codex working instructions | Internal agent workflow | Stale. It still frames multiplayer v1 as the current objective. | Move to `docs/progress/AGENTS_MULTIPLAYER_SPRINT.md` or replace with updated root agent guidance | None, unless future agents rely on root `AGENTS.md` |
| `PROJECT_AUDIT.md` | Previous project audit | Internal history | Stale. Lists README/multiplayer/Stockfish risks that have since been fixed. | `docs/audits/PROJECT_AUDIT.md` | None |
| `CURRENT_STATE_AUDIT.md` | Later current-state audit | Internal history | Stale after stabilization/deployment/open rooms/readiness work. Contains now-fixed token exposure and deployment blockers. | `docs/audits/CURRENT_STATE_AUDIT.md` | None |
| `REPO_HYGIENE_AUDIT.md` | This audit | Internal cleanup planning | Current at creation time | `docs/audits/REPO_HYGIENE_AUDIT.md` after cleanup | None if not linked |
| `BOT_PROGRESS.md` | Bot sprint log | Internal history | Historical; not judge-facing | `docs/progress/BOT_PROGRESS.md` | None |
| `MULTIPLAYER_PROGRESS.md` | Multiplayer sprint log | Internal history | Historical and partly stale | `docs/progress/MULTIPLAYER_PROGRESS.md` | None |
| `OVERNIGHT_PROGRESS.md` | UI/gameplay progress log | Internal history | Historical and noisy | `docs/progress/OVERNIGHT_PROGRESS.md` | None |
| `STABILIZATION_PROGRESS.md` | Stabilization sprint log | Internal history | Historical; useful but not root-facing | `docs/progress/STABILIZATION_PROGRESS.md` | None |
| `DEPLOYMENT_PROGRESS.md` | Deployment sprint log | Internal history | Historical; contains local Docker failure notes | `docs/progress/DEPLOYMENT_PROGRESS.md` | None |
| `FRIEND_TEST_POLISH.md` | Friend-test polish log | Internal history | Historical | `docs/progress/FRIEND_TEST_POLISH.md` | None |
| `FINAL_FIXES_PROGRESS.md` | Final fixes log | Internal history | Historical; validation counts are now stale | `docs/progress/FINAL_FIXES_PROGRESS.md` | None |
| `OPEN_ROOMS_PROGRESS.md` | Open Rooms sprint log | Internal history | Historical | `docs/progress/OPEN_ROOMS_PROGRESS.md` | None |
| `PRODUCTION_READINESS_PROGRESS.md` | Readiness sprint log | Internal history | Historical; useful but not root-facing | `docs/progress/PRODUCTION_READINESS_PROGRESS.md` | None |

## 3. README audit

README is generally accurate, readable, and useful. It explains the core game loop, local dev, LAN mode, Stockfish, Render deployment, production Docker, tests, and limitations.

Recommended edits:

1. `Current Features` undersells current multiplayer:
   - Change "Private room-code multiplayer over WebSockets" to mention private/public rooms, Open Games, and invite links.
2. `Current Features` should mention:
   - legal placement highlights
   - copyable move/replay notation
   - `/health` and `/ready` readiness checks, or "engine readiness indicator"
   - active live stats, if desired
3. `Stockfish` section has stale failure wording:
   - Current README says solo mode returns a backend error when Stockfish is missing.
   - Current service code stores a failed autoplay state for solo/local/bot as well. Update the sentence to say solo and multiplayer both avoid half-complete replay state; multiplayer broadcasts shared failure state.
4. Known limitations are honest and good. Consider clarifying:
   - "No public matchmaking" does not contradict Open Games; Open Games is a lightweight public room list, not matchmaking.
5. README is concise enough for a challenge repo. It is not too long because deployment details are delegated to `DEPLOYMENT.md`.

## 4. Submission docs audit

Reviewed:

- `HANDSHAKE_SUMMARY.md`
- `DEMO_PLAN.md`
- `SUBMISSION_BLURB.md`

Assessment:

- Clarity: strong. The core loop is understandable: budget, formation, kings last, Stockfish replay.
- Usefulness framing: good. The docs explain what users can actually do.
- Creativity framing: good. The 2022 Chess.com Automate origin story is included clearly without overdramatizing it.
- Execution framing: good. They name solo, bot, multiplayer, Open Games, invite links, highlights, replay controls, deployment, and readiness checks.
- Polish/thoughtfulness framing: good. The demo plan includes setup, things to show, and things to avoid.
- Honesty about limitations: strong. In-memory rooms, single-instance deployment, no accounts, no persistent matchmaking, and local replay controls are all called out.

Suggested minor copy edits only:

- In `HANDSHAKE_SUMMARY.md`, "Solo sandbox" and "Local same-device two-player setup" may overlap. This is acceptable, but could be compressed if desired.
- In `DEMO_PLAN.md`, the "Open/copy the move list if available" line is safe, but if the UI always has it during replay, make it more confident.
- `SUBMISSION_BLURB.md` is concise and competition-ready.

## 5. Deployment docs audit

Reviewed:

- `DEPLOYMENT.md`
- `Dockerfile`
- `render.yaml`
- `run-prod.sh`
- `run-lan.sh`
- `run-dev.sh`

Findings:

- `Dockerfile` is appropriate for Render single-service deployment:
  - builds React/Vite in a Node stage
  - installs Python dependencies
  - installs Debian `stockfish`
  - copies `client/dist`
  - runs Uvicorn on `${PORT:-10000}`
- `render.yaml` is clear and safe:
  - Docker runtime
  - `healthCheckPath: /health`
  - `SERVE_CLIENT_DIST=1`
  - Stockfish path and tuning env vars
  - no secrets
- `DEPLOYMENT.md` is current:
  - distinguishes `/health` from `/ready`
  - explains same-origin REST/WebSockets
  - documents free-tier cold starts
  - documents single-instance limitation
- `run-prod.sh` is minimal and correct for a production-style local run.
- `run-lan.sh` and `run-dev.sh` are useful. `run-dev.sh` has harmless duplicate initial `BACKEND_URL`/`FRONTEND_URL` assignments before env-derived values, but this is not public-facing risk.

No deployment config changes are required for hygiene.

## 6. Generated/ignored files audit

`.gitignore` covers:

- `client/dist/`: yes, via `dist/`
- `node_modules/`: yes
- Python caches: yes, via `__pycache__/` and `*.py[cod]`
- venvs: yes, via `.venv/`, `venv/`, `env/`, `ENV/`
- pytest cache: yes, via `.pytest_cache/`
- macOS files: yes, via `.DS_Store`
- local env files: yes, via `.env` and `.env.*`
- coverage/build cache basics: yes

`.dockerignore` covers:

- `.git`
- Git ignore files
- `client/dist`
- `client/node_modules`
- server virtualenv/cache directories
- Python caches
- `.DS_Store`

Ignored local artifacts currently present:

- `.pytest_cache/`
- `client/dist/`
- `client/node_modules/`
- `server/.pytest_cache/`
- `server/.venv/`
- `server/app/__pycache__/`
- `server/app/game/__pycache__/`
- `server/tests/__pycache__/`

Recommendation:

- No `.gitignore` change is required.
- Optional pre-submission local cleanup: run a dry check with `git clean -Xdn`; then, only if comfortable losing local installs/build outputs, run `git clean -Xdf`. This would remove ignored dependencies/build caches and require reinstalling dependencies later.

## 7. Security/privacy audit

Targeted scan checked for likely API keys, bearer tokens, private keys, env files, personal local paths, and room-token leaks.

Findings:

- No hardcoded API keys, passwords, bearer tokens, private keys, `.env` files, databases, or local personal paths were found in tracked files.
- `render.yaml` contains only non-secret deployment env vars.
- `player_token` appears in source/tests/docs as part of the room access model, not as committed live credentials.
- No generated room codes or real player tokens appear to be committed.
- `CURRENT_STATE_AUDIT.md` and `PROJECT_AUDIT.md` include stale notes about token exposure and deployment blockers. These are not secrets, but they would look alarming/confusing in the public root after those issues have been fixed.

Security-sensitive urgency:

- No urgent secret leak found.
- The cleanup priority is presentation/staleness, not emergency credential removal.

## 8. Recommended final repo structure

Recommended final public structure:

```text
.
├── README.md
├── HANDSHAKE_SUMMARY.md
├── DEMO_PLAN.md
├── SUBMISSION_BLURB.md
├── DEPLOYMENT.md
├── Dockerfile
├── render.yaml
├── Makefile
├── run-dev.sh
├── run-lan.sh
├── run-prod.sh
├── Launch Automate Chess.command
├── client/
├── server/
└── docs/
    ├── automate_rules.md
    ├── audits/
    │   ├── PROJECT_AUDIT.md
    │   ├── CURRENT_STATE_AUDIT.md
    │   └── REPO_HYGIENE_AUDIT.md
    └── progress/
        ├── AGENTS_MULTIPLAYER_SPRINT.md
        ├── BOT_PROGRESS.md
        ├── MULTIPLAYER_PROGRESS.md
        ├── OVERNIGHT_PROGRESS.md
        ├── STABILIZATION_PROGRESS.md
        ├── DEPLOYMENT_PROGRESS.md
        ├── FRIEND_TEST_POLISH.md
        ├── FINAL_FIXES_PROGRESS.md
        ├── OPEN_ROOMS_PROGRESS.md
        └── PRODUCTION_READINESS_PROGRESS.md
```

Alternative if you want the cleanest possible public repo:

- Delete most progress files instead of moving them.
- Keep only `README.md`, `DEPLOYMENT.md`, submission docs, and `docs/automate_rules.md`.
- Keep `REPO_HYGIENE_AUDIT.md` locally or under `docs/audits/`, not root.

## 9. Exact cleanup plan

1. Create folders:
   - `docs/progress/`
   - `docs/audits/`
2. Move audit files:
   - `PROJECT_AUDIT.md` -> `docs/audits/PROJECT_AUDIT.md`
   - `CURRENT_STATE_AUDIT.md` -> `docs/audits/CURRENT_STATE_AUDIT.md`
   - `REPO_HYGIENE_AUDIT.md` -> `docs/audits/REPO_HYGIENE_AUDIT.md` after this audit is reviewed
3. Move progress files:
   - `BOT_PROGRESS.md`
   - `MULTIPLAYER_PROGRESS.md`
   - `OVERNIGHT_PROGRESS.md`
   - `STABILIZATION_PROGRESS.md`
   - `DEPLOYMENT_PROGRESS.md`
   - `FRIEND_TEST_POLISH.md`
   - `FINAL_FIXES_PROGRESS.md`
   - `OPEN_ROOMS_PROGRESS.md`
   - `PRODUCTION_READINESS_PROGRESS.md`
4. Decide what to do with `AGENTS.md`:
   - Best public hygiene: move it to `docs/progress/AGENTS_MULTIPLAYER_SPRINT.md`.
   - Best future-Codex hygiene: keep root `AGENTS.md` but rewrite it so it reflects the current post-submission maintenance state.
5. Keep in root:
   - `README.md`
   - `DEPLOYMENT.md`
   - `HANDSHAKE_SUMMARY.md`
   - `DEMO_PLAN.md`
   - `SUBMISSION_BLURB.md`
   - Docker/Render/scripts/source directories
6. Edit README:
   - add public Open Games and invite links to Current Features
   - add legal placement highlights and copyable move list
   - update the Stockfish failure sentence so solo/local/bot failed autoplay state is not described as a backend error
   - optionally mention `/ready` in Current Features
7. If `DEPLOYMENT.md` stays root:
   - no README link update needed.
8. If `DEPLOYMENT.md` moves to `docs/DEPLOYMENT.md`:
   - update README link from `[DEPLOYMENT.md](DEPLOYMENT.md)` to `[DEPLOYMENT.md](docs/DEPLOYMENT.md)`.
   - This move is optional; root is acceptable.
9. Optional local-only generated cleanup:
   - Run `git clean -Xdn` to preview ignored cleanup.
   - Run `git clean -Xdf` only if you are okay removing local `node_modules`, `.venv`, build output, and caches.
10. Validate after cleanup:
   - `git status --short`
   - `git diff --check`
   - optionally `cd server && .venv/bin/pytest -q`
   - optionally `cd client && npm run build`

Files recommended for deletion:

- None are urgent to delete.
- Optional deletion instead of archival: old progress/audit files if you do not want development history in the public repo.

## 10. Risk assessment

Low-risk cleanup:

- Moving markdown progress/audit files into `docs/progress/` and `docs/audits/`.
- Updating README feature/failure wording.
- Keeping submission docs in root.
- Cleaning ignored generated artifacts, as long as you understand it removes local installs/build output.

Medium-risk cleanup:

- Moving `DEPLOYMENT.md`, because README links must be updated.
- Moving shell scripts into a `scripts/` directory, because README, Makefile, macOS launcher, and user muscle memory would need updates.
- Moving or deleting `AGENTS.md`, because it may affect future Codex behavior in this repo even though it does not affect app runtime.

Build/deployment risk:

- Markdown moves do not affect imports, build, tests, Docker, or Render.
- Do not move `Dockerfile`, `render.yaml`, `client/`, `server/`, or runtime scripts in the final submission cleanup unless you intentionally update references.

Overall recommendation:

- Proceed with a cleanup sprint.
- Prioritize moving stale progress/audit docs out of root and updating README.
- Leave Docker/Render/runtime files where they are.
