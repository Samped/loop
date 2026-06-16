# Deployment (Vercel & custom domain)


### Vercel

The app deploys from the `web/` directory.

1. Link the project to Vercel (`vercel.json` configures function timeouts).
2. Set root directory to `web` in project settings.
3. Add all production environment variables from Section 11.
4. Deploy; preview and production environments should both receive keys.

**Required for full market catalog on production:** `SOSOVALUE_API_KEY`, contract addresses, and optionally `NEON_DATABASE_URL`.

### Custom domain (loopfiapp.xyz)

- Point apex domain **A record** to Vercel (`76.76.21.21`).
- Use `https://loopfiapp.xyz` (apex). If `www` is not configured in DNS, avoid apex→www redirects until `www` resolves.

### Background jobs on serverless

Oracle sync, news sync, and mark engine ticks are started via `instrumentation.ts` on server boot. For always-on cron in production, consider Vercel Cron hitting nudge endpoints or an external worker.

### Documentation site (GitBook)

Loop docs are published via [GitBook](https://www.gitbook.com) (same platform used by SoSoValue and many crypto projects). Source files live in the repo `docs/` folder with Git Sync.

**One-time setup:**

1. Go to [gitbook.com](https://www.gitbook.com) and sign in with GitHub.
2. Create a new **space** (e.g. "Loop").
3. Open **Configure** → **GitHub Sync** → install the GitBook GitHub app.
4. Select repository **Samped/loop**, branch **main**.
5. Set **Project directory** to `docs` (monorepo; the folder contains `.gitbook.yaml`).
6. Choose initial sync direction: **GitHub → GitBook**.
7. After sync, open **Publish** to get a public URL (e.g. `https://your-org.gitbook.io/loop`).

**Optional custom domain:** In GitBook space settings → **Domains**, add `docs.loopfiapp.xyz` and add the CNAME record GitBook provides in Spaceship DNS.

**Link from the app:** Set `NEXT_PUBLIC_DOCS_URL` in Vercel to your published GitBook URL so the sidebar "Documentation" link appears.

Edits in GitBook or commits to `docs/` on `main` stay in sync both ways.
