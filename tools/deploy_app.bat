@echo off
rem Publish a new GRAVITAS APP version: signs it (tools\app_release.py) and uploads site\ to Cloudflare Pages.
rem   tools\deploy_app.bat --notes "What is new" [--breaking] [--minimum 0.5.0] [--no-build]
rem Apps that are running see "new version" (Update button); an app that is opened updates itself, small updates only.
rem Run by Burak himself, never by an assistant. First time only: npx wrangler login
set PROJECT=gravitas
cd /d %~dp0..
python tools\app_release.py %* || exit /b 1
python tools\build.py || exit /b 1
call npx wrangler pages deploy site --project-name %PROJECT% --branch main --commit-dirty=true
