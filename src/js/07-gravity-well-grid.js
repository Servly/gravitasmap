// ------------------------------------------------------- gravity well grid
// An illustrative layer (spacetime has no literal surface). Depth follows
// mass; it never moves bodies. One grid per view mode.
function makeGrid(extent, H) {
  const wells = Array.from({ length: MAX_WELLS }, () => new THREE.Vector4());
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uWells: { value: wells }, uCount: { value: 0 }, uExtent: { value: extent }, uH: { value: H }, uAlpha: { value: 1 } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      uniform vec4 uWells[${MAX_WELLS}]; uniform int uCount; uniform float uExtent;
      varying float vDepth; varying float vFade;
      void main() {
        vec3 p = position; float y = 0.0;
        for (int i = 0; i < ${MAX_WELLS}; i++) { if (i >= uCount) break; vec4 w = uWells[i]; vec2 d = p.xz - w.xy; y -= w.z / sqrt(1.0 + dot(d, d) / (w.w * w.w)); }
        p.y = y; vDepth = -y; vFade = 1.0 - smoothstep(uExtent * 0.55, uExtent, length(p.xz));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      uniform float uH, uAlpha; varying float vDepth; varying float vFade;
      void main() {
        #include <logdepthbuf_fragment>
        float k = clamp(vDepth / uH, 0.0, 1.0);
        vec3 c = mix(vec3(0.42, 0.20, 0.78), vec3(1.0, 0.45, 0.92), smoothstep(0.05, 0.6, k));
        c = mix(c, vec3(1.0, 0.85, 1.0), smoothstep(0.7, 1.0, k));
        gl_FragColor = vec4(c, (0.2 + 0.45 * k) * vFade * uAlpha);
      }`,
  });
  const mesh = new THREE.LineSegments(gridGeo(extent), mat); mesh.frustumCulled = false;
  return { mesh, mat, wells, extent };
}
// v0.71: every point of the grid sums every well on every frame, so its density follows the quality setting.
// Low draws about an eighth of High's points (the well shapes stay, the lines are just farther apart)
const GRID_RES = { low: [96, 160], medium: [160, 300], high: [240, 520], ultra: [240, 520] };
function gridGeo(extent) {
  const q = Object.keys(PRESETS).find(k => PRESETS[k] === QUALITY) || "medium", [N, M] = GRID_RES[q];
  const pts = new Float32Array((N + 1) * M * 12); let o = 0;
  for (let axis = 0; axis < 2; axis++) for (let i = 0; i <= N; i++) {
    const c = -extent + (2 * extent * i) / N;
    for (let j = 0; j < M; j++) {
      const s0 = -extent + (2 * extent * j) / M, s1 = -extent + (2 * extent * (j + 1)) / M;
      if (axis === 0) { pts[o] = s0; pts[o + 2] = c; pts[o + 3] = s1; pts[o + 5] = c; }
      else { pts[o] = c; pts[o + 2] = s0; pts[o + 3] = c; pts[o + 5] = s1; }
      o += 6;
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pts, 3)); g.userData.q = q;
  return g;
}

