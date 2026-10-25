import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
// errors are kept (last 20) so a problem report can include them; the page offers to report the first one
const ERRLOG = [];
function logErr(msg) {
  const m = String(msg || "").slice(0, 300); if (!m) return;
  ERRLOG.push({ t: new Date().toISOString().slice(11, 19), m }); if (ERRLOG.length > 20) ERRLOG.shift();
  try { errNotice(); } catch (e) {}
}
addEventListener("error", e => { if (e.message) logErr(`${e.message} (${String(e.filename || "").split("/").pop()}:${e.lineno || 0})`); });
addEventListener("unhandledrejection", e => logErr("promise: " + ((e.reason && (e.reason.message || e.reason)) || "rejected")));

// ======================================================================
// Units: 1 scene unit = 1 Mm (1000 km). Everything is at true scale.
// World frame = the orbital reference frame (x, y in plane, z up).
// Scene frame: (x, z, -y). A floating origin keeps numbers small near
// the camera so tiny moons render without jitter.
// ======================================================================
const LS_MM = 299.792458, AU_LS = 499.004783836, SUN_EM = 332946.0487, SUN_R_MM = 695.7, DEG = Math.PI / 180;
const MAX_STARS = 4, MAX_OCC = 12, MAX_WELLS = 128;
const API = location.protocol.startsWith("http") ? "/api" : null;
const $ = id => document.getElementById(id);
const fmt = (v, d = 2) => v == null || isNaN(v) ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d });

