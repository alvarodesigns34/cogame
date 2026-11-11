/* ======================================================================
   RESCOLDO — parte 1: utilidades, render, materiales, mundo y modelos
   ====================================================================== */
const T = THREE;
const $ = s => document.querySelector(s);
const TAU = Math.PI * 2, SQ3 = Math.sqrt(3);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash2 = (a, b) => mulberry((Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663)) >>> 0)();
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const ease = {
  out: k => 1 - Math.pow(1 - k, 3),
  inOut: k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2,
  back: k => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
  elastic: k => k === 0 ? 0 : k === 1 ? 1 : Math.pow(2, -9 * k) * Math.sin((k * 8 - .75) * (TAU / 3)) + 1,
  lin: k => k,
};
const tweens = [];
function tween(dur, fn, e = ease.out) { return new Promise(res => tweens.push({ t: 0, dur, fn, e, res })); }
const wait = s => tween(s, () => { }, ease.lin);

/* ---------------------------------------------------------------- hex */
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const RADIUS = 4;
const hkey = (q, r) => q + ',' + r;
const hdist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
const hx = (q, r) => SQ3 * (q + r / 2), hz = (q, r) => 1.5 * r;

/* ----------------------------------------------------------- renderer */
const canvas = $('#c');
const renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.toneMapping = T.NoToneMapping;
const scene = new T.Scene();
scene.fog = new T.FogExp2(0xd4ecf7, 0.006);
const camera = new T.PerspectiveCamera(30, 1, 0.5, 400);

const U = { uTime: { value: 0 }, uSnow: { value: 0 }, uWind: { value: 1 }, uIce: { value: 0 } };

/* ------------------------------------------------- pipeline de postproceso
   escena HDR (MSAA) → desenfoque para tilt-shift → bloom → composición con
   ACES, viñeta, grano y fundido.                                           */
