# Code signing policy

GRAVITAS (the Windows app) is free, open source (MIT) and fan-made for Elite Dangerous. This page describes how its Windows builds are signed once signing is set up.

**Status today: the installer is not signed yet.** Windows SmartScreen may warn when you run it. Signing is planned with the Microsoft Store build, and this SignPath policy is the plan for the direct download: the workflow in `.github/workflows/app-release.yml` is a draft that has not been run for a release.

Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org).

## What is signed

Only the Windows installer and `gravitas.exe`, built from this repository by the public build workflow (`.github/workflows/app-release.yml`). Nothing else is signed with this certificate. Builds made on a developer's own computer are never signed with it.

## Roles

| Role | Who |
|---|---|
| Author, committer | Burak Servili (CMDR Hongark), the project owner |
| Reviewer | Burak Servili (a single-maintainer project: every change is read by its author before a release) |
| Approver of signing requests | Burak Servili |

Each release is approved by hand on SignPath after the workflow has built it. A release that was not built by the workflow is not submitted.

## Privacy

GRAVITAS reads the Elite Dangerous Journal on your computer and does not upload it. The only network calls the app makes are listed in [PRIVACY.md](PRIVACY.md). The signed builds contain no tracking and no advertising.

## Antivirus warnings

GRAVITAS watches a few keys and the mouse while the game is running (to hide its windows when you look around with the free look button) and draws click-through windows over the game. Antivirus programs that judge unsigned programs by behaviour can mistake this for something it is not. If your antivirus warns about a build, tell us in an issue with the program's name and the detection name. Signed builds from this page are the ones to trust.
