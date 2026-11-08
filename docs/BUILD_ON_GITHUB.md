# Building the engine with GitHub Actions (no computer needed)

1. Make sure these files are in your repo on `main`: `.github/workflows/build-engine.yml`, everything in `scripts/`, `docs/`. (Web uploads lose the executable bit; the workflow calls `bash` explicitly, so that is fine.)
2. GitHub → **Actions** → **build-engine** → **Run workflow**. Leave **publish** unchecked for the first run. On iPad you may need Safari's "Request Desktop Website" to see the Actions tab comfortably.
3. Wait (hours is normal). Open the finished run: the **Summary** shows file sizes, any file over 25 MiB, and the last 60 log lines. Download the `browserdroid-engine` artifact for the full `build.log`.
4. If it failed, send me the summary and the end of `build.log`. That is the next thing to fix.
5. If it succeeded and every file is small enough for your host, run it again with **publish** checked: it commits `engine/` and `vendor/` to `main`, Cloudflare redeploys, and `/lab` preflight should turn green.

Caveats: the build is unverified; hosted runners have limited disk/time; committing large binaries bloats git history permanently; if Cloudflare rejects files over its per-file limit the deploy itself will fail, so check the size report first.