const VS = 'varying vec2 vUv;void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}';
const fsGeo = new T.BufferGeometry();
fsGeo.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
const fsMesh = new T.Mesh(fsGeo); fsMesh.frustumCulled = false;
const fsScene = new T.Scene(); fsScene.add(fsMesh);
const fsCam = new T.Camera();
const smat = (fs, uniforms) => new T.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
const rtOpt = { type: T.HalfFloatType, depthBuffer: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter };
const RT = {
  scene: new T.WebGLRenderTarget(4, 4, { type: T.HalfFloatType, samples: 4 }),
  h1: new T.WebGLRenderTarget(4, 4, rtOpt), h2: new T.WebGLRenderTarget(4, 4, rtOpt),
  q1: new T.WebGLRenderTarget(4, 4, rtOpt), q2: new T.WebGLRenderTarget(4, 4, rtOpt),
};
const mCopy = smat('uniform sampler2D t;varying vec2 vUv;void main(){gl_FragColor=texture2D(t,vUv);}', { t: { value: null } });
const mBright = smat('uniform sampler2D t;varying vec2 vUv;void main(){vec3 c=texture2D(t,vUv).rgb;float l=max(c.r,max(c.g,c.b));gl_FragColor=vec4(c*smoothstep(.95,1.7,l),1.);}', { t: { value: null } });
const mBlur = smat(`uniform sampler2D t;uniform vec2 d;varying vec2 vUv;
void main(){vec3 c=texture2D(t,vUv).rgb*.227027;
c+=(texture2D(t,vUv+d*1.3846)+texture2D(t,vUv-d*1.3846)).rgb*.316216;
c+=(texture2D(t,vUv+d*3.2308)+texture2D(t,vUv-d*3.2308)).rgb*.070270;
gl_FragColor=vec4(c,1.);}`, { t: { value: null }, d: { value: new T.Vector2() } });
const mFinal = smat(`uniform sampler2D tScene,tBlur,tBloom;uniform float uExp,uBloom,uTilt,uTime,uFade,uVig,uSat;uniform vec3 uTint;varying vec2 vUv;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){
 vec3 c=texture2D(tScene,vUv).rgb;vec3 b=texture2D(tBlur,vUv).rgb;
 float ts=smoothstep(.17,.5,abs(vUv.y-.5))*uTilt;c=mix(c,b,ts);
 c+=texture2D(tBloom,vUv).rgb*uBloom;
 c=aces(c*uExp*uTint);
 c=pow(c,vec3(1./2.2));
 float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,uSat);
 c=mix(c,c*c*(3.-2.*c),.18);
 vec2 q=vUv-.5;c*=1.-dot(q,q)*uVig;
 c+=(h(vUv*871.+uTime)-.5)*.012;
 gl_FragColor=vec4(c*uFade,1.);}`, {
  tScene: { value: null }, tBlur: { value: null }, tBloom: { value: null },
  uExp: { value: 1.1 }, uBloom: { value: .8 }, uTilt: { value: .85 }, uTime: U.uTime, uFade: { value: 0 },
  uVig: { value: .7 }, uSat: { value: 1.1 }, uTint: { value: new T.Color(1, 1, 1) },
});
function pass(mat, target) { fsMesh.material = mat; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); }
let quality = 1, VW = 1, VH = 1;
function resize() {
  const w = innerWidth, h = innerHeight, pr = Math.min(devicePixelRatio || 1, 2) * quality;
  renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
  VW = Math.max(2, Math.floor(w * pr)); VH = Math.max(2, Math.floor(h * pr));
  RT.scene.setSize(VW, VH);
  RT.h1.setSize(VW >> 1, VH >> 1); RT.h2.setSize(VW >> 1, VH >> 1);
  RT.q1.setSize(VW >> 2, VH >> 2); RT.q2.setSize(VW >> 2, VH >> 2);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
function renderFrame() {
  renderer.setRenderTarget(RT.scene); renderer.render(scene, camera);
  mCopy.uniforms.t.value = RT.scene.texture; pass(mCopy, RT.h1);
  mBlur.uniforms.t.value = RT.h1.texture; mBlur.uniforms.d.value.set(1.4 / (VW >> 1), 0); pass(mBlur, RT.h2);
  mBlur.uniforms.t.value = RT.h2.texture; mBlur.uniforms.d.value.set(0, 1.4 / (VH >> 1)); pass(mBlur, RT.h1);
  mBright.uniforms.t.value = RT.h1.texture; pass(mBright, RT.q1);
  mBlur.uniforms.t.value = RT.q1.texture; mBlur.uniforms.d.value.set(1.6 / (VW >> 2), 0); pass(mBlur, RT.q2);
  mBlur.uniforms.t.value = RT.q2.texture; mBlur.uniforms.d.value.set(0, 1.6 / (VH >> 2)); pass(mBlur, RT.q1);
  mFinal.uniforms.tScene.value = RT.scene.texture; mFinal.uniforms.tBlur.value = RT.h1.texture; mFinal.uniforms.tBloom.value = RT.q1.texture;
  pass(mFinal, null);
}

/* ---------------------------------------------------------- materiales */
const GLSL_NOISE = `
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}`;
/* Inyecta en un material estándar: balanceo por viento, variación procedural,
   nieve acumulada en las caras que miran al cielo y agua/hielo animados.   */
function enhance(mat, o = {}) {
  mat.onBeforeCompile = s => {
    Object.assign(s.uniforms, U);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;varying vec3 vWN;uniform float uTime;uniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp0=modelMatrix*vec4(transformed,1.);
        ${o.sway ? `float swk=max(position.y-${(o.base || 0).toFixed(2)},0.)*${o.sway.toFixed(3)}*uWind;
        transformed.x+=sin(uTime*1.7+wp0.x*1.3+wp0.z*.9)*swk;
        transformed.z+=cos(uTime*1.3+wp0.x*.7-wp0.z*1.1)*swk*.7;` : ''}
        vWPos=wp0.xyz;vWN=normalize(mat3(modelMatrix)*objectNormal);`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;varying vec3 vWN;uniform float uSnow;uniform float uTime;uniform float uIce;' + GLSL_NOISE)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${o.noise ? `diffuseColor.rgb*=${(1 - o.noise / 2).toFixed(2)}+${o.noise.toFixed(2)}*vnoise(vWPos.xz*${(o.scale || 2.2).toFixed(1)});` : ''}
        ${o.water ? `float rp=vnoise(vWPos.xz*2.3+vec2(uTime*.16,uTime*.11));
        float rp2=vnoise(vWPos.xz*5.5-vec2(uTime*.2,uTime*.14));
        diffuseColor.rgb=mix(diffuseColor.rgb*.72,diffuseColor.rgb*1.25,rp);
        diffuseColor.rgb+=smoothstep(.70,.78,rp*.55+rp2*.55)*.22*(1.-uIce);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.80,.90,.97)*(.9+.12*rp2),uIce*.92);` : ''}
        ${o.snow !== 0 ? `float sn=uSnow*smoothstep(.3,.75,vWN.y+(vnoise(vWPos.xz*3.4)-.5)*.35)*${(o.snow || 1).toFixed(2)};
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.92,.95,1.),sn);` : ''}`);
  };
  mat.customProgramCacheKey = () => JSON.stringify(o);
  return mat;
}
const std = (p, o) => enhance(new T.MeshStandardMaterial(Object.assign({ roughness: .9, metalness: 0 }, p)), o);
const MAT = {
  soil: std({ vertexColors: true, flatShading: true }, { snow: 0, noise: .2, scale: 3 }),
  grass: std({ color: 0x8fc46a, vertexColors: true }, { noise: .26, scale: 1.7 }),
  rockTop: std({ color: 0xa39c93, vertexColors: true, flatShading: true }, { noise: .2 }),
  water: std({ color: 0x4fa6c4, roughness: .16, metalness: .1 }, { water: 1, snow: 0 }),
  tuft: std({ color: 0x7db85c, vertexColors: true }, { sway: .5, base: 0, snow: .8 }),
  leaf: std({ color: 0x8ccf6c, vertexColors: true, flatShading: true }, { sway: .05, base: .1, snow: .85 }),
  pine: std({ color: 0x4f8f5a, vertexColors: true, flatShading: true }, { sway: .035, base: .1, snow: .9 }),
  rock: std({ vertexColors: true, flatShading: true, roughness: .95 }, { snow: .9 }),
  build: std({ vertexColors: true, flatShading: true, roughness: .85 }, { snow: .9 }),
  smooth: std({ vertexColors: true, roughness: .8 }, { snow: .6 }),
  flower: std({ vertexColors: true, roughness: .7 }, { sway: .5, base: 0, snow: 0 }),
  glass: new T.MeshStandardMaterial({ color: 0xcfeee6, transparent: true, opacity: .34, roughness: .08, emissive: 0xffd27a, emissiveIntensity: 0, depthWrite: false }),
  win: new T.MeshBasicMaterial({ color: 0x2b2420 }),
  winCold: new T.MeshBasicMaterial({ color: 0x27262c }),
  cloud: new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: .1 }),
  ghost: new T.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: .5, depthWrite: false }),
  beacon: new T.MeshBasicMaterial({ color: 0xfff0c8 }),
};
const flameMats = [new T.MeshBasicMaterial({ color: new T.Color().setRGB(2.6, .62, .12) }), new T.MeshBasicMaterial({ color: new T.Color().setRGB(3.2, 1.5, .3) }), new T.MeshBasicMaterial({ color: new T.Color().setRGB(3.4, 2.7, 1.3) })];

