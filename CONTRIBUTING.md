# Contributing to BrokerBane

Thanks for your interest in helping people remove themselves from data brokers. This project is AGPL-3.0 and welcomes bug reports, broker definitions, and code contributions.

## Ways to contribute

- **Add or fix a broker** — see `data/brokers.yaml`. The most valuable contribution is keeping broker contact details, opt-out URLs, and removal flows accurate as brokers change them.
- **Report a bug** — open an issue with reproduction steps and your environment (Node version, OS, redacted broker name if relevant).
- **Improve docs** — README, GETTING_STARTED, code comments.
- **Submit a code change** — see below.

## Reporting a bug

Open a GitHub issue with:
- What you ran (CLI command or PWA flow)
- What you expected vs. what happened
- Node version and OS
- Logs with PII redacted (BrokerBane redacts PII from logs by default — please double-check before pasting)

**Do not include screenshots or logs containing real personal data.** If a bug is privacy-sensitive, follow `SECURITY.md` instead of opening a public issue.

## Adding or fixing a broker

Brokers live in `data/brokers.yaml`, validated by Zod on load.

1. Find the broker entry (or add a new one) in `data/brokers.yaml`.
2. Verify required fields against the schema in `src/data/brokers.ts`.
3. If the broker offers email-based opt-out, set `methods: [email]` and the appropriate `email` and `template`.
4. If it requires a web form, set `methods: [webform]` and add `webform_hints` describing the natural-language steps Stagehand should follow.
5. Run `npm test -- brokers` to validate the YAML.
6. Open a PR with a one-line summary of what you changed and how you verified it.

For a brand-new broker, please cite where you found the opt-out contact (broker's privacy policy URL preferred).

## Development setup

Requirements: Node.js 20+, npm.

```bash
git clone https://github.com/Tranquil-Flow/broker-bane
cd broker-bane
npm install
npm run build
npm test
```

Useful commands:
- `npm test` — run the full vitest suite
- `npm run lint` — typecheck only (no emit)
- `npm run dev -- <command>` — run the CLI from source via tsx

## Pull requests

- Keep PRs focused — one logical change per PR
- Include tests for new logic, especially anything in `src/pipeline/`, `src/email/`, or `src/inbox/`
- Run `npm test` and `npm run lint` locally before pushing
- PII must never appear in tests or fixtures — use `example.com`, fake names, etc.
- Don't commit secrets, real broker credentials, or anything from your local config

## Code style

- TypeScript strict mode, ESM modules
- Prefer Zod schemas at boundaries (config files, broker YAML, API responses)
- No `any` without justification
- Match the existing patterns in nearby files

## License

By contributing, you agree your contributions are licensed under AGPL-3.0, the same license as the project.
