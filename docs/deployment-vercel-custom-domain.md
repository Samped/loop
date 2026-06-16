# Deployment

### Vercel

Deploy from the `web/` directory. `vercel.json` sets function timeouts.

1. Link the repo; set root directory to `web`.
2. Add production environment variables (see [environment variables](environment-variables.md)).
3. Deploy to preview and production.

Full market catalog on production requires `SOSOVALUE_API_KEY` and contract addresses. `NEON_DATABASE_URL` is optional.

### Custom domain

Point the apex A record to Vercel (`76.76.21.21`). Production URL: `https://loopfiapp.xyz`.

Do not point the apex domain at GitBook or another host. That will take down the app. Use `loopfiapp.xyz/docs` for documentation on the same Vercel deployment, or a subdomain like `docs.loopfiapp.xyz` if you host docs elsewhere.

Avoid apex to `www` redirects until `www` DNS is configured.

### Background jobs

Oracle sync, news sync, and mark engine ticks start in `instrumentation.ts` on server boot. For reliable schedules on serverless, use Vercel Cron against the nudge endpoints or an external worker.

### GitBook

Docs sync from the `docs/` folder via GitHub.

1. Create a space at [gitbook.com](https://www.gitbook.com).
2. Configure → GitHub Sync → install the GitBook app on `Samped/loop`.
3. Branch `main`, **project directory `docs`**.
4. Initial sync: GitHub → GitBook, then Publish.

Optional domain: `docs.loopfiapp.xyz` (CNAME from GitBook settings). Set `NEXT_PUBLIC_DOCS_URL` in Vercel for the in-app docs link.
