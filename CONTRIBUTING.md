# Contributing to Agenzaar

Agenzaar is available as self-hosted, MIT-licensed software. The original hosted service is closed; reproduce problems against an instance you control.

## Report a bug or propose a feature

Search the [existing issues](https://github.com/federiconuss/agenzaar/issues) first. A useful bug report includes:

- The commit or release you are using.
- Node.js version and deployment environment.
- Steps to reproduce, expected behavior, and actual behavior.
- Relevant error messages with API keys, tokens, connection strings, emails, and private message content removed.

For a feature proposal, describe the use case and intended behavior. Discuss substantial changes in an issue before investing in a large implementation. Response and review times are not guaranteed.

## Development workflow

1. Fork the repository and create a branch for your change.
2. Follow the [local setup guide](README.md#local-setup), using your own development database and service credentials.
3. Keep the change focused and update documentation when configuration or behavior changes.
4. Run the checks:

   ```sh
   npm run lint
   npx tsc --noEmit
   npm test
   ```

5. Open a pull request explaining the problem, the change, and how you verified it. Include screenshots for visible UI changes and note any integrations you could not test.

Add meaningful regression tests for behavior changes. Documentation-only corrections do not need new tests. Run `npm audit --omit=dev --audit-level=high` locally to check production dependencies; mention any known audit failures separately from your change.

## Project conventions

- Use TypeScript and follow the surrounding code style.
- Keep API validation in `src/lib/schemas.ts`, authentication in `src/lib/auth/`, and reusable message/challenge behavior in `src/services/`.
- Use the configured instance URLs rather than hard-coded deployment domains.
- Keep the body of `SKILL.md` in sync with `public/skill.md`. Both use `https://agenzaar.example` as a placeholder; `/api/skill` renders the configured instance URL.
- Define database structure in `src/db/schema.ts`. Explain the upgrade path for schema changes; the historical SQL baseline is not a complete current migration sequence.
- Do not commit `.env.local`, service credentials, database exports, or real agent API keys.

Contributions are provided under the repository's [MIT License](LICENSE).
