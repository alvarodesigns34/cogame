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
const RADIUS = 5;
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
const camera = new T.PerspectiveCamera(30, 1, 1.5, 500);

const U = { uTime: { value: 0 }, uSnow: { value: 0 }, uWind: { value: 1 }, uIce: { value: 0 }, uCloud: { value: 0 }, uWet: { value: 0 }, uRim: { value: new T.Color(0, 0, 0) }, uSky: { value: new T.Color(.6, .8, 1) } };

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
const depthTex = new T.DepthTexture(4, 4); depthTex.minFilter = depthTex.magFilter = T.NearestFilter;
const RT = {
  scene: new T.WebGLRenderTarget(4, 4, { type: T.HalfFloatType, depthTexture: depthTex }),
  ao: new T.WebGLRenderTarget(4, 4, rtOpt), ao2: new T.WebGLRenderTarget(4, 4, rtOpt),
  h1: new T.WebGLRenderTarget(4, 4, rtOpt), h2: new T.WebGLRenderTarget(4, 4, rtOpt),
  q1: new T.WebGLRenderTarget(4, 4, rtOpt), q2: new T.WebGLRenderTarget(4, 4, rtOpt),
  e1: new T.WebGLRenderTarget(4, 4, rtOpt), e2: new T.WebGLRenderTarget(4, 4, rtOpt),
  ldr: new T.WebGLRenderTarget(4, 4, { depthBuffer: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter }),
};
const post = { sun: new T.Vector2(.5, 1.2) }; let camFocus = 35;
const mCopy = smat('uniform sampler2D t;varying vec2 vUv;void main(){gl_FragColor=texture2D(t,vUv);}', { t: { value: null } });
const mBright = smat('uniform sampler2D t;varying vec2 vUv;void main(){vec3 c=texture2D(t,vUv).rgb;float l=max(c.r,max(c.g,c.b));gl_FragColor=vec4(c*smoothstep(.95,1.7,l),1.);}', { t: { value: null } });
const mBlur = smat(`uniform sampler2D t;uniform vec2 d;varying vec2 vUv;
void main(){vec3 c=texture2D(t,vUv).rgb*.227027;
c+=(texture2D(t,vUv+d*1.3846)+texture2D(t,vUv-d*1.3846)).rgb*.316216;
c+=(texture2D(t,vUv+d*3.2308)+texture2D(t,vUv-d*3.2308)).rgb*.070270;
gl_FragColor=vec4(c,1.);}`, { t: { value: null }, d: { value: new T.Vector2() } });
/* oclusión ambiental en espacio de pantalla a partir de la profundidad */
const mAO = smat(`uniform sampler2D tDepth;uniform mat4 uProj,uInv;uniform vec2 uRes;uniform float uRad;varying vec2 vUv;
vec3 vp(vec2 uv){float d=texture2D(tDepth,uv).x;vec4 p=uInv*vec4(uv*2.-1.,d*2.-1.,1.);return p.xyz/p.w;}
float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){vec3 p=vp(vUv);if(-p.z>240.){gl_FragColor=vec4(1.);return;}
 vec3 n=normalize(cross(dFdx(p),dFdy(p)));if(n.z<0.)n=-n;
 float rn=h(vUv*uRes)*6.2832,occ=0.;
 for(int i=0;i<11;i++){float fi=float(i);float a=rn+fi*2.399,b=fi*1.713+rn*.5;
  vec3 sv=vec3(cos(a)*sin(b),sin(a)*sin(b),cos(b));if(dot(sv,n)<0.)sv=-sv;
  vec3 s=p+n*.03+sv*uRad*(.25+.75*fract(fi*.618+rn));
  vec4 q=uProj*vec4(s,1.);vec2 suv=q.xy/q.w*.5+.5;float sz=vp(suv).z;
  occ+=step(s.z+.04,sz)*smoothstep(0.,1.,uRad*1.6/max(abs(p.z-sz),.0001));}
 gl_FragColor=vec4(vec3(1.-occ/11.),1.);}`, { tDepth: { value: depthTex }, uProj: { value: new T.Matrix4() }, uInv: { value: new T.Matrix4() }, uRes: { value: new T.Vector2() }, uRad: { value: .55 } });