/* ----------------------------------------------- geometría procedimental */
function roofGeo() {
  const A = [-.5, 0, -.5], B = [.5, 0, -.5], C = [0, 1, -.5], a = [-.5, 0, .5], b = [.5, 0, .5], c = [0, 1, .5];
  const f = [A, C, B, a, b, c, A, a, c, A, c, C, B, c, b, B, C, c, A, B, b, A, b, a].flat();
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(f, 3)); g.computeVertexNormals(); return g;
}
const GEO = {
  box: new T.BoxGeometry(1, 1, 1), cyl: new T.CylinderGeometry(.5, .5, 1, 10), cyl6: new T.CylinderGeometry(.5, .5, 1, 6),
  taper: new T.CylinderGeometry(.34, .5, 1, 9), bowl: new T.CylinderGeometry(.5, .3, 1, 9),
  cone: new T.ConeGeometry(.5, 1, 7), cone4: new T.ConeGeometry(.5, 1, 4), ico: new T.IcosahedronGeometry(.5, 1),
  ico0: new T.IcosahedronGeometry(.5, 0), dod: new T.DodecahedronGeometry(.5, 0), oct: new T.OctahedronGeometry(.5, 0), roof: roofGeo(),
};
function MX(x, y, z, sx = 1, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) {
  return new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz, 'YXZ')), new T.Vector3(sx, sy, sz));
}
const _c = new T.Color();
function merge(parts) {
  let n = 0;
  const gs = parts.map(([g, col, m]) => { const gg = g.index ? g.toNonIndexed() : g.clone(); if (m) gg.applyMatrix4(m); n += gg.attributes.position.count; return [gg, col]; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), colr = new Float32Array(n * 3); let o = 0;
  for (const [gg, col] of gs) {
    const c = gg.attributes.position.count; pos.set(gg.attributes.position.array, o * 3); nor.set(gg.attributes.normal.array, o * 3);
    _c.set(col); for (let i = 0; i < c; i++) { colr[(o + i) * 3] = _c.r; colr[(o + i) * 3 + 1] = _c.g; colr[(o + i) * 3 + 2] = _c.b; }
    o += c; gg.dispose();
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3)); g.setAttribute('color', new T.BufferAttribute(colr, 3));
  return g;
}
function mk(parts, mat, shadow = true) { const m = new T.Mesh(merge(parts), mat); m.castShadow = shadow; m.receiveShadow = true; return m; }
const bx = (a, col, x, y0, z, w, h, d, ry = 0, rx = 0, rz = 0) => a.push([GEO.box, col, MX(x, y0 + h / 2, z, w, h, d, ry, rx, rz)]);
const cy = (a, col, x, y0, z, r, h, geo = GEO.cyl, ry = 0, rx = 0, rz = 0) => a.push([geo, col, MX(x, y0 + h / 2, z, r * 2, h, r * 2, ry, rx, rz)]);
const sp = (a, col, x, y, z, sx, sy = sx, sz = sx, geo = GEO.ico, ry = 0) => a.push([geo, col, MX(x, y, z, sx, sy, sz, ry)]);
function vary(hex, r, amt = .08) { const c = new T.Color(hex); const k = 1 + (r() - .5) * 2 * amt; c.r *= k * (1 + (r() - .5) * amt); c.g *= k; c.b *= k * (1 + (r() - .5) * amt); return c; }

/* ------------------------------------------------------------- escena */
const world = new T.Group(); scene.add(world);
const hemi = new T.HemisphereLight(0xcfe4ff, 0x8a8266, 1); scene.add(hemi);
const sun = new T.DirectionalLight(0xfff1dc, 3);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 70 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.035; sun.shadow.radius = 3;
scene.add(sun, sun.target);
const hearthLight = new T.PointLight(0xff9448, 0, 9, 1.4); hearthLight.position.set(0, .7, 0); world.add(hearthLight);

