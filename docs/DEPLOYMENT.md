# Deployment

This project is a static Vite SPA. No database, API, secret, or paid service is required. The included GitHub Actions workflow builds the app and deploys it to GitHub Pages after pushes to `main`; `VITE_BASE_PATH` sets the repository subpath during that build.

## Cloudflare Pages

1. Push this repository to a Git provider account you control.
2. In Cloudflare Pages, create a project connected to that repository.
3. Use build command `npm run build` and output directory `dist`.
4. Deploy. `public/_redirects` supplies SPA fallback; `public/_headers` defines response security headers.
5. Open the deployment URL and verify creation/autosave, local video playback, ZIP export/import, and a standalone HTML report.

## GitHub Pages

The included `.github/workflows/pages.yml` builds and publishes `dist/` via GitHub Actions. In repository **Settings → Pages**, select **GitHub Actions** as the publishing source. The site URL is `https://<owner>.github.io/<repository>/`. GitHub Pages does not apply `public/_headers`; those hosting-level security headers are used by Cloudflare Pages only.

After the first successful workflow, open the site URL and verify project creation/autosave, local video playback, ZIP export/import, and a standalone HTML report. GitHub Pages is available on GitHub Free for public repositories; this app is open-source and the workflow publishes the source repository publicly.
