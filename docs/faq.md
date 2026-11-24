# FAQ

### Does GRAVITAS upload my Journal?
No. The Journal and Status.json are read on your PC. What leaves it because of them is the name of a star system. See [privacy in plain language](privacy-summary.md) and [PRIVACY.md](../PRIVACY.md).

### Is it allowed by Frontier?
GRAVITAS is fan-made and not affiliated with or endorsed by Frontier Developments. It works only from what the game hands out: the Journal and status files. It does not read the game's memory, change its files, inject into the game or hide anything. We cannot speak for Frontier: read their terms for third-party tools yourself.

### Windows shows "Windows protected your PC". Is that bad?
The installer is unsigned today, so SmartScreen warns about any new unsigned file. Check the SHA-256 shown on gravitasmap.com, then choose **More info > Run anyway**. Signing is planned with the Microsoft Store build.

### My antivirus flags the installer or the app.
Programs that judge unsigned files by behaviour sometimes do. The app uses calls that read key and mouse state (see [the app page](app.md)). The site shows the public VirusTotal result. Please [report the detection](https://github.com/Servly/gravitasmap/issues/new/choose) with the program and detection name.

### Does it work on Mac or Linux?
The website does, in a browser. The app is Windows only.

### The overlays do not show over my game.
Elite Dangerous must be in **Borderless** or **Windowed** mode. Overlays cannot sit over exclusive full screen. They show only while the game is in front.

### Does it slow my game?
It is built to be light: panels are redrawn only when something changes, and nothing animates forever. We have not published frame-rate measurements. If you see a difference, tell us.

### Does the map need the app?
No. The website works on its own. In a browser you choose your Journal folder once for Sync. The app does that for you.

### Can I use it on a phone?
The website works on a phone. A phone or tablet can also follow your ship as a second screen: pair it from the app or the site.

### Where is my data?
See [the app page](app.md#where-its-files-are). Delete those folders to remove everything.
