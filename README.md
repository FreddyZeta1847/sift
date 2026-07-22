<p align="center">
  <h1 align="center">sift</h1>
  <p align="center"><b>RSS in, LinkedIn drafts out.</b></p>
  <p align="center">A self-hosted pipeline that turns your RSS feeds into ready-to-review LinkedIn post drafts, in your own voice, on autopilot — you always review and post manually, sift never publishes for you.</p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-black?style=for-the-badge&logo=next.js&logoColor=white" />
  <img src="https://img.shields.io/badge/typescript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" />
</p>

## What it does

sift watches a set of RSS feeds you configure (arXiv, Hacker News, cybersecurity and robotics sources, or anything else with a feed), and once a day runs the whole chain automatically:

1. **Ingestion** — pulls new items from your configured RSS sources.
2. **Curation** — an LLM ranks and filters them down to the top 3 most interesting.
3. **Draft generation** — an LLM writes 3 LinkedIn post drafts, in a voice profile you define, plus a matching image-generation prompt for each.
4. **Review** — you open sift's web UI, read the run's drafts, inline-edit or discard them, and mark one as posted once you've copied it to LinkedIn yourself.

The whole run is triggered by an in-process scheduler on the day/time you configure, with a 24-hour missed-run catch-up check on server startup (so a slot missed to downtime still fires once you're back up), plus a manual "Run Now" button for whenever you don't want to wait.

A separate 3-page settings app (API Config, Settings, Costs) lets you assign an LLM provider/model per pipeline stage, manage RSS sources, set the schedule and voice profile, configure post-retention, and cap total LLM spend with a running cost history. Everything — candidate dedup, the post archive, per-call cost logging, and a full run log — is persisted to SQLite via Drizzle ORM.

sift is LLM-provider-agnostic: it supports Anthropic's API directly and any OpenAI-compatible endpoint via a configurable `baseUrl`, so you aren't locked into one vendor.

## Quick Start (Docker)

```bash
git clone https://github.com/FreddyZeta1847/sift.git
cd sift
docker compose up -d
```

That's it — no API key, no `.env` file, no config required to boot. `docker-compose.yml` builds the image locally from the repo's `Dockerfile` (there's no registry image yet), and Compose already sets sensible defaults for `SIFT_DB_PATH`/`SIFT_CONFIG_DIR`.

Open **http://localhost:3000**. Enter your LLM provider's API key(s) in the app's **Config UI → API Config** page — never as an environment variable — and you're fully set up.

A `.env` file is optional: `.env.example` documents `SIFT_DB_PATH` and `SIFT_CONFIG_DIR`, both already defaulted correctly for the Docker path. It only matters if you want to override those paths without editing `docker-compose.yml` directly.

### Data persistence

`data/` and `config/` are mounted as two separate Docker volumes:

```yaml
volumes:
  - ./data:/app/data
  - ./config:/app/config
```

They're kept separate deliberately — `data/` is generated history (the database, run logs, cost logs), `config/` is user-authored configuration (sources, schedule, voice profile, provider settings). You can back up or reset one without touching the other.

To upgrade: `git pull && docker compose up -d --build` (until a registry image exists; once it does, this becomes `docker compose pull && docker compose up -d`). Either way it's safe — your history and settings live outside the container.

## Non-Docker path

```bash
npm ci
npm run build
npm start
```

Same zero-config first run: database migrations run automatically on server startup either way.

> [!WARNING]
> **`better-sqlite3` is a native Node addon.** `npm ci` will either download a prebuilt binary for your platform or compile one from source via `node-gyp`, which requires Python and a C++ compiler already installed. **This is the most common cause of a broken first install, especially on Windows**, which doesn't ship that toolchain by default (macOS and Linux usually fare better). If `npm ci` fails with a `node-gyp` or MSVC-style error, this is why — install Visual Studio Build Tools (the "Desktop development with C++" workload) and retry.

For repeated local development, `npm link` (or `npm install -g .`) once registers a `sift-server` global command that runs the dev server from any directory — a convenience for people already comfortable with the Node toolchain, not part of the main quick-start flow.

## Configuring an LLM provider

The easiest path: on the **API Config** page, use the **"Quick add a known provider"** dropdown
above the add-provider form — pick Anthropic, OpenAI, Google Gemini, NVIDIA NIM, OpenRouter, or
DeepSeek, and it pre-fills the Base URL and Kind for you. Paste an API key, pick a model, and
assign it to the Curation/Drafting stages.

For anything else (or to understand what the quick-add is actually doing), add a provider
manually (ID, Label, Base URL, API key, Kind). Two provider "Kind" values exist, and the
difference matters:

- **`anthropic`** — Anthropic's own API specifically. `Base URL` is ignored for this kind (the
  underlying SDK always talks to Anthropic's own endpoint) — enter any placeholder value, only
  the API key matters.
- **`openai-compatible`** — everything else. A growing number of providers (OpenAI itself, and
  many third-party hosts) expose an endpoint that speaks the same request/response shape as
  OpenAI's Chat Completions API — if a provider advertises "OpenAI-compatible" or "drop-in OpenAI
  replacement," this is the Kind to use, with their real Base URL.

| Provider | Kind | Base URL | Get a key | Notes |
|---|---|---|---|---|
| Anthropic | `anthropic` | *(ignored, see above)* | [console.anthropic.com](https://console.anthropic.com) | Pay-as-you-go, no free tier |
| OpenAI | `openai-compatible` | `https://api.openai.com/v1` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | |
| Google Gemini | `openai-compatible` | `https://generativelanguage.googleapis.com/v1beta/openai` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Has a genuine free tier |
| NVIDIA NIM | `openai-compatible` | `https://integrate.api.nvidia.com/v1` | [build.nvidia.com](https://build.nvidia.com) | Free tier, but a shared endpoint — latency/reliability varies noticeably by model |
| OpenRouter | `openai-compatible` | `https://openrouter.ai/api/v1` | [openrouter.ai/keys](https://openrouter.ai/keys) | Aggregates many underlying models behind one key |
| DeepSeek | `openai-compatible` | `https://api.deepseek.com` | [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) | |

**A real gotcha worth knowing before you pick a model**: many current models are "reasoning"
models that spend a chunk of their output-token budget on hidden reasoning before writing any
visible answer — sometimes 90%+ of the budget on a small prompt. If a model's responses come back
truncated or empty, it's very often this, not a broken key or endpoint — the fix is a larger
`max_tokens` budget, not a different provider. Always confirm a model actually works with
**"Test this model"** before assigning it to a pipeline stage; a working key/endpoint can still
report a failure if the model itself can't produce usable output in the available budget.

**Model names aren't listed here on purpose** — every provider adds and retires models over time,
so a hardcoded list here would go stale. Check the provider's own docs or dashboard for current
model ids, then use the **"Test this model"** button on the API Config page before assigning it to
a pipeline stage — it makes one real call and tells you immediately whether the id/key/endpoint
actually work together, rather than finding out during a real run.

## Security — no built-in authentication

**sift has no login system.** This is a deliberate design choice for a single self-hoster running a local instance, not an oversight. Anyone who can reach the app — a VPS, a NAS with a forwarded port, a reverse-proxied subdomain — can open the Config UI and view or replace your API keys with zero barrier.

**Only run sift on a trusted local network.** If you expose it beyond that, put your own authentication or reverse-proxy in front of it first. See [`SECURITY.md`](./SECURITY.md) for the vulnerability-reporting process.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for local dev setup, the Drizzle migration workflow, and the pre-PR checklist.

## License

MIT — see [`LICENSE`](./LICENSE).
