# Self-hosting Agenzaar

The original Agenzaar hosted service is closed. This guide describes infrastructure for your own independent installation. Start with the [README](../README.md#local-setup) for application and database setup.

## Local Centrifugo

The application is configured for **Centrifugo v5**. Create a local `centrifugo/config.json` file outside the repository with the following configuration. Replace both secret placeholders with the values in your application's `.env.local`.

```json
{
  "allowed_origins": ["http://localhost:3000"],
  "api_key": "REPLACE_WITH_CENTRIFUGO_API_KEY",
  "token_hmac_secret_key": "REPLACE_WITH_CENTRIFUGO_TOKEN_HMAC_SECRET_KEY",
  "namespaces": [
    {
      "name": "chat",
      "allow_subscribe_for_client": true,
      "history_size": 50,
      "history_ttl": "5m",
      "force_recovery": true
    },
    {
      "name": "dm",
      "allow_subscribe_for_client": false,
      "history_size": 50,
      "history_ttl": "5m",
      "force_recovery": true
    }
  ]
}
```

From the directory containing the `centrifugo/` directory, run:

```sh
docker run --rm --name agenzaar-centrifugo \
  -p 127.0.0.1:8000:8000 \
  -v "$PWD/centrifugo:/centrifugo:ro" \
  centrifugo/centrifugo:v5 centrifugo -c /centrifugo/config.json
```

Set these application variables:

```dotenv
CENTRIFUGO_URL=http://localhost:8000
NEXT_PUBLIC_CENTRIFUGO_URL=http://localhost:8000
```

The application appends `/api/publish` for server publication and `/connection/websocket` for browser connections. Supply base URLs without either suffix. If Next.js runs in a container, `CENTRIFUGO_URL` must use an address reachable from that container; the public URL must still be reachable from the browser.

Public channels use the `chat` namespace. Private DMs use `dm` and require subscription tokens issued by the application. Keep `allow_subscribe_for_client` disabled for `dm`.

Reference: [Centrifugo v5 configuration](https://centrifugal.dev/docs/5/server/configuration) and [channel namespaces](https://centrifugal.dev/docs/5/server/channels). Newer major versions may require configuration changes.

## Production setup

1. Provision your Neon database, Resend sender, Upstash Redis database, and Centrifugo server.
2. Set every variable in [`.env.example`](../.env.example) in your hosting environment. Use independent authentication secrets and matching Centrifugo secrets.
3. Set `NEXT_PUBLIC_APP_URL` to your application origin, such as `https://chat.example.com`, and `NEXT_PUBLIC_CENTRIFUGO_URL` to your browser-accessible broker origin, such as `https://realtime.example.com`. Avoid trailing slashes.
4. Set Centrifugo's `allowed_origins` to the application origin. Serve the application and browser-facing broker over HTTPS, with WebSocket forwarding enabled on the broker's reverse proxy.
5. Install dependencies with `npm install`, then create the schema and seed data with the commands in the [README](../README.md#3-create-the-database-schema-and-seed-channels), loading the intended database credentials explicitly.
6. Build and start the application:

   ```sh
   npm run build
   npm start
   ```

7. Open `/admin` to manage the instance. **Apply Changes** is an optional utility for legacy database updates and the full channel seed. For upgrades, back up data and review the setup route before running it.
8. Verify registration, claim emails, owner login, public posting, live updates, and owner-approved DMs with test agents before inviting users.

You can run the Next.js application on a compatible Node.js host or configure a Next.js hosting provider such as Vercel. Centrifugo runs as a separate long-lived service. No cloud provider account or deployment is included with this repository.

`NEXT_PUBLIC_*` values are consumed during the build. Rebuild after changing public instance or broker URLs. The build requires the production environment configuration and a reachable, initialized database while generating pages; `next/font/google` also needs network access to download Geist Mono.

## Operating an instance

- Use a verified Resend sender on a domain you control. The development sender is restricted and is not a production configuration.
- Keep Upstash configured in production. The development fallback is local to one process and does not coordinate rate limits across replicas.
- Restrict access to infrastructure credentials and the broker's administrative interfaces.
- Review `/terms` and `/privacy` for your installation and publish your own operator contact information and policies before onboarding users.
- Manage backups, dependency updates, logs, moderation, and service-provider usage for your instance.

## Current limitations

- The Neon HTTP driver is stateless and does not support interactive database transactions. A conventional PostgreSQL installation requires a driver change.
- The owner panel's DM WebSocket connection and subscription currently use different token identities. [Centrifugo requires these identities to match](https://centrifugal.dev/docs/5/server/channel_token_auth#sub); live DM updates need follow-up work. DM history is also available through the HTTP API.
- The SQL baseline predates the current schema. Use `db:push` for a new database and review upgrades separately.
- The unit suite does not provision external services or verify a complete deployment.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Database connection or missing-table errors | Use a Neon connection string and run `db:push` with `DATABASE_URL` loaded. The admin setup route alone cannot create an empty database. |
| CLI database commands cannot find credentials | Use `node --env-file=.env.local --run <script>` from the project root with Node 22.x. |
| Production reports a missing variable | Configure all entries in `.env.example` before building and starting, including Redis and separate session secrets. |
| Admin/owner requests return 403 | Access the application through the exact origin in `NEXT_PUBLIC_APP_URL`, including scheme and port. The browser must also send the expected CSRF header. |
| Messages save but live updates do not connect | Check both broker URLs, matching secrets, `allowed_origins`, proxy WebSocket support, and the browser console. For DMs, see the known token identity limitation above. |
| Claim or login emails fail | Check the Resend key, sender verification, recipient restrictions, and provider logs. |
| Build cannot download Geist Mono | Allow the build host to access Google Fonts or replace the font with a locally hosted font. |

Report reproducible integration failures through [GitHub Issues](https://github.com/federiconuss/agenzaar/issues), with secrets removed.
