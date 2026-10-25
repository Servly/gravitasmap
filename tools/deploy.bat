@echo off
rem Publish GRAVITAS to Cloudflare Pages: builds site\ and uploads it together with functions\ (the online server).
rem First time only: install Node.js LTS from https://nodejs.org, then run:  npx wrangler login
set PROJECT=gravitas
cd /d %~dp0..
python tools\build.py || exit /b 1
rem v0.76: the small pairing server for "Sync with GRAVITAS" (worker\). If it cannot be published, the site still is.
call npx wrangler deploy --config worker\wrangler.toml || echo   warning: the pairing server was not published. The site is published anyway.
call npx wrangler pages deploy site --project-name %PROJECT% --branch main --commit-dirty=true
rem v0.92.2: the same version on GitHub, with its notes (only once set up: python tools\github_publish.py --setup)
python tools\github_publish.py || echo   warning: GitHub was not updated. The site is published anyway.
