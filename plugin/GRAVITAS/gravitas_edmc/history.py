"""Past combats: every combat report is kept on this computer, the last 30, as on the site (cbSave).

The site keeps them in the browser (localStorage); the plugin keeps them in one file in EDMC's own folder
(gravitas_combats.json), not in the plugin's folder, so an update of the plugin never deletes them.
Nothing is sent anywhere.
"""
import json
import os

KEEP = 30
FILE = "gravitas_combats.json"


def folder(plugin_dir):
    try:
        from config import config        # EDMC's own folder (%LOCALAPPDATA%\EDMarketConnector on Windows)
        d = str(config.app_dir_path)
        if d and os.path.isdir(d):
            return d
    except Exception:
        pass
    return plugin_dir


class History:
    def __init__(self, plugin_dir, logger):
        self.path = os.path.join(folder(plugin_dir), FILE)
        self.log = logger
        self.items = self._read()

    def _read(self):
        try:
            with open(self.path, encoding="utf-8") as f:
                a = json.load(f)
            return [v for v in a if isinstance(v, dict) and (v.get("ep") or {}).get("t0")] if isinstance(a, list) else []
        except FileNotFoundError:
            return []
        except Exception as e:
            self.log.warning(f"GRAVITAS past combats could not be read: {e}")
            return []

    def _write(self):
        try:
            tmp = self.path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self.items, f, ensure_ascii=False, separators=(",", ":"))
            os.replace(tmp, self.path)
        except Exception as e:
            self.log.warning(f"GRAVITAS past combats could not be saved: {e}")

    def has(self, t0):
        return any(v["ep"]["t0"] == t0 for v in self.items)

    def add(self, v):
        """A finished fight's report (the engine's view with on false). The newest first."""
        r = json.loads(json.dumps(v))
        r.update(on=False, rev=0, tg=None)
        r.pop("past", None)
        self.items = [x for x in self.items if x["ep"]["t0"] != r["ep"]["t0"]]
        self.items.insert(0, r)
        del self.items[KEEP:]
        self._write()

    def delete(self, t0):
        """Returns what was deleted and where, for Undo."""
        for i, v in enumerate(self.items):
            if v["ep"]["t0"] == t0:
                del self.items[i]
                self._write()
                return i, v
        return None

    def put_back(self, i, v):
        if not self.has(v["ep"]["t0"]):
            self.items.insert(min(i, len(self.items)), v)
            del self.items[KEEP:]
            self._write()
