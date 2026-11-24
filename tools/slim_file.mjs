// node tools/slim_file.mjs in.json out.json: the site's own lite slimming (lib/slim.js) on a file, for tools/refresh_sol.py
import { readFileSync, writeFileSync } from "node:fs";
import { slimStream } from "../lib/slim.js";
const [inp, out] = process.argv.slice(2);
if (!inp || !out) { console.error("usage: node slim_file.mjs in.json out.json"); process.exit(2); }
const text = await new Response(slimStream(new Response(readFileSync(inp)).body)).text();
JSON.parse(text);                       // (it must still be valid JSON)
writeFileSync(out, text);