/* rayos de sol: desenfoque radial del cielo visible hacia la posición del sol */
const mRays = smat(`uniform sampler2D tDepth;uniform vec2 uSun;varying vec2 vUv;
void main(){vec2 dl=(uSun-vUv)/30.;vec2 uv=vUv;float a=0.,w=1.;
 for(int i=0;i<30;i++){uv+=dl;vec2 c=clamp(uv,0.,1.);a+=step(.99999,texture2D(tDepth,c).x)*smoothstep(1.1,.1,distance(uv,uSun))*w;w*=.955;}
 gl_FragColor=vec4(vec3(a/14.),1.);}`, { tDepth: { value: depthTex }, uSun: { value: post.sun } });
const mFinal = smat(`uniform sampler2D tScene,tBlur,tBloom,tBloom2,tAO,tRays,tDepth;uniform float uExp,uBloom,uTilt,uVig,uSat,uFocus,uRange,uNear,uFar,uAO,uRays;uniform vec3 uTint,uRayCol;varying vec2 vUv;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
float lin(float d){float z=d*2.-1.;return 2.*uNear*uFar/(uFar+uNear-z*(uFar-uNear));}
void main(){
 vec2 q=vUv-.5;float r2=dot(q,q);vec2 ca=q*r2*.011;
 vec3 c=vec3(texture2D(tScene,vUv+ca).r,texture2D(tScene,vUv).g,texture2D(tScene,vUv-ca).b);
 float dz=texture2D(tDepth,vUv).x;float sky=step(.99999,dz);
 c*=mix(1.,texture2D(tAO,vUv).r,uAO*(1.-sky));
 float coc=smoothstep(.12,1.,abs(lin(dz)-uFocus)/uRange);
 coc=max(coc,smoothstep(.2,.52,abs(vUv.y-.5))*uTilt*.5);coc=mix(coc,.5,sky);
 c=mix(c,texture2D(tBlur,vUv).rgb,coc);
 c+=(texture2D(tBloom,vUv).rgb+texture2D(tBloom2,vUv).rgb*.8)*uBloom;
 c+=uRayCol*texture2D(tRays,vUv).r*uRays;
 c=aces(c*uExp*uTint);
 c=pow(c,vec3(1./2.2));
 float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,uSat);
 c=mix(c,c*c*(3.-2.*c),.2);
 c*=1.-r2*uVig;
 gl_FragColor=vec4(c,1.);}`, {
  tScene: { value: null }, tBlur: { value: null }, tBloom: { value: null }, tBloom2: { value: null }, tAO: { value: null }, tRays: { value: null }, tDepth: { value: depthTex },
  uExp: { value: 1.1 }, uBloom: { value: .7 }, uTilt: { value: .85 }, uFade: { value: 0 }, uVig: { value: .7 }, uSat: { value: 1.12 }, uTint: { value: new T.Color(1, 1, 1) },
  uFocus: { value: 35 }, uRange: { value: 30 }, uNear: { value: 1.5 }, uFar: { value: 500 }, uAO: { value: .85 }, uRays: { value: 0 }, uRayCol: { value: new T.Color(1, .9, .7) },
});
/* suavizado FXAA sobre la imagen final + grano y fundido */
const mFXAA = smat(`uniform sampler2D t;uniform vec2 px;uniform float uTime,uFade;varying vec2 vUv;
float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){vec3 L=vec3(.299,.587,.114);
 vec3 nw=texture2D(t,vUv+vec2(-1.,-1.)*px).rgb,ne=texture2D(t,vUv+vec2(1.,-1.)*px).rgb,sw=texture2D(t,vUv+vec2(-1.,1.)*px).rgb,se=texture2D(t,vUv+vec2(1.,1.)*px).rgb,m=texture2D(t,vUv).rgb;
 float lnw=dot(nw,L),lne=dot(ne,L),lsw=dot(sw,L),lse=dot(se,L),lm=dot(m,L);
 float mn=min(lm,min(min(lnw,lne),min(lsw,lse))),mx=max(lm,max(max(lnw,lne),max(lsw,lse)));
 vec2 dir=vec2(-((lnw+lne)-(lsw+lse)),((lnw+lsw)-(lne+lse)));
 float red=max((lnw+lne+lsw+lse)*.03125,.0078125);
 dir=clamp(dir/(min(abs(dir.x),abs(dir.y))+red),-8.,8.)*px;
 vec3 A=.5*(texture2D(t,vUv+dir*(1./3.-.5)).rgb+texture2D(t,vUv+dir*(2./3.-.5)).rgb);
 vec3 B=A*.5+.25*(texture2D(t,vUv-dir*.5).rgb+texture2D(t,vUv+dir*.5).rgb);
 float lb=dot(B,L);vec3 c=(lb<mn||lb>mx)?A:B;
 c+=(h(vUv*871.+uTime)-.5)*.014;
 gl_FragColor=vec4(c*uFade,1.);}`, { t: { value: null }, px: { value: new T.Vector2() }, uTime: U.uTime, uFade: mFinal.uniforms.uFade });