/* cielo: gradiente, disco solar/lunar, estrellas y aurora */
const skyU = {
  uZen: { value: new T.Color() }, uHor: { value: new T.Color() }, uGnd: { value: new T.Color() }, uSunDir: { value: new T.Vector3(0, 1, 0) },
  uMoonDir: { value: new T.Vector3(0, -1, 0) }, uSunCol: { value: new T.Color() }, uNight: { value: 0 }, uAurora: { value: 0 }, uTime: U.uTime,
};
const sky = new T.Mesh(new T.SphereGeometry(300, 40, 20), new T.ShaderMaterial({
  side: T.BackSide, depthWrite: false, fog: false, uniforms: skyU,
  vertexShader: 'varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `varying vec3 vD;uniform vec3 uZen,uHor,uGnd,uSunDir,uMoonDir,uSunCol;uniform float uNight,uAurora,uTime;${GLSL_NOISE}
  float h3(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
  void main(){vec3 d=normalize(vD);float h=d.y;
   vec3 c=mix(uHor,uZen,pow(smoothstep(0.,.9,max(h,0.)),.62));
   c=mix(c,uGnd,smoothstep(.04,-.55,h));
   float sd=max(dot(d,uSunDir),0.);
   c+=uSunCol*(smoothstep(.9992,.9996,sd)*5.+pow(sd,90.)*.5+pow(sd,7.)*.16)*(1.-uNight*.2);
   float md=max(dot(d,uMoonDir),0.);
   c+=vec3(.8,.88,1.)*(smoothstep(.9994,.9997,md)*2.2+pow(md,220.)*.25)*uNight;
   vec3 g=floor(d*160.);float s=h3(g);
   float tw=.6+.4*sin(uTime*2.+s*90.);
   c+=vec3(1.,.95,.85)*step(.9965,s)*tw*uNight*smoothstep(-.05,.25,h)*1.4;
   float band=vnoise(vec2(atan(d.z,d.x)*3.+uTime*.05,h*2.))*vnoise(vec2(atan(d.z,d.x)*9.-uTime*.08,uTime*.03));
   float au=smoothstep(.12,.5,band)*smoothstep(.05,.3,h)*smoothstep(.85,.4,h);
   c+=mix(vec3(.2,1.2,.6),vec3(.9,.4,1.1),smoothstep(.25,.65,h))*au*uAurora*1.3;
   gl_FragColor=vec4(c,1.);}`,
}));
sky.frustumCulled = false; scene.add(sky);

/* nubes y rocas satélite */
const clouds = [];
function makeCloud(r) {
  const p = []; const n = 4 + (r() * 4 | 0);
  for (let i = 0; i < n; i++) sp(p, 0xffffff, (i - n / 2) * .9 + r() * .5, r() * .35, (r() - .5) * 1.1, 1.2 + r() * 1.5, .7 + r() * .7, 1.1 + r() * 1.1);
  const m = new T.Mesh(merge(p), MAT.cloud); m.castShadow = false; return m;
}
function buildBackdrop() {
  const r = mulberry(77);
  for (let i = 0; i < 22; i++) {
    const m = makeCloud(r), low = i < 14;
    const o = { m, a: r() * TAU, rad: low ? 13 + r() * 30 : 15 + r() * 22, y: low ? -5 - r() * 7 : 3.5 + r() * 7, sp: (.006 + r() * .012) * (r() < .5 ? 1 : .7), s: low ? 1.6 + r() * 2.4 : .8 + r() * 1.1 };
    m.scale.setScalar(o.s); m.rotation.y = r() * TAU; scene.add(m); clouds.push(o);
  }
  for (let i = 0; i < 4; i++) {
    const p = [], q = []; const a = r() * TAU, rad = 10.5 + r() * 5, s = .5 + r() * .7;
    cy(p, 0x6b5a50, 0, -1.1, 0, .5, 1.1, new T.CylinderGeometry(.5, .12, 1, 6));
    cy(q, 0xffffff, 0, 0, 0, .52, .12, GEO.cyl6);
    const g = new T.Group(); g.add(mk(p, MAT.soil), mk(q, MAT.grass));
    if (r() < .8) { const t = []; treeParts(t, [], [], r, 0, .1, 0, .8, true); const pm = []; treeParts([], pm, [], r, 0, .1, 0, .8, true); g.add(mk(t, MAT.build)); g.add(mk(pm, MAT.pine)); }
    g.position.set(Math.cos(a) * rad, -1.5 + r() * 3.5, Math.sin(a) * rad); g.scale.setScalar(s * 1.6); g.userData = { y: g.position.y, ph: r() * TAU };
    scene.add(g); floaters.push(g);
  }
}
const floaters = [];

/* árboles: añade partes a tronco / pino / hoja */
function treeParts(trunk, pine, leaf, r, x, y, z, s, forcePine) {
  const conifer = forcePine || r() < .5;
  if (conifer) {
    cy(trunk, 0x7a5540, x, y, z, .05 * s, .26 * s);
    const tint = vary(0xffffff, r, .1); let yy = y + .16 * s;
    for (let i = 0; i < 3; i++) { const rad = (.3 - i * .075) * s, hh = (.4 - i * .03) * s; pine.push([GEO.cone, tint, MX(x, yy + hh / 2, z, rad * 2, hh, rad * 2, r() * TAU)]); yy += hh * .58; }
    return y + 1.0 * s;
  }
  cy(trunk, 0x80593f, x, y, z, .055 * s, .36 * s);
  const tint = vary(0xffffff, r, .12);
  sp(leaf, tint, x, y + .52 * s, z, .56 * s, .52 * s, .56 * s, GEO.ico, r() * TAU);
  sp(leaf, tint, x + .16 * s, y + .42 * s, z + .08 * s, .34 * s, .32 * s, .34 * s, GEO.ico, r() * TAU);
  sp(leaf, tint, x - .14 * s, y + .62 * s, z - .1 * s, .32 * s, .3 * s, .32 * s, GEO.ico, r() * TAU);
  return y + .8 * s;
}

/* ---------------------------------------------------------- partículas */
class PS {
  constructor(max, additive) {
    this.max = max; this.n = 0;
    const f = () => new Float32Array(max);
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.baseA = f();
    this.size = f(); this.shape = f(); this.life = f(); this.maxLife = f(); this.grav = f(); this.drag = f(); this.kind = new Uint8Array(max); this.grow = f(); this.outSize = f();
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(this.p, 3).setUsage(T.DynamicDrawUsage));
    g.setAttribute('aColor', new T.BufferAttribute(this.col, 4).setUsage(T.DynamicDrawUsage));
    g.setAttribute('aSize', new T.BufferAttribute(this.outSize, 1).setUsage(T.DynamicDrawUsage));
    g.setAttribute('aShape', new T.BufferAttribute(this.shape, 1).setUsage(T.DynamicDrawUsage));
    this.u = { uPx: { value: 500 } };
    this.mesh = new T.Points(g, new T.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending,
      vertexShader: 'attribute vec4 aColor;attribute float aSize;attribute float aShape;varying vec4 vC;varying float vS;uniform float uPx;void main(){vC=aColor;vS=aShape;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=aSize*uPx/max(-mv.z,.1);}',
      fragmentShader: 'varying vec4 vC;varying float vS;void main(){vec2 p=gl_PointCoord*2.-1.;float a;if(vS>.5){a=smoothstep(.14,0.,abs(p.x+p.y*.08))*smoothstep(1.,.2,abs(p.y));}else{float d=dot(p,p);a=smoothstep(1.,0.,d);a*=a;}gl_FragColor=vec4(vC.rgb,vC.a*a);}',
    }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; scene.add(this.mesh);
  }
  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, a, o) {
    const i = this.n; this.n = (this.n + 1) % this.max; const i3 = i * 3, i4 = i * 4;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z; this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.life[i] = this.maxLife[i] = life; this.size[i] = size; this.col[i4] = r; this.col[i4 + 1] = g; this.col[i4 + 2] = b; this.baseA[i] = a;
    this.grav[i] = o && o.grav || 0; this.drag[i] = o && o.drag || 0; this.kind[i] = o && o.kind || 0; this.shape[i] = o && o.shape || 0; this.grow[i] = o && o.grow || 0;
  }
  update(dt, t) {
    const { p, v, life, maxLife, col, baseA, size, outSize, kind } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) { if (outSize[i] !== 0) { outSize[i] = 0; col[i * 4 + 3] = 0; } continue; }
      life[i] -= dt; const i3 = i * 3; const k = kind[i];
      v[i3 + 1] -= this.grav[i] * dt;
      if (this.drag[i]) { const d = Math.exp(-this.drag[i] * dt); v[i3] *= d; v[i3 + 1] *= d; v[i3 + 2] *= d; }
      if (k === 1) { v[i3] += Math.sin(t * 1.3 + i * 1.7) * dt * .5; v[i3 + 1] += Math.sin(t * 1.9 + i * .9) * dt * .3; v[i3 + 2] += Math.cos(t * 1.1 + i * 2.3) * dt * .5; }
      else if (k === 2) { p[i3] += Math.sin(t * 2.1 + i) * dt * .35; p[i3 + 2] += Math.cos(t * 1.6 + i * 1.3) * dt * .3; }
      else if (k === 3) { v[i3] += Math.sin(t * 7 + i * 1.7) * dt * 4; v[i3 + 1] += Math.sin(t * 9 + i * 2.9) * dt * 2.5; v[i3 + 2] += Math.cos(t * 8 + i * 2.3) * dt * 4; }
      p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
      size[i] += this.grow[i] * dt;
      const q = 1 - life[i] / maxLife[i];
      let a = Math.min(1, q / .15) * Math.min(1, (1 - q) / .3);
      if (k === 1) a *= .55 + .45 * Math.sin(t * 3 + i * 1.3);
      col[i * 4 + 3] = baseA[i] * Math.max(0, a); outSize[i] = life[i] > 0 ? size[i] : 0;
    }
    const at = this.mesh.geometry.attributes; at.position.needsUpdate = at.aColor.needsUpdate = at.aSize.needsUpdate = at.aShape.needsUpdate = true;
  }
}
const fxAdd = new PS(900, true), fxMix = new PS(1700, false);
function burst(pos, n, r, g, b, spd = 1.4, size = .09) {
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, e = Math.random() * 1.2, s = spd * (.4 + Math.random() * .8); fxAdd.spawn(pos.x, pos.y + .15, pos.z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s * 1.2, Math.sin(a) * Math.cos(e) * s, .6 + Math.random() * .7, size * (.6 + Math.random() * .8), r, g, b, 1, { grav: 1.6, drag: 1.2 }); }
}
function puff(pos, n = 10) {
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU; fxMix.spawn(pos.x + Math.cos(a) * .3, pos.y + .08, pos.z + Math.sin(a) * .3, Math.cos(a) * .9, .25 + Math.random() * .3, Math.sin(a) * .9, .7 + Math.random() * .5, .22, .86, .78, .66, .5, { drag: 2.4, grow: .5 }); }
}

/* resplandores de suelo (luces falsas baratas para ventanas y braseros) */
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.38)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
})();
const glowGeo = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function makeGlow(size, color, base, kind) {
  const m = new T.Mesh(glowGeo, new T.MeshBasicMaterial({ map: glowTex, color, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
  m.scale.setScalar(size); m.position.y = .05; m.renderOrder = 3; m.userData = { glow: true, base, kind, on: true, ph: Math.random() * 9 }; return m;
}
function makeFlame(s) {
  const g = new T.Group();
  [[.32, .6, 0], [.22, .46, 1], [.12, .3, 2]].forEach(([r, h, i]) => { const m = new T.Mesh(GEO.cone, flameMats[i]); m.scale.set(r * s, h * s, r * s); m.position.y = h * s / 2; m.userData = { h: h * s, r: r * s, ph: Math.random() * 9 }; g.add(m); });
  g.userData.isFlame = true; return g;
}

/* ------------------------------------------------------------- modelos
   Cada modelo devuelve un Group con base en y=0 que cabe en una casilla.   */
const C = { wood: 0xc49a6c, dark: 0x82583e, plaster: 0xf0e2c6, roof: 0xc9654a, roof2: 0xb85a48, stone: 0x9d968e, stone2: 0x847d78, thatch: 0xe2c377, soil: 0x6a4b3a, soil2: 0x5a3e30, door: 0x6d4734, green: 0x6fb055, straw: 0xe6bb5c, iron: 0x4b4543, barn: 0xb4553f, cream: 0xeadbc0, path: 0xbcae98 };
function winMesh(list) { const m = new T.Mesh(merge(list.map(([x, y, z, w, h, d]) => [GEO.box, 0xffffff, MX(x, y, z, w, h, d)])), MAT.win); m.userData.win = true; return m; }
const MODELS = {
  hearth(r) {
    const g = new T.Group(), p = [], s = [];
    cy(p, C.path, 0, 0, 0, .84, .035, GEO.cyl6, Math.PI / 6);
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; sp(s, vary(C.stone, r, .1), Math.cos(a) * .27, .06, Math.sin(a) * .27, .17, .13, .15, GEO.dod, r() * TAU); }
    for (let i = 0; i < 3; i++) p.push([GEO.cyl, C.dark, MX(0, .1, 0, .07, .42, .07, i * TAU / 6, 0, 1.25)]);
    // cobertizo de lona
    p.push([GEO.roof, C.cream, MX(-.5, .03, -.32, .5, .36, .46, .9)]);
    bx(p, C.dark, -.5, .03, -.32, .03, .38, .03, .9);
    // tronco-banco y leñera
    p.push([GEO.cyl, 0x9a6b4a, MX(.46, .07, .3, .12, .42, .12, -.6, 0, Math.PI / 2)]);
    for (let i = 0; i < 3; i++) p.push([GEO.cyl, 0xa87850, MX(.42 + (i % 2) * .09, .05 + (i > 1 ? .08 : 0), -.4 + (i > 1 ? .04 : i * .09), .08, .26, .08, .5, 0, Math.PI / 2)]);
    g.add(mk(p, MAT.build), mk(s, MAT.rock));
    const f = makeFlame(1); f.position.y = .1; g.add(f);
    g.add(makeGlow(4.2, 0xff8a3c, .38, 'fire')); g.userData = { flame: f, h: .7, smoke: new T.Vector3(0, .6, 0) };
    return g;
  },
  garden(r) {
    const g = new T.Group(), p = [], q = [];
    const ry = (r() * 3 | 0) * TAU / 6 + Math.PI / 6;
    const R = (x, z) => [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
    bx(p, C.soil, 0, 0, 0, 1.12, .05, .94, ry);
    for (let i = 0; i < 4; i++) {
      const z = -.33 + i * .22; const [fx, fz] = R(0, z); bx(p, C.soil2, fx, .04, fz, 1.0, .05, .12, ry);
      for (let j = 0; j < 6; j++) {
        const [x, zz] = R(-.42 + j * .168 + (r() - .5) * .03, z); const k = r();
        if (i === 3 && k < .5) sp(q, 0xe8963a, x, .12, zz, .12, .1, .12);
        else if (i === 2) { sp(q, 0x7fbf5e, x, .13, zz, .11, .12, .11, GEO.ico0, r() * 3); }
        else q.push([GEO.cone4, vary(C.green, r, .12), MX(x, .16, zz, .07, .16 + k * .08, .07, r() * 3)]);
      }
    }
    [[-.56, -.47], [.56, -.47], [-.56, .47], [.56, .47]].forEach(([x, z]) => { const [a, b] = R(x, z); bx(p, C.wood, a, 0, b, .05, .2, .05, ry); });
    { const [a, b] = R(0, -.47); bx(p, C.wood, a, .12, b, 1.12, .03, .03, ry); }
    // espantapájaros
    { const [a, b] = R(.38, .3); bx(p, C.dark, a, 0, b, .03, .44, .03, ry); bx(p, C.dark, a, .3, b, .3, .03, .03, ry + .3); sp(q, C.straw, a, .47, b, .11); p.push([GEO.cone, C.roof, MX(a, .55, b, .2, .09, .2)]); }
    g.add(mk(p, MAT.build), mk(q, MAT.tuft)); g.userData = { h: .5 }; return g;
  },
  lumber(r) {
    const g = new T.Group(), p = [];
    cy(p, C.path, 0, 0, 0, .8, .03, GEO.cyl6, Math.PI / 6);
    bx(p, C.wood, -.2, .03, -.14, .5, .32, .44, .2);
    p.push([GEO.roof, C.roof2, MX(-.2, .35, -.14, .62, .26, .56, .2)]);
    bx(p, C.door, -.15, .03, .085, .13, .22, .02, .2);
    for (let i = 0; i < 5; i++) { const row = i < 3 ? 0 : 1; p.push([GEO.cyl, vary(0xb9855a, r, .1), MX(.3 + (row ? .045 : 0) + (i % 3) * .09 - .09, .07 + row * .08, .22, .085, .46, .085, .25, Math.PI / 2, 0)]); }
    cy(p, 0x9a6b4a, .32, .03, -.28, .1, .1); bx(p, C.dark, .32, .12, -.28, .02, .22, .02, 0, 0, .5); bx(p, C.stone, .37, .2, -.28, .09, .06, .02);
    const w = winMesh([[-.33, .2, .09, .1, .1, .02]]); w.rotation.y = .2; w.position.set(.045, 0, .03);
    g.add(mk(p, MAT.build), w); g.userData = { h: .65 }; return g;
  },
  quarry(r) {
    const g = new T.Group(), p = [], s = [];
    cy(p, 0xa59d92, 0, 0, 0, .8, .03, GEO.cyl6, Math.PI / 6);
    [[-.28, 0, -.12, .3, .2, .26], [-.02, 0, -.2, .24, .16, .22], [-.2, .2, -.14, .22, .15, .2], [.3, 0, .3, .2, .14, .2], [-.36, 0, .26, .18, .12, .16]].forEach(([x, y, z, w, h, d]) => bx(s, vary(C.stone, r, .1), x, y + .03, z, w, h, d, r() * .5));
    // grúa de trípode
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + .4; p.push([GEO.cyl, C.dark, MX(.24 + Math.cos(a) * .15, .34, -.1 + Math.sin(a) * .15, .035, .7, .035, -a, 0, .42)]); }
    bx(p, C.dark, .24, .36, -.1, .012, .3, .012); bx(s, C.stone2, .24, .22, -.1, .14, .12, .14, .4);
    bx(p, C.wood, .0, .03, .34, .3, .12, .18, -.3); cy(p, C.dark, -.1, .03, .43, .06, .03, GEO.cyl, -.3, Math.PI / 2); cy(p, C.dark, .12, .03, .37, .06, .03, GEO.cyl, -.3, Math.PI / 2);
    g.add(mk(p, MAT.build), mk(s, MAT.rock)); g.userData = { h: .75 }; return g;
  },
  cabin(r) {
    const g = new T.Group(), p = []; const ry = (r() - .5) * .9; const roofC = r() < .5 ? C.roof : 0xb9684f;
    cy(p, C.path, 0, 0, 0, .78, .03, GEO.cyl6, Math.PI / 6);
    bx(p, C.stone, 0, .03, 0, .68, .06, .56); bx(p, C.plaster, 0, .09, 0, .62, .34, .5);
    p.push([GEO.roof, roofC, MX(0, .43, 0, .78, .34, .64)]);
    bx(p, C.plaster, 0, .43, 0, .02, .2, .49);
    bx(p, C.stone2, .2, .5, -.12, .11, .32, .11); bx(p, C.stone, .2, .82, -.12, .14, .04, .14);
    bx(p, C.door, 0, .09, .252, .13, .23, .02); bx(p, C.dark, 0, .06, .3, .2, .04, .1);
    bx(p, C.dark, -.2, .13, .262, .15, .035, .04); bx(p, C.dark, .2, .13, .262, .15, .035, .04);
    const f = []; for (let i = 0; i < 6; i++) sp(f, [0xf28fb1, 0xffd166, 0xffffff][i % 3], (i < 3 ? -.25 : .15) + (i % 3) * .05, .185, .265, .045);
    const body = mk(p, MAT.build), fl = mk(f, MAT.flower, false);
    const w = winMesh([[-.2, .26, .252, .12, .12, .02], [.2, .26, .252, .12, .12, .02], [-.312, .26, 0, .02, .12, .14], [.312, .26, 0, .02, .12, .14], [0, .26, -.252, .14, .12, .02]]);
    const glow = makeGlow(2.6, 0xffb060, .42, 'win');
    const inner = new T.Group(); inner.add(body, fl, w); inner.rotation.y = ry; g.add(inner, glow);
    g.userData = { h: .85, win: w, glowM: glow, smoke: new T.Vector3(.2, .9, -.12).applyAxisAngle(new T.Vector3(0, 1, 0), ry) }; return g;
  },
  hive(r) {
    const g = new T.Group(), p = [], q = [];
    cy(p, 0x93b86a, 0, 0, 0, .7, .025, GEO.cyl6, Math.PI / 6);
    [[-.22, .1, 1], [.2, -.12, .9], [.05, .3, .75]].forEach(([x, z, s]) => {
      bx(p, C.wood, x, .02, z, .3 * s, .1, .3 * s, r());
      for (let i = 0; i < 4; i++) sp(q, vary(C.straw, r, .06), x, .16 + i * .075 * s, z, (.3 - i * .055) * s, .11 * s, (.3 - i * .055) * s);
      sp(q, 0x3a2a1c, x + .02, .17, z + .135 * s, .06, .06, .03);
    });
    for (let i = 0; i < 7; i++) { const a = r() * TAU, d = .5 + r() * .15; sp(q, [0xf28fb1, 0xffd166, 0xffffff, 0xb79cf0][i % 4], Math.cos(a) * d, .07, Math.sin(a) * d, .06); }
    g.add(mk(p, MAT.build), mk(q, MAT.smooth)); g.userData = { h: .5 }; return g;
  },
  brazier(r) {
    const g = new T.Group(), p = [], s = [];
    cy(s, C.stone, 0, 0, 0, .26, .07, GEO.cyl6); cy(s, C.stone2, 0, .07, 0, .13, .3, GEO.taper);
    cy(p, C.iron, 0, .37, 0, .24, .11, GEO.bowl);
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; sp(s, vary(C.stone, r, .1), Math.cos(a) * .42, .04, Math.sin(a) * .42, .13, .09, .12, GEO.dod, r() * 3); }
    g.add(mk(p, MAT.build), mk(s, MAT.rock));
    const f = makeFlame(.62); f.position.y = .44; g.add(f);
    const glow = makeGlow(3.2, 0xff8a3c, .36, 'fire'); g.add(glow);
    g.userData = { flame: f, glowM: glow, h: .8 }; return g;
  },
  granary(r) {
    const g = new T.Group(), p = [], q = [];
    cy(p, C.path, 0, 0, 0, .8, .03, GEO.cyl6, Math.PI / 6);
    bx(p, C.stone, -.06, .03, -.04, .74, .07, .6, .25); bx(p, C.barn, -.06, .1, -.04, .68, .42, .54, .25);
    p.push([GEO.roof, C.thatch, MX(-.06, .52, -.04, .84, .4, .68, .25)]);
    bx(p, C.barn, -.06, .52, -.04, .02, .26, .53, .25);
    bx(p, C.cream, -.06 + Math.sin(.25) * .275, .1, -.04 + Math.cos(.25) * .275, .24, .3, .02, .25);
    bx(p, C.dark, -.06 + Math.sin(.25) * .28, .1, -.04 + Math.cos(.25) * .28, .02, .3, .025, .25);
    q.push([GEO.cyl, C.straw, MX(.38, .12, .34, .22, .2, .22, .5, Math.PI / 2, 0)]);
    sp(q, 0xe9dcc0, .16, .1, .46, .16, .2, .15); sp(q, 0xdccdae, .04, .09, .5, .14, .17, .14);
    const w = winMesh([[0, .66, .345, .1, .1, .02]]); w.rotation.y = .25; w.position.set(-.06, 0, -.04);
    g.add(mk(p, MAT.build), mk(q, MAT.smooth), w); g.userData = { h: .95 }; return g;
  },
  greenhouse(r) {
    const g = new T.Group(), p = [], q = [], gl = [];
    cy(p, C.path, 0, 0, 0, .78, .03, GEO.cyl6, Math.PI / 6);
    const ry = .5; bx(p, C.stone, 0, .03, 0, .8, .1, .6, ry); bx(p, C.soil2, 0, .1, 0, .72, .04, .52, ry);
    const R = (x, z) => [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const [a, b] = R(sx * .38, sz * .28); bx(p, 0xf5efe2, a, .13, b, .03, .3, .03, ry); }
    for (const sz of [-1, 0, 1]) { const [a, b] = R(0, sz * .28); p.push([GEO.box, 0xf5efe2, MX(a, .43 + (sz === 0 ? .2 : 0), b, sz === 0 ? .03 : .8, .03, sz === 0 ? .6 : .03, ry)]); }
    for (const sx of [-1, 1]) { const [a, b] = R(sx * .38, 0); bx(p, 0xf5efe2, a, .41, b, .03, .03, .58, ry); }
    gl.push([GEO.box, 0xffffff, MX(0, .28, 0, .76, .3, .56, ry)]); gl.push([GEO.roof, 0xffffff, MX(0, .43, 0, .56, .22, .8, ry + Math.PI / 2)]);
    for (let i = 0; i < 8; i++) { const [a, b] = R(-.28 + (i % 4) * .19, i < 4 ? -.12 : .12); sp(q, vary(C.green, r, .15), a, .2 + r() * .04, b, .14, .16 + r() * .08, .14, GEO.ico0, r() * 3); if (r() < .5) sp(q, 0xe5533d, a + .03, .25, b + .02, .05); }
    const glass = new T.Mesh(merge(gl), MAT.glass); glass.renderOrder = 2;
    const glow = makeGlow(2.2, 0xffd27a, .3, 'win');
    g.add(mk(p, MAT.build), mk(q, MAT.smooth, false), glass, glow); g.userData = { h: .7, glowM: glow }; return g;
  },
  beacon(r) {
    const g = new T.Group(), p = [], s = [];
    cy(s, C.stone2, 0, 0, 0, .56, .12, GEO.cyl6); cy(s, C.stone, 0, .12, 0, .44, .1, GEO.cyl6, .5);
    cy(p, C.plaster, 0, .22, 0, .3, .92, GEO.taper); cy(s, C.stone, 0, 1.14, 0, .3, .06, GEO.cyl);
    bx(p, C.door, 0, .22, .27, .12, .22, .06);
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; bx(p, C.dark, Math.cos(a) * .2, 1.2, Math.sin(a) * .2, .025, .36, .025); }
    cy(p, 0x5fa08f, 0, 1.56, 0, .32, .06, GEO.cyl); p.push([GEO.cone, 0x5fa08f, MX(0, 1.78, 0, .6, .36, .6)]); sp(p, 0xe2c377, 0, 1.99, 0, .07);
    for (let i = 0; i < 3; i++) bx(p, C.roof, Math.cos(i * 2.1) * .25, .4 + i * .22, Math.sin(i * 2.1) * .25, .02, .1, .08, -i * 2.1);
    const cr = new T.Mesh(GEO.oct, MAT.beacon); cr.scale.set(.24, .34, .24); cr.position.y = 1.38;
    const w = winMesh([[0, .7, .215, .08, .12, .02], [0, .95, .19, .07, .1, .02]]);
    const glow = makeGlow(9, 0xffc878, .65, 'beacon');
    g.add(mk(p, MAT.build), mk(s, MAT.rock), cr, w, glow); g.userData = { h: 2.0, crystal: cr, glowM: glow }; return g;
  },
  sapling(r) {
    const g = new T.Group(), a = [], b = [], c = []; treeParts(a, b, c, r, 0, 0, 0, .55);
    cy(a, C.soil, 0, 0, 0, .22, .03);
    g.add(mk(a, MAT.build)); if (b.length) g.add(mk(b, MAT.pine)); if (c.length) g.add(mk(c, MAT.leaf)); g.userData = { h: .5 }; return g;
  },
};
function villagerMesh(r) {
  const p = []; const cloth = [0xd9694f, 0x5b8fb9, 0xe2b04a, 0x7aa35a, 0xb07cc6, 0xe58f6a][r() * 6 | 0];
  cy(p, cloth, 0, 0, 0, .062, .15, GEO.taper); sp(p, 0xf2cba6, 0, .2, 0, .1);
  p.push([GEO.cone, r() < .5 ? C.straw : cloth, MX(0, .265, 0, .17, .08, .17)]);
  const m = mk(p, MAT.smooth); return m;
}
