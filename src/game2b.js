/* ======================================================================
   RESCOLDO — parte 2b: entorno lejano, senderos, animales y arcoíris
   ====================================================================== */

/* -------------------------------------------- mar de nubes procedural */
const seaLayers = [];
function makeSea(y, thr, alpha, scale, speed) {
  const m = new T.Mesh(new T.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), new T.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uTime: U.uTime, uLit: { value: new T.Color(1, 1, 1) }, uShade: { value: new T.Color(.6, .7, .9) }, uHor: skyU.uHor, uSunDir: skyU.uSunDir, uThr: { value: thr }, uAlpha: { value: alpha }, uScale: { value: scale }, uSpeed: { value: speed } },
    vertexShader: 'varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: `varying vec3 vW;uniform float uTime,uThr,uAlpha,uScale,uSpeed;uniform vec3 uLit,uShade,uHor,uSunDir;${GLSL_NOISE}
    float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*vnoise(p);p=p*2.03+7.1;a*=.5;}return s;}
    void main(){vec2 p=vW.xz*uScale+uTime*vec2(.008,.004)*uSpeed;
     float n=fbm(p);float n2=fbm(p*2.3+n*1.5+uTime*.01*uSpeed);float d=n*.65+n2*.35;
     float dens=smoothstep(uThr,uThr+.12,d);
     float l=fbm(p+uSunDir.xz*.09)*.65+fbm((p+uSunDir.xz*.05)*2.3+n*1.5)*.35-d;
     float lit=clamp(.55-l*5.,0.,1.);
     vec3 c=mix(uShade,uLit,lit*(.35+.65*smoothstep(uThr,uThr+.35,d)));
     float dist=length(vW.xz);float fade=smoothstep(70.,300.,dist);
     c=mix(c,uHor,fade);
     gl_FragColor=vec4(c,mix(dens*uAlpha,1.,fade*fade));}`,
  }));
  m.position.y = y; m.renderOrder = -2; m.frustumCulled = false; scene.add(m); seaLayers.push(m);
}

/* ------------------------------------------- islas lejanas y ballena */
const farMat = { rock: new T.MeshLambertMaterial({ flatShading: true }), grass: new T.MeshLambertMaterial({ flatShading: true }), tree: new T.MeshLambertMaterial({ flatShading: true }), fall: new T.MeshBasicMaterial({ transparent: true, opacity: .6, fog: false }), whale: new T.MeshLambertMaterial({}) };
const farBase = { rock: new T.Color(0x6d5a52), grass: new T.Color(0x86b860), tree: new T.Color(0x4f8754), whale: new T.Color(0x6f8fb0) };
const farIsles = []; let whale = null, rainbow = null, rainbowOn = 0;
function setupFar() {
  makeSea(-13, .4, 1, .03, 1); makeSea(-8, .52, .75, .05, 1.8);
  const r = mulberry(909);
  for (let i = 0; i < 7; i++) {
    const g = new T.Group(), rock = [], grass = [], tree = [];
    const lobes = 1 + (r() * 3 | 0);
    for (let k = 0; k < lobes; k++) {
      const x = (r() - .5) * 2.2 * k, z = (r() - .5) * 2.2 * k, s = 1 - k * .22, hgt = 1.6 + r() * 1.6;
      rock.push([new T.CylinderGeometry(1, .12 + r() * .15, hgt, 7), 0xffffff, MX(x, -hgt / 2 * s, z, s, s, s, r() * 3)]);
      grass.push([GEO.cyl6, 0xffffff, MX(x, .06 * s, z, 2.06 * s, .16 * s, 2.06 * s, r() * 3)]);
      for (let j = 0, n = 4 + (r() * 6 | 0); j < n; j++) { const a = r() * TAU, d = r() * .75 * s, th = .35 + r() * .35; tree.push([GEO.cone, 0xffffff, MX(x + Math.cos(a) * d, .14 * s + th / 2, z + Math.sin(a) * d, .3, th, .3)]); }
    }
    g.add(new T.Mesh(merge(rock), farMat.rock), new T.Mesh(merge(grass), farMat.grass), new T.Mesh(merge(tree), farMat.tree));
    if (r() < .7) { const f = new T.Mesh(new T.PlaneGeometry(.16, 3.2), farMat.fall); const a = r() * TAU; f.position.set(Math.cos(a) * .98, -1.5, Math.sin(a) * .98); f.rotation.y = -a + Math.PI / 2; g.add(f); }
    const a = i / 7 * TAU + r() * .5, rad = 78 + r() * 70, s = 7 + r() * 10;
    g.position.set(Math.cos(a) * rad, -7 + r() * 16, Math.sin(a) * rad); g.scale.setScalar(s); g.rotation.y = r() * TAU; g.userData = { y: g.position.y, ph: r() * 9 };
    scene.add(g); farIsles.push(g);
  }
  // ballena del cielo: un guiño lejano que cruza despacio el horizonte
  const p = [];
  sp(p, 0xffffff, 0, 0, 0, 2.2, 1.5, 6.2); sp(p, 0xffffff, 0, .1, -3.4, 1.2, .9, 2.6); sp(p, 0xffffff, 0, .25, -4.9, 2.6, .18, 1.1);
  sp(p, 0xffffff, 1.3, -.4, .9, 1.8, .16, .9, GEO.ico, .5); sp(p, 0xffffff, -1.3, -.4, .9, 1.8, .16, .9, GEO.ico, -.5);
  whale = new T.Mesh(merge(p), farMat.whale); whale.scale.setScalar(2.6); whale.userData.a = 2; scene.add(whale);
  // arcoíris
  rainbow = new T.Mesh(new T.RingGeometry(24, 27, 72, 1, 0, Math.PI), new T.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: T.AdditiveBlending, side: T.DoubleSide, uniforms: { uA: { value: 0 } },
    vertexShader: 'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec3 vP;uniform float uA;void main(){float k=(length(vP.xy)-24.)/3.;vec3 c=.5+.5*cos(6.2832*(k*.85+vec3(0.,.33,.67)));float a=smoothstep(0.,.25,k)*smoothstep(1.,.75,k)*smoothstep(0.,9.,vP.y);gl_FragColor=vec4(c*a*uA,1.);}',
  }));
  rainbow.renderOrder = -1; rainbow.visible = false; scene.add(rainbow);
}
const _fc = new T.Color();
function updateFar(dt, time) {
  const hor = skyU.uHor.value, day = cur.day, lum = lerp(.16, 1, day);
  for (const k of ['rock', 'grass', 'tree', 'whale']) farMat[k].color.copy(farBase[k]).multiplyScalar(lum).lerp(hor, k === 'whale' ? .62 : .5);
  farMat.fall.color.copy(hor).lerp(_fc.setRGB(lum, lum, lum), .6);
  for (const g of farIsles) g.position.y = g.userData.y + Math.sin(time * .15 + g.userData.ph) * .6;
  const a = whale.userData.a += dt * .012; whale.position.set(Math.cos(a) * 92, 9 + Math.sin(time * .2) * 2, Math.sin(a) * 92); whale.rotation.set(Math.sin(time * .35) * .08, -a, Math.sin(time * .2) * .05);
  seaLayers.forEach((m, i) => { const u = m.material.uniforms; u.uLit.value.copy(hor).lerp(_fc.setRGB(1, 1, 1), .55).multiplyScalar(lerp(.42, 1.05, day)).lerp(sun.color, .18 * day); u.uShade.value.copy(skyU.uGnd.value).lerp(hor, .35).multiplyScalar(i ? 1 : .9); });
  const ra = rainbow.material.uniforms.uA; ra.value = damp(ra.value, rainbowOn * day * (1 - cur.overcast) * .5, .4, dt); rainbow.visible = ra.value > .004;
  if (rainbow.visible) { rainbow.position.set(-sunDir.x * 30, -6, -sunDir.z * 30); rainbow.rotation.y = Math.atan2(sunDir.x, sunDir.z); }
}

/* ------------------------------------------------------------ senderos */
function syncPaths() {
  const mask = new Map(), hub = tmap.get('0,0');
  const link = (a, b) => { const i = DIRS.findIndex(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r); if (i < 0) return; mask.set(a, (mask.get(a) || 0) | 1 << i); mask.set(b, (mask.get(b) || 0) | 1 << (i + 3) % 6); };
  for (const b of G.buildings) { if (b.type === 'hearth' || b.type === 'lantern') continue; const p = findPath(hub, b.tile); for (let i = 1; i < p.length; i++) link(p[i - 1], p[i]); }
  for (const t of tiles) {
    const m = t.terrain === 'water' ? 0 : mask.get(t) || 0; if (t.pathMask === m) continue; t.pathMask = m;
    if (t.pathMesh) { t.group.remove(t.pathMesh); t.pathMesh.geometry.dispose(); t.pathMesh = null; }
    if (!m) continue;
    const parts = [], r = mulberry(t.seed + 71); cy(parts, C.path, 0, 0, 0, .17, .026, GEO.cyl);
    for (let i = 0; i < 6; i++) if (m & 1 << i) {
      const x = hx(DIRS[i][0], DIRS[i][1]) / 2, z = hz(DIRS[i][0], DIRS[i][1]) / 2, a = Math.atan2(x, z);
      parts.push([GEO.box, vary(C.path, r, .05), MX(x / 2, .013, z / 2, .25, .026, .9, a)]);
      for (let k = 0; k < 3; k++) { const f = .25 + r() * .7, sd = (r() < .5 ? -1 : 1) * .17; sp(parts, vary(C.stone, r, .1), x * f + Math.cos(a) * sd, .02, z * f - Math.sin(a) * sd, .09, .05, .08, GEO.dod, r() * 3); }
    }
    const mesh = mk(parts, MAT.build, false); mesh.position.y = t.h; t.pathMesh = mesh; t.group.add(mesh);
  }
}

/* ------------------------------------------------------------ animales */
const sheep = [], ducks = [];
function sheepModel(r) {
  const p = []; const w = vary(0xf4efe6, r, .04);
  sp(p, w, 0, .21, 0, .3, .25, .4); sp(p, w, .07, .27, -.08, .2); sp(p, w, -.07, .27, .06, .2); sp(p, w, 0, .29, 0, .22);
  sp(p, 0x3d3530, 0, .27, .22, .13, .13, .16); for (const [x, z] of [[-.08, -.12], [.08, -.12], [-.08, .12], [.08, .12]]) bx(p, 0x3d3530, x, 0, z, .04, .12, .04);
  const m = mk(p, MAT.toy); m.scale.setScalar(.72); return m;
}
function duckModel() {
  const p = []; sp(p, 0xfaf6ee, 0, .06, 0, .2, .14, .28); sp(p, 0xfaf6ee, 0, .1, -.13, .1, .1, .1); sp(p, 0xfaf6ee, 0, .17, .1, .11);
  p.push([GEO.cone, 0xf2a03c, MX(0, .165, .18, .05, .08, .05, 0, Math.PI / 2)]); return mk(p, MAT.toy, false);
}
function setupLife() {
  sheep.length = 0; ducks.length = 0; const r = mulberry(G.seed + 5);
  const free = tiles.filter(t => t.terrain === 'meadow' && !t.b && !t.sap && t.d >= 2);
  for (let i = 0; i < 6 && free.length; i++) { const t = free[r() * free.length | 0], m = sheepModel(r); const s = { m, t, x: (r() - .5) * .8, z: (r() - .5) * .8, tx: 0, tz: 0, wait: r() * 4, ph: r() * 9 }; s.tx = s.x; s.tz = s.z; t.group.add(m); sheep.push(s); }
  const waters = tiles.filter(t => t.terrain === 'water' && t.d < RADIUS && nbs(t).filter(n => n.terrain === 'water').length >= 1);
  for (let i = 0; i < 3 && waters.length; i++) { const t = waters[r() * waters.length | 0], m = duckModel(); t.group.add(m); ducks.push({ m, t, a: r() * TAU, rad: .28 + r() * .3, sp: (.25 + r() * .2) * (r() < .5 ? -1 : 1) }); }
}
function updateLife(dt, time) {
  if (!G) return; updateFar(dt, time);
  for (const s of sheep) {
    if (s.t.b || s.t.sap || s.t.terrain !== 'meadow') { const free = tiles.filter(t => t.terrain === 'meadow' && !t.b && !t.sap && t.d >= 2); if (!free.length) { s.m.visible = false; continue; } s.t.group.remove(s.m); s.t = free[Math.random() * free.length | 0]; s.t.group.add(s.m); s.m.visible = true; }
    if ((s.wait -= dt) <= 0) { s.wait = rnd(3, 9); const a = Math.random() * TAU, d = Math.random() * .55; s.tx = Math.cos(a) * d; s.tz = Math.sin(a) * d; }
    const dx = s.tx - s.x, dz = s.tz - s.z, l = Math.hypot(dx, dz), mv = l > .03 && cur.night < .6;
    if (mv) { s.x += dx / l * dt * .28; s.z += dz / l * dt * .28; s.m.rotation.y = damp(s.m.rotation.y, Math.atan2(dx, dz), 5, dt); }
    s.m.position.set(s.x, s.t.h + (mv ? Math.abs(Math.sin(time * 8 + s.ph)) * .04 : 0), s.z); s.m.rotation.x = mv ? 0 : Math.max(0, Math.sin(time * .7 + s.ph) - .6) * .5;
  }
  const iced = U.uIce.value > .5;
  for (const d of ducks) { d.a += d.sp * dt; d.m.visible = !iced; d.m.position.set(Math.cos(d.a) * d.rad, d.t.h + .005 + Math.sin(time * 2.2 + d.a) * .008, Math.sin(d.a) * d.rad); d.m.rotation.y = -d.a + (d.sp > 0 ? 0 : Math.PI); d.m.rotation.z = Math.sin(time * 2.2 + d.a) * .06; }
}