function pass(mat, target) { fsMesh.material = mat; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); }
function blur2(a, b, w, h, s) { mBlur.uniforms.t.value = a.texture; mBlur.uniforms.d.value.set(s / w, 0); pass(mBlur, b); mBlur.uniforms.t.value = b.texture; mBlur.uniforms.d.value.set(0, s / h); pass(mBlur, a); }
let quality = 1, VW = 1, VH = 1;
function resize() {
  const w = innerWidth, h = innerHeight, pr = Math.min(devicePixelRatio || 1, 2) * quality;
  renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
  VW = Math.max(8, Math.floor(w * pr)); VH = Math.max(8, Math.floor(h * pr));
  RT.scene.setSize(VW, VH); RT.ldr.setSize(VW, VH);
  for (const k of ['ao', 'ao2', 'h1', 'h2']) RT[k].setSize(VW >> 1, VH >> 1);
  RT.q1.setSize(VW >> 2, VH >> 2); RT.q2.setSize(VW >> 2, VH >> 2); RT.e1.setSize(VW >> 3, VH >> 3); RT.e2.setSize(VW >> 3, VH >> 3);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
function renderFrame() {
  renderer.setRenderTarget(RT.scene); renderer.render(scene, camera);
  mAO.uniforms.uProj.value.copy(camera.projectionMatrix); mAO.uniforms.uInv.value.copy(camera.projectionMatrixInverse); mAO.uniforms.uRes.value.set(VW >> 1, VH >> 1);
  pass(mAO, RT.ao); blur2(RT.ao, RT.ao2, VW >> 1, VH >> 1, 1.1);
  mCopy.uniforms.t.value = RT.scene.texture; pass(mCopy, RT.h1); blur2(RT.h1, RT.h2, VW >> 1, VH >> 1, 1.5);
  mBright.uniforms.t.value = RT.h1.texture; pass(mBright, RT.q1); blur2(RT.q1, RT.q2, VW >> 2, VH >> 2, 1.6);
  mCopy.uniforms.t.value = RT.q1.texture; pass(mCopy, RT.e1); blur2(RT.e1, RT.e2, VW >> 3, VH >> 3, 2);
  const u = mFinal.uniforms;
  if (u.uRays.value > .003) pass(mRays, RT.q2);
  u.tScene.value = RT.scene.texture; u.tBlur.value = RT.h1.texture; u.tBloom.value = RT.q1.texture; u.tBloom2.value = RT.e1.texture; u.tAO.value = RT.ao.texture; u.tRays.value = RT.q2.texture;
  u.uFocus.value = camFocus; u.uRange.value = camFocus * .8 + 3;
  pass(mFinal, RT.ldr);
  mFXAA.uniforms.t.value = RT.ldr.texture; mFXAA.uniforms.px.value.set(1 / VW, 1 / VH); pass(mFXAA, null);
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
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;varying vec3 vWN;uniform float uTime;uniform float uWind;' + (o.water ? 'attribute float aShore;varying float vShore;' : ''))
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp0=modelMatrix*vec4(transformed,1.);
        ${o.sway ? `float gust=.55+.6*sin(uTime*.7+wp0.x*.33+wp0.z*.21)*sin(uTime*.31-wp0.x*.11+wp0.z*.17);
        float swk=max(position.y-${(o.base || 0).toFixed(2)},0.)*${o.sway.toFixed(3)}*uWind*(.45+gust);
        transformed.x+=sin(uTime*1.7+wp0.x*1.3+wp0.z*.9)*swk;
        transformed.z+=cos(uTime*1.3+wp0.x*.7-wp0.z*1.1)*swk*.7;` : ''}
        ${o.water ? 'vShore=aShore;' : ''}
        vWPos=wp0.xyz;vWN=normalize(mat3(modelMatrix)*objectNormal);`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;varying vec3 vWN;uniform float uSnow;uniform float uTime;uniform float uIce;uniform float uCloud;uniform float uWet;uniform vec3 uRim;uniform vec3 uSky;' + (o.water ? 'varying float vShore;' : '') + GLSL_NOISE)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${o.noise ? `diffuseColor.rgb*=${(1 - o.noise / 2).toFixed(2)}+${o.noise.toFixed(2)}*vnoise(vWPos.xz*${(o.scale || 2.2).toFixed(1)});` : ''}
        ${o.water ? `float rp=vnoise(vWPos.xz*2.3+vec2(uTime*.16,uTime*.11));
        float rp2=vnoise(vWPos.xz*5.5-vec2(uTime*.2,uTime*.14));
        vec3 Vw=normalize(cameraPosition-vWPos);float fr=pow(1.-clamp(Vw.y,0.,1.),2.2);
        vec3 wc=mix(diffuseColor.rgb*.62,diffuseColor.rgb*1.2,rp);
        wc=mix(wc,uSky,fr*.7);
        wc+=smoothstep(.70,.78,rp*.55+rp2*.55)*.25*(1.-uIce);
        float foam=smoothstep(.74,.92,vShore+(rp2-.5)*.4+sin(vShore*16.-uTime*1.8)*.07)*(1.-uIce);
        wc+=smoothstep(.83,.9,vnoise(vWPos.xz*11.+floor(uTime*7.)*5.37))*uWet*.3;
        wc=mix(wc,vec3(1.),foam*.85);
        diffuseColor.rgb=mix(wc,vec3(.80,.90,.97)*(.9+.12*rp2),uIce*.92);` : ''}
        ${o.snow !== 0 ? `float sn=uSnow*smoothstep(.3,.75,vWN.y+(vnoise(vWPos.xz*3.4)-.5)*.35)*${(o.snow || 1).toFixed(2)};
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.92,.95,1.),sn);` : ''}
        float csh=smoothstep(.5,.74,vnoise(vWPos.xz*.19+uTime*vec2(.045,.024)));
        diffuseColor.rgb*=(1.-csh*uCloud*.32)*(1.-uWet*.13);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${o.rim !== 0 ? 'totalEmissiveRadiance+=uRim*pow(1.-clamp(dot(normalize(vWN),normalize(cameraPosition-vWPos)),0.,1.),3.)*diffuseColor.rgb;' : ''}`);
  };
  mat.customProgramCacheKey = () => JSON.stringify(o);
  return mat;
}
const std = (p, o) => enhance(new T.MeshStandardMaterial(Object.assign({ roughness: .9, metalness: 0 }, p)), o);
const MAT = {
  soil: std({ vertexColors: true, flatShading: true }, { snow: 0, noise: .2, scale: 3 }),
  grass: std({ color: 0x8fc46a, vertexColors: true }, { noise: .26, scale: 1.7 }),
  rockTop: std({ color: 0xa39c93, vertexColors: true, flatShading: true }, { noise: .2 }),
  water: std({ color: 0x3f9fc4, roughness: .42, metalness: 0 }, { water: 1, snow: 0, rim: 0 }),
  flag: std({ vertexColors: true, side: T.DoubleSide, roughness: .8 }, { snow: 0, rim: 0 }),
  toy: std({ vertexColors: true, roughness: .7 }, { snow: 0 }),
  bird: new T.MeshStandardMaterial({ color: 0xf6f1e8, side: T.DoubleSide, roughness: 1 }),
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
  crystal: new T.MeshBasicMaterial({ color: 0x66ffee }),
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
sun.castShadow = true; sun.shadow.mapSize.set(3072, 3072);
Object.assign(sun.shadow.camera, { left: -12.5, right: 12.5, top: 12.5, bottom: -12.5, near: 1, far: 80 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.035; sun.shadow.radius = 3;
scene.add(sun, sun.target);
const hearthLight = new T.PointLight(0xff9448, 0, 9, 1.4); hearthLight.position.set(0, .7, 0); world.add(hearthLight);

/* cielo: gradiente, disco solar/lunar, estrellas y aurora */
const skyU = {
  uZen: { value: new T.Color() }, uHor: { value: new T.Color() }, uGnd: { value: new T.Color() }, uSunDir: { value: new T.Vector3(0, 1, 0) },
  uMoonDir: { value: new T.Vector3(0, -1, 0) }, uSunCol: { value: new T.Color() }, uNight: { value: 0 }, uAurora: { value: 0 }, uCloudAmt: { value: .6 }, uTime: U.uTime,
};
const sky = new T.Mesh(new T.SphereGeometry(300, 40, 20), new T.ShaderMaterial({
  side: T.BackSide, depthWrite: false, fog: false, uniforms: skyU,
  vertexShader: 'varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `varying vec3 vD;uniform vec3 uZen,uHor,uGnd,uSunDir,uMoonDir,uSunCol;uniform float uNight,uAurora,uTime,uCloudAmt;${GLSL_NOISE}
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
   c+=vec3(.3,.36,.6)*pow(vnoise(d.xy*5.+3.)*smoothstep(.55,0.,abs(d.z+d.x*.4)),2.)*uNight*.9*smoothstep(0.,.3,h);
   if(h>.02){vec2 cp=d.xz/(h+.3)*1.5+uTime*vec2(.006,.003);float cl=smoothstep(.48,.8,vnoise(cp)*.6+vnoise(cp*2.3)*.3+vnoise(cp*5.)*.15)*smoothstep(.02,.3,h);
    c=mix(c,mix(uHor,vec3(1.),.65)*(1.-uNight*.82)+uSunCol*.12,cl*uCloudAmt);}
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
  for (let i = 0; i < 16; i++) {
    const m = makeCloud(r), low = i < 5;
    const o = { m, a: r() * TAU, rad: low ? 30 + r() * 30 : 30 + r() * 30, y: low ? -6 - r() * 5 : 9 + r() * 9, sp: (.006 + r() * .012) * (r() < .5 ? 1 : .7), s: low ? 1.6 + r() * 2.4 : .8 + r() * 1.1 };
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
  const birch = r() < .28;
  cy(trunk, birch ? 0xe9e4d8 : 0x80593f, x, y, z, (birch ? .04 : .055) * s, (birch ? .46 : .36) * s);
  if (birch) { y += .1 * s; bx(trunk, 0x4a423c, x, y + .1 * s, z, .085 * s, .02 * s, .085 * s); bx(trunk, 0x4a423c, x, y + .22 * s, z, .085 * s, .015 * s, .085 * s); }
  const tint = birch ? new T.Color(1.12, 1.12, .62) : vary(0xffffff, r, .12);
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
    this.u = { uPx: { value: 500 }, uLight: { value: 1 } };
    this.mesh = new T.Points(g, new T.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending,
      vertexShader: 'attribute vec4 aColor;attribute float aSize;attribute float aShape;varying vec4 vC;varying float vS;uniform float uPx;uniform float uLight;void main(){vC=vec4(aColor.rgb*uLight,aColor.a);vS=aShape;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=aSize*uPx/max(-mv.z,.1);}',
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
const fxAdd = new PS(1400, true), fxMix = new PS(2800, false);
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
    const cr = new T.Mesh(GEO.oct, MAT.beacon); cr.scale.set(.3, .4, .3); cr.position.y = 1.38;
    const beam = new T.Mesh(new T.CylinderGeometry(.9, .06, 16, 14, 1, true), new T.MeshBasicMaterial({ color: new T.Color().setRGB(1.6, 1.15, .55), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false })); beam.position.y = 9.4; beam.userData = { glow: true, base: .13, kind: 'beacon', on: true, ph: 0 }; g.add(beam);
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

/* sombra de contacto falsa: ancla edificios y arboledas al suelo */
function makeBlob(size, op = .34) {
  const m = new T.Mesh(glowGeo, new T.MeshBasicMaterial({ map: glowTex, color: 0x1a120c, transparent: true, opacity: op, depthWrite: false }));
  m.scale.setScalar(size); m.position.y = .025; m.renderOrder = 1; return m;
}
function pennant(col) {
  const g = new T.Group(), p = []; bx(p, C.dark, 0, 0, 0, .025, 1.05, .025); sp(p, C.straw, 0, 1.07, 0, .05);
  const fg = new T.BufferGeometry(); fg.setAttribute('position', new T.Float32BufferAttribute([0, 1.02, 0, 0, .82, 0, .34, .92, 0], 3));
  const c = new T.Color(col); fg.setAttribute('color', new T.Float32BufferAttribute([c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b], 3)); fg.computeVertexNormals();
  const f = new T.Mesh(fg, MAT.flag); f.userData.flag = Math.random() * 9; g.add(mk(p, MAT.build), f); return g;
}
Object.assign(MODELS, {
  well(r) {
    const g = new T.Group(), p = [], s = [];
    cy(p, C.path, 0, 0, 0, .7, .03, GEO.cyl6, Math.PI / 6);
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; bx(s, vary(C.stone, r, .1), Math.cos(a) * .26, .03, Math.sin(a) * .26, .21, .24, .13, -a + Math.PI / 2); }
    cy(p, 0x2f7f9f, 0, .2, 0, .2, .02);
    bx(p, C.dark, -.3, .03, 0, .05, .62, .05); bx(p, C.dark, .3, .03, 0, .05, .62, .05);
    p.push([GEO.roof, C.roof, MX(0, .62, 0, .82, .22, .44)]);
    p.push([GEO.cyl, C.wood, MX(0, .52, 0, .05, .6, .05, 0, 0, Math.PI / 2)]);
    bx(p, C.dark, 0, .3, 0, .012, .22, .012); cy(p, C.wood, 0, .24, 0, .06, .09, GEO.bowl);
    g.add(mk(p, MAT.build), mk(s, MAT.rock)); g.userData = { h: .85 }; return g;
  },
  fisher(r) {
    const g = new T.Group(), p = [], q = [];
    cy(p, C.path, 0, 0, -.1, .6, .03, GEO.cyl6, Math.PI / 6);
    bx(p, C.wood, -.12, .03, -.25, .46, .3, .4); p.push([GEO.roof, 0x5f8fa8, MX(-.12, .33, -.25, .58, .26, .52)]);
    bx(p, C.door, -.12, .03, -.045, .12, .2, .02);
    bx(p, 0xb08a62, .12, .01, .64, .3, .05, 1.0); for (const z of [.3, .7, 1.1]) for (const x of [0, .24]) bx(p, C.dark, x, -.22, z, .04, .32, .04);
    p.push([GEO.cyl, C.dark, MX(.2, .3, 1.02, .02, .62, .02, 0, .7, 0)]);
    bx(p, C.dark, .34, .03, -.32, .03, .4, .03); bx(p, C.dark, .34, .03, 0, .03, .4, .03); bx(p, C.dark, .34, .4, -.16, .02, .02, .36);
    for (let i = 0; i < 3; i++) sp(q, 0x9fc3d8, .34, .32, -.27 + i * .11, .04, .13, .07);
    sp(q, 0xd9694f, .05, .1, .95, .1, .08, .1);
    const w = winMesh([[-.26, .2, -.045, .09, .09, .02]]);
    g.add(mk(p, MAT.build), mk(q, MAT.smooth), w); g.userData = { h: .65 }; return g;
  },
  mill(r) {
    const g = new T.Group(), p = [], s = [], q = [];
    cy(p, C.path, 0, 0, 0, .78, .03, GEO.cyl6, Math.PI / 6);
    cy(s, C.stone, 0, .03, 0, .35, .16, GEO.cyl); cy(p, C.plaster, 0, .19, 0, .3, .74, GEO.taper);
    p.push([GEO.cone, C.roof, MX(0, 1.09, 0, .52, .34, .52)]);
    bx(p, C.door, 0, .19, .27, .12, .22, .05); bx(p, C.dark, 0, .9, .15, .05, .05, .32);
    sp(q, 0xe9dcc0, .42, .1, .3, .16, .2, .15); sp(q, 0xdccdae, .5, .09, .16, .14, .17, .14);
    const sails = new T.Group(), sl = [];
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, c = Math.cos(a), sn = Math.sin(a); sl.push([GEO.box, C.dark, MX(c * .32, sn * .32, 0, .66, .03, .02, 0, 0, a)]); sl.push([GEO.box, C.cream, MX(c * .38 - sn * .075, sn * .38 + c * .075, 0, .46, .12, .012, 0, 0, a)]); }
    sails.add(mk(sl, MAT.toy)); sails.position.set(0, .925, .32);
    const w = winMesh([[0, .6, .215, .07, .1, .02]]);
    g.add(mk(p, MAT.build), mk(s, MAT.rock), mk(q, MAT.smooth), sails, w); g.userData = { h: 1.35, sails }; return g;
  },
  flowerbed(r) {
    const g = new T.Group(), p = [], f = [], q = [];
    cy(p, 0x7a5a44, 0, 0, 0, .76, .05, GEO.cyl6, Math.PI / 6); cy(p, C.path, 0, .03, 0, .24, .035, GEO.cyl);
    const pal = [0xf28fb1, 0xffd166, 0xffffff, 0xb79cf0, 0xff9f6b, 0xe5533d];
    for (let i = 0; i < 38; i++) { const a = r() * TAU, d = .32 + r() * .38, x = Math.cos(a) * d, z = Math.sin(a) * d; q.push([GEO.cone4, vary(C.green, r, .15), MX(x, .1, z, .05, .12, .05)]); sp(f, pal[(a / TAU * 6 | 0) % 6], x, .17 + r() * .05, z, .075 + r() * .03); }
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + .5; sp(q, vary(0x5f9f4f, r, .1), Math.cos(a) * .54, .12, Math.sin(a) * .54, .24, .2, .24); }
    bx(p, C.wood, 0, .14, 0, .26, .03, .1); bx(p, C.dark, -.1, .05, 0, .03, .1, .08); bx(p, C.dark, .1, .05, 0, .03, .1, .08);
    g.add(mk(p, MAT.build), mk(q, MAT.tuft, false), mk(f, MAT.flower, false)); g.userData = { h: .4 }; return g;
  },
  lantern(r) {
    const g = new T.Group(), p = [], s = [];
    cy(s, C.stone, 0, 0, 0, .14, .08, GEO.cyl6); bx(p, C.dark, 0, .08, 0, .05, .64, .05); bx(p, C.dark, .1, .68, 0, .26, .04, .04);
    bx(p, C.iron, .2, .62, 0, .02, .06, .02); bx(p, C.iron, .2, .42, 0, .13, .03, .13); p.push([GEO.cone4, C.iron, MX(.2, .64, 0, .2, .07, .2, Math.PI / 4)]);
    for (let i = 0; i < 4; i++) { const a = r() * TAU; sp(s, vary(C.stone, r, .1), Math.cos(a) * .32, .03, Math.sin(a) * .32, .1, .07, .1, GEO.dod); }
    const w = winMesh([[.2, .525, 0, .1, .16, .1]]), glow = makeGlow(2.6, 0xffb060, .5, 'win'); glow.position.x = .2;
    const inner = new T.Group(); inner.add(mk(p, MAT.build), mk(s, MAT.rock), w, glow); inner.rotation.y = r() * TAU; g.add(inner); g.userData = { h: .8 }; return g;
  },
});
function balloonModel() {
  const g = new T.Group(), sg = new T.SphereGeometry(1, 16, 10).toNonIndexed(); sg.scale(1, 1.18, 1);
  const pos = sg.attributes.position, col = new Float32Array(pos.count * 3), cs = [new T.Color(0xf3e3c3), new T.Color(0xd9694f), new T.Color(0xf3e3c3), new T.Color(0x4f86b0)];
  for (let i = 0; i < pos.count; i += 3) { const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3; const c = cs[Math.floor((Math.atan2(z, x) + Math.PI) / TAU * 8 + .001) % 4]; for (let j = 0; j < 3; j++) col.set([c.r, c.g, c.b], (i + j) * 3); }
  sg.setAttribute('color', new T.BufferAttribute(col, 3));
  const env = new T.Mesh(sg, MAT.toy); env.position.y = 2.25; env.castShadow = true;
  const p = []; cy(p, 0xd9694f, 0, 1.0, 0, .34, .3, GEO.bowl); bx(p, 0xa87850, 0, 0, 0, .36, .26, .36); bx(p, C.dark, 0, .24, 0, .4, .04, .4);
  for (const [x, z] of [[-.16, -.16], [.16, -.16], [-.16, .16], [.16, .16]]) bx(p, C.dark, x, .26, z, .015, .8, .015);
  sp(p, 0xe9dcc0, .22, .12, 0, .12, .14, .1); sp(p, 0xe2b04a, -.22, .14, .05, .1);
  const f = makeFlame(.4); f.position.y = .86;
  g.add(env, mk(p, MAT.toy), f, pennant(0xf4a95e)); g.children[3].position.set(0, 3.2, 0); g.children[3].scale.setScalar(.6);
  const pk = new T.Mesh(new T.SphereGeometry(1.45, 8, 6), new T.MeshBasicMaterial({ visible: false })); pk.position.y = 1.8; pk.userData.balloon = true; g.add(pk); g.userData.pick = pk;
  return g;
}
function birdModel() {
  const g = new T.Group(), body = new T.Mesh(GEO.oct, MAT.bird); body.scale.set(.07, .06, .24);
  const wg = new T.BufferGeometry(); wg.setAttribute('position', new T.Float32BufferAttribute([0, 0, -.07, 0, 0, .08, .3, 0, .02], 3)); wg.computeVertexNormals();
  const wl = new T.Mesh(wg, MAT.bird), wr = new T.Mesh(wg, MAT.bird); wr.scale.x = -1; g.add(body, wl, wr); g.userData = { wl, wr }; return g;
}
function makeWaterfall() {
  const g = new T.PlaneGeometry(1.0, 7, 1, 16); g.translate(0, -3.5, 0);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, y * y * .014); }
  const m = new T.Mesh(g, new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.DoubleSide, uniforms: { uTime: U.uTime, uIce: U.uIce, uLight: { value: 1 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv;uniform float uTime,uIce,uLight;${GLSL_NOISE}
    void main(){float v=vUv.y,t=uTime*(1.-uIce);
     float n=vnoise(vec2(vUv.x*7.,v*5.+t*2.2))*.6+vnoise(vec2(vUv.x*19.,v*11.+t*3.6))*.4;
     vec3 c=mix(vec3(.3,.62,.82),vec3(1.05),smoothstep(.42,.8,n));c=mix(c,vec3(.82,.92,.98),uIce*.75);
     float a=smoothstep(0.,.4,v)*(.5+.5*n)*smoothstep(0.,.1,vUv.x)*smoothstep(1.,.9,vUv.x);
     gl_FragColor=vec4(c*uLight,a*.92);}`,
  }));
  m.renderOrder = 2; return m;
}
