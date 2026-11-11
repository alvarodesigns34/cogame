/* ======================================================================
   RESCOLDO — parte 3: cascada, mercader, sucesos, cuaderno, fauna y arranque
   ====================================================================== */

/* ------------------------------------------------------------ cascada */
let waterfall = null;
function setupWaterfall() {
  const t = tiles.filter(t => t.terrain === 'water' && t.d === RADIUS)[0]; if (!t) return;
  const ox = t.group.position.x, oz = t.group.position.z, ol = Math.hypot(ox, oz); let best = null, bd = -2;
  for (const [dq, dr] of DIRS) { if (tmap.get(hkey(t.q + dq, t.r + dr))) continue; const x = hx(dq, dr), z = hz(dq, dr), dot = (x * ox + z * oz) / (ol * SQ3); if (dot > bd) { bd = dot; best = [x / SQ3, z / SQ3]; } }
  if (!best) return;
  const m = makeWaterfall(); m.position.set(ox + best[0] * (SQ3 / 2 + .01), t.h - .01, oz + best[1] * (SQ3 / 2 + .01)); m.rotation.y = Math.atan2(best[0], best[1]); world.add(m);
  waterfall = { m, t, dir: best };
}

/* ----------------------------------------------------------- mercader */
let balloon = null;
function genOffers(day) {
  const r = mulberry((G.seed ^ Math.imul(day + 1, 2654435761)) >>> 0), val = { food: 1, wood: 1, stone: 1.6 }, rate = E && E.charm >= 12 ? .95 : .75;
  const pairs = [['wood', 'stone'], ['food', 'wood'], ['stone', 'food'], ['food', 'stone'], ['wood', 'food'], ['stone', 'wood']], st = r() * 6 | 0;
  return [0, 1, 3].map(o => { const [a, b] = pairs[(st + o) % 6], n = 4 + (r() * 3 | 0); return { a, n, b, m: Math.max(1, Math.round(n * val[a] / val[b] * rate)), left: 2 }; });
}
function merchantDawn(ev) {
  if (G.day % 5 === 4) { economy(); G.merchant = { offers: genOffers(G.day) }; ev.push(['balloon', 'El <b>mercader</b> ha llegado en globo. Solo hoy acepta trueques: tócalo.']); }
  else { if (G.merchant) ev.push(['balloon', 'El mercader suelta lastre y se aleja. Volverá en cinco días.']); G.merchant = null; }
  setupMerchant(false);
}
function setupMerchant(instant) {
  if (!balloon) { balloon = balloonModel(); balloon.userData.k = 0; balloon.userData.a = 0; scene.add(balloon); }
  const u = balloon.userData, here = !!(G && G.merchant);
  if (here) u.a = hash2(G.seed, 91) * TAU;
  u.target = here ? 1 : 0; if (instant) u.k = u.target;
  const i = picks.indexOf(u.pick); if (here && i < 0) picks.push(u.pick); if (!here && i >= 0) picks.splice(i, 1);
}
function renderChip() {
  const el = $('#chip'); if (!G.merchant) { el.classList.add('hidden'); return; }
  el.innerHTML = `${ic('balloon')}<span>Mercader en el valle<small>Trueques solo hoy</small></span>`; el.classList.remove('hidden'); el.onclick = openMerchant;
  if (innerWidth <= 900) Object.assign(el.style, { top: '292px', left: '12px', right: 'auto', bottom: 'auto' }); else Object.assign(el.style, { top: 'auto', left: 'auto', right: '16px', bottom: '92px' });
}
function openMerchant() {
  if (!G.merchant) return; audio.init(); sfx.select();
  const m = modal(`<div class="eyebrow">Mercader del aire</div><h2>«Traigo de todo un poco, y me llevo lo que sobre»</h2>
  <p>${E.charm >= 12 ? 'Le gusta tanto vuestro valle que hoy ofrece su mejor precio.' : 'Con 12 de encanto os haría mejor precio.'} Cada trato se puede cerrar dos veces.</p>
  <div class="offers">${G.merchant.offers.map((o, i) => `<div class="offer"><span class="num">${o.n} ${ic(o.a)}</span><span class="arrow">→</span><span class="num">${o.m} ${ic(o.b)}</span><span class="left">${o.left ? `quedan ${o.left}` : 'agotado'}</span><button data-o="${i}" ${o.left && G.res[o.a] >= o.n ? '' : 'disabled'}>Cambiar</button></div>`).join('')}</div>
  <div class="btns"><button class="btn sec" data-x>Hasta la próxima</button></div>`);
  m.querySelectorAll('[data-o]').forEach(b => b.onclick = () => {
    const o = G.merchant.offers[+b.dataset.o]; if (!o.left || G.res[o.a] < o.n) return;
    G.res[o.a] -= o.n; G.res[o.b] = o.b === 'food' ? Math.min(E.cap.food, G.res.food + o.m) : G.res[o.b] + o.m; o.left--; G.flags.traded++;
    sfx.pop(3); refresh(); checkWish(); save(); openMerchant();
  });
}

/* ------------------------------------------------- sucesos con decisión */
const addFood = n => G.res.food = Math.min(E.cap.food, G.res.food + n);
const EVENTS = [
  { id: 'traveller', t: 'Una viajera cansada', d: 'Sube por el sendero de niebla con una mochila casi vacía. Pregunta si hay un sitio junto al fuego.', opts: [
    { l: 'Ofrecerle cena y un rincón', s: '−3 comida. Si hay cama libre, quizá se quede.', ok: () => G.res.food >= 3, do: () => { G.res.food -= 3; if (G.pop < E.cap.pop) { G.pop++; return `Se queda. Ya sois ${G.pop}.`; } G.charmBonus++; return 'No hay cama libre, pero deja pintado el valle en una tabla: +1 de encanto.'; } },
    { l: 'Indicarle el camino', s: 'Te lo agradece con algo de su mochila.', do: () => { G.res.stone += 1; return 'Deja una piedra de río muy pulida: +1 piedra.'; } }] },
  { id: 'seeds', when: () => has('garden'), t: 'Semillas raras', d: 'El viento ha dejado en el alféizar un puñado de semillas que nadie reconoce.', opts: [
    { l: 'Sembrarlas en los huertos', s: 'Cada huerto da +1 durante 3 días.', do: () => { G.buff.garden = 3; return 'Brotan en una noche. Huertos +1 durante 3 días.'; } },
    { l: 'Tostarlas para la cena', s: '+3 comida ahora.', do: () => { addFood(3); return 'Crujientes y un poco dulces: +3 comida.'; } }] },
  { id: 'drift', t: 'Madera en la orilla', d: 'La tormenta de anoche, lejos, ha traído troncos hasta el borde de la isla.', opts: [
    { l: 'Salir todos a recogerla', s: '+6 leña, pero un vecino acabará rendido y descansará hoy.', do: () => { G.res.wood += 6; G.hungry = Math.min(G.hungry + 1, Math.max(0, G.pop - 2 - G.hib)); return '+6 leña. Alguien se ha ganado la siesta.'; } },
    { l: 'Coger lo que quede a mano', s: '+2 leña sin esfuerzo.', do: () => { G.res.wood += 2; return '+2 leña.'; } }] },
  { id: 'star', t: 'Una estrella fugaz', d: 'Cruzó el cielo justo antes del alba. Dicen que en este valle los deseos pequeños se cumplen.', opts: [
    { l: 'Pedir calor', s: '+4 leña.', do: () => { G.res.wood += 4; return 'Aparece una pila de leña seca junto al hogar: +4.'; } },
    { l: 'Pedir pan', s: '+4 comida.', do: () => { addFood(4); return 'La despensa huele a recién horneado: +4 comida.'; } }] },
  { id: 'fox', when: () => has('garden'), t: 'Un zorro en el huerto', d: 'Lleva tres noches viniendo. No rompe nada; solo mira las calabazas con mucha atención.', opts: [
    { l: 'Dejarle un plato fuera', s: '−2 comida. Los vecinos le pondrán nombre.', ok: () => G.res.food >= 2, do: () => { G.res.food -= 2; G.charmBonus++; return 'Se llama Brasa. +1 de encanto para siempre.'; } },
    { l: 'Espantarlo con cariño', s: 'Sin cambios.', do: () => 'Se va despacio, sin rencor.' }] },
  { id: 'vein', when: () => has('quarry'), t: 'Una veta en la roca', d: 'Al mover un bloque ha asomado una veta clara y limpia.', opts: [
    { l: 'Picarla hoy mismo', s: '+4 piedra ahora.', do: () => { G.res.stone += 4; return '+4 piedra.'; } },
    { l: 'Abrirla con paciencia', s: 'Canteras +1 durante 3 días.', do: () => { G.buff.quarry = 3; return 'Canteras +1 durante 3 días.'; } }] },
  { id: 'ducks', t: 'Una familia de patos', d: 'Han bajado a la charca y parecen buscar dónde quedarse.', opts: [
    { l: 'Hacerles un nido de ramas', s: '−2 leña. El valle gana vida.', ok: () => G.res.wood >= 2, do: () => { G.res.wood -= 2; G.charmBonus++; return 'Se quedan. +1 de encanto para siempre.'; } },
    { l: 'Dejarlos seguir viaje', s: 'Quizá dejen algo.', do: () => { addFood(1); return 'Dejan un huevo junto a la orilla: +1 comida.'; } }] },
];
function rollEvent() {
  if (G.ev || G.day < 3 || G.merchant || G.day - G.lastEv < 3 || hash2(G.seed, G.day * 13 + 1) > .45) return;
  const pool = EVENTS.filter(e => !e.when || e.when()); G.ev = pool[hash2(G.seed, G.day * 31 + 7) * pool.length | 0].id; G.lastEv = G.day;
}
function showEvent() {
  const e = EVENTS.find(x => x.id === G.ev); if (!e) { G.ev = null; return; } economy(); sfx.select();
  const m = modal(`<div class="eyebrow">Esta mañana</div><h2>${e.t}</h2><p>${e.d}</p>
  <div class="choices">${e.opts.map((o, i) => `<button data-c="${i}" ${o.ok && !o.ok() ? 'disabled' : ''}>${o.l}<small>${o.s}</small></button>`).join('')}</div>`, true);
  m.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { const msg = e.opts[+b.dataset.c].do(); G.ev = null; m.classList.add('hidden'); delete m.dataset.lock; toast('star', msg); sfx.pop(4); refresh(); checkWish(); save(); });
}

/* ------------------------------------------------- cuaderno de recuerdos */
const ACH = [
  ['night', 'Primera noche', 'Deja caer la tarde una vez.', () => G.day >= 1],
  ['six', 'Media docena', 'Sed 6 habitantes.', () => G.pop >= 6],
  ['ten', 'Diez junto al fuego', 'Sed 10 habitantes.', () => G.pop >= 10],
  ['garden5', 'Huerto de exposición', 'Un huerto que rinda 5 o más en un día.', () => G.buildings.some(b => b.type === 'garden' && b.y && b.y.total >= 5)],
  ['lumber4', 'Leñador feliz', 'Un leñador que saque 4 de leña al día.', () => G.buildings.some(b => b.type === 'lumber' && b.y && b.y.total >= 4)],
  ['trade', 'Trueque', 'Cierra un trato con el mercader.', () => G.flags.traded > 0],
  ['fest', 'Fiesta mayor', 'Celebra una fiesta de fin de estación.', () => G.flags.festival > 0],
  ['craft', 'Manos de artesano', 'Mejora 3 edificios.', () => G.flags.up >= 3],
  ['trees', 'Guardabosques', 'Planta 3 arboledas.', () => G.flags.planted >= 3],
  ['charm', 'Valle con encanto', 'Llega a 12 de encanto.', () => E.charm >= 12],
  ['pantry', 'Despensa llena', 'Guarda 40 de comida.', () => G.res.food >= 40],
  ['winter', 'Invierno sin siestas', 'Pasa un invierno sin que nadie hiberne ni se acueste sin cenar.', () => G.flags.cleanWinter],
  ['beacon', 'El Gran Farol', 'Enciende la luz que no se apaga.', () => has('beacon')],
  ['finds', 'Buen ojo', 'Recoge 25 hallazgos.', () => (G.flags.finds || 0) >= 25],
  ['streak', 'Palabra cumplida', 'Encadena 5 encargos seguidos.', () => G.streak >= 5],
  ['years', 'Tres primaveras', 'Llega al tercer año.', () => G.day >= 48],
];
function checkAch() { if (!E) return; for (const [id, t, , ok] of ACH) if (!G.ach.includes(id) && ok()) { G.ach.push(id); toast('book', `Nuevo recuerdo en el cuaderno: <b>${t}</b>`); } }
function journal() {
  if (!started) return; economy();
  modal(`<div class="eyebrow">Cuaderno del valle</div><h2>${G.ach.length} de ${ACH.length} recuerdos</h2>
  <div class="stats"><div><b class="num">${G.day + 1}</b><span>días</span></div><div><b class="num">${G.pop}</b><span>habitantes</span></div><div><b class="num">${G.buildings.length - 1}</b><span>edificios</span></div><div><b class="num">${E.charm}</b><span>encanto</span></div></div>
  <div class="achs">${ACH.map(([id, t, d]) => `<div class="ach${G.ach.includes(id) ? ' on' : ''}">${ic(G.ach.includes(id) ? 'check' : 'star')}<span><b>${t}</b>${d}</span></div>`).join('')}</div>
  <div class="btns"><button class="btn pri" data-x>Cerrar el cuaderno</button></div>`);
}

/* -------------------------------------------- fuegos artificiales y fiesta */
function firework(x, y, z) {
  const c = [[3, 1.2, .6], [1, 2.4, 1.6], [2.6, 1.6, 3], [3, 2.6, 1], [1.2, 1.8, 3]][Math.random() * 5 | 0];
  for (let i = 0; i < 80; i++) { const a = Math.random() * TAU, e = Math.acos(2 * Math.random() - 1), s = 2.4 * (.75 + Math.random() * .4); fxAdd.spawn(x, y, z, Math.sin(e) * Math.cos(a) * s, Math.cos(e) * s, Math.sin(e) * Math.sin(a) * s, 1.2 + Math.random() * .8, .13, c[0], c[1], c[2], 1, { grav: 1, drag: 1.3 }); }
  audio.tone(95, { to: 40, d: .5, g: .22 }); audio.hit(3200, .45, .07, .04, 'highpass');
}
function festival() {
  for (let i = 0; i < 10; i++) setTimeout(() => firework(rnd(-5.5, 5.5), rnd(5, 8.5), rnd(-5.5, 5.5)), 250 + i * 360 + Math.random() * 200);
  for (let i = 0; i < 40; i++) { const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 6; fxAdd.spawn(Math.cos(a) * r, rnd(.2, .8), Math.sin(a) * r, rnd(-.05, .05), rnd(.3, .6), rnd(-.05, .05), rnd(5, 8), rnd(.1, .16), 3, 1.7, .55, .9, { kind: 1, drag: .3 }); }
  [5, 7, 9, 7, 10, 9, 12].forEach((d, i) => audio.pluck(audio.f(d), .11, .3 + i * .28, audio.sfx));
}

/* ------------------------------------------------------------- fauna */
const flocks = [], ripples = []; let fish = null, fishT = 4, fishAnim = null;
function setupFauna() {
  const r = mulberry(4242);
  for (let f = 0; f < 3; f++) {
    const fl = { a: r() * TAU, rad: 8 + r() * 6, y: 2.6 + r() * 2.4, sp: (.16 + r() * .1) * (f % 2 ? -1 : 1), birds: [], vis: 0 };
    for (let i = 0, n = 3 + (r() * 3 | 0); i < n; i++) { const m = birdModel(); m.userData.off = [-(Math.ceil(i / 2)) * .55, (r() - .5) * .3, (i % 2 ? 1 : -1) * Math.ceil(i / 2) * .5]; m.userData.ph = r() * 9; scene.add(m); fl.birds.push(m); }
    flocks.push(fl);
  }
  fish = new T.Mesh(GEO.oct, new T.MeshStandardMaterial({ color: 0xb8d4e6, roughness: .35, metalness: .3 })); fish.scale.set(.07, .1, .26); fish.visible = false; world.add(fish);
  const rg = new T.RingGeometry(.86, 1, 28).rotateX(-Math.PI / 2);
  for (let i = 0; i < 4; i++) { const m = new T.Mesh(rg, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); m.visible = false; m.userData.k = 1; world.add(m); ripples.push(m); }
}
function ripple(x, y, z) { const m = ripples.find(r => r.userData.k >= 1) || ripples[0]; m.position.set(x, y + .012, z); m.userData.k = 0; m.visible = true; }
function updateFauna(dt, time) {
  const S = season(), dry = cur.rain < .3 && cur.snowfall < .3;
  // bandadas
  for (const f of flocks) {
    f.a += f.sp * dt; f.vis = damp(f.vis, cur.day > .5 && dry && cur.fog < .5 ? 1 : 0, .8, dt);
    const cx = Math.cos(f.a) * f.rad, cz = Math.sin(f.a) * f.rad, hd = Math.atan2(-Math.sin(f.a) * f.sp, Math.cos(f.a) * f.sp), c = Math.cos(hd), s = Math.sin(hd);
    for (const b of f.birds) {
      const o = b.userData.off, u = b.userData; b.visible = f.vis > .02 && b.position.distanceTo(camera.position) > 9; if (f.vis <= .02) continue;
      b.position.set(cx + o[0] * s + o[2] * c, f.y + o[1] + Math.sin(time * .7 + u.ph) * .25 + (1 - f.vis) * 9, cz + o[0] * c - o[2] * s);
      b.rotation.y = hd; const w = Math.sin(time * 9 + u.ph) * .75; u.wl.rotation.z = w; u.wr.rotation.z = -w; b.scale.setScalar(f.vis);
    }
  }
  // peces que saltan
  const waters = tiles.filter(t => t.terrain === 'water');
  if ((fishT -= dt) <= 0 && waters.length) {
    fishT = rnd(4, 10);
    if (S < 3 && cur.night < .7) { const t = waters[Math.random() * waters.length | 0], a = Math.random() * TAU; fishAnim = { t, k: 0, x: rnd(-.3, .3), z: rnd(-.3, .3), dx: Math.cos(a) * .35, dz: Math.sin(a) * .35 }; const p = t.group.position; ripple(p.x + fishAnim.x, t.h, p.z + fishAnim.z); if (started) audio.tone(700, { to: 380, d: .1, g: .05 }); }
  }
  if (fishAnim) {
    const f = fishAnim, p = f.t.group.position; f.k += dt / .8;
    const x = p.x + f.x + f.dx * f.k, z = p.z + f.z + f.dz * f.k, y = f.t.h + Math.sin(f.k * Math.PI) * .42;
    fish.visible = true; fish.position.set(x, y, z); fish.rotation.set(-Math.cos(f.k * Math.PI) * 1.1, Math.atan2(f.dx, f.dz), 0);
    if (f.k >= 1) { fish.visible = false; fishAnim = null; ripple(x, f.t.h, z); for (let i = 0; i < 7; i++) fxMix.spawn(x, f.t.h + .05, z, rnd(-.5, .5), rnd(.6, 1.3), rnd(-.5, .5), .5, .06, 1, 1, 1, .8, { grav: 4 }); }
  }
  for (const m of ripples) { const u = m.userData; if (u.k >= 1) { m.visible = false; continue; } u.k += dt / 1.3; m.scale.setScalar(.08 + u.k * .5); m.material.opacity = (1 - u.k) * .55 * (.3 + .7 * cur.day); }
  // mariposas, neblina de la mañana y bruma de la cascada
  if (S < 2 && dry && cur.day > .6) emit('bfly', 2.2, dt, () => { const t = tiles[Math.random() * tiles.length | 0]; if (t.terrain !== 'meadow' || t.b) return; const p = tilePos(t, .25), c = [[1, .78, .25], [1, .6, .8], [.92, .95, 1], [.6, .8, 1]][Math.random() * 4 | 0]; fxMix.spawn(p.x, p.y, p.z, rnd(-.3, .3), rnd(0, .2), rnd(-.3, .3), rnd(3, 5), .075, c[0], c[1], c[2], 1, { kind: 3, drag: 3.5 }); });
  const mist = Math.max(cur.fog, sstep(.4, .31, tod % 1) * (1 - cur.rain) * .8);
  if (mist > .05) emit('mist', 5 * mist, dt, () => { const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 9.5; fxMix.spawn(Math.cos(a) * r, rnd(.15, .7), Math.sin(a) * r, rnd(.05, .25), 0, rnd(-.08, .08), rnd(5, 8), rnd(1.6, 2.6), .95, .96, 1, .05 + .05 * mist, { grow: .12 }); });
  if (waterfall && U.uIce.value < .5) {
    const w = waterfall, p = w.m.position;
    emit('wfm', 9, dt, () => fxMix.spawn(p.x + w.dir[0] * rnd(.2, .9) + rnd(-.4, .4), p.y - rnd(4.2, 6.2), p.z + w.dir[1] * rnd(.2, .9) + rnd(-.4, .4), w.dir[0] * .2, rnd(.1, .4), w.dir[1] * .2, rnd(2, 3.2), rnd(.6, 1), 1, 1, 1, .1, { grow: .45 }));
    emit('wfs', 12, dt, () => fxMix.spawn(p.x + rnd(-.4, .4), p.y, p.z + rnd(-.1, .1), w.dir[0] * rnd(.2, .6), rnd(.2, .7), w.dir[1] * rnd(.2, .6), rnd(.5, .9), .06, 1, 1, 1, .7, { grav: 5 }));
  }
  // globo del mercader
  if (balloon) {
    const u = balloon.userData; u.k = damp(u.k, u.target, .7, dt); balloon.visible = u.k > .01;
    if (balloon.visible) { const k = ease.inOut(clamp(u.k)), rad = lerp(34, 10.8, k), a = u.a + (1 - k) * 1.2; balloon.position.set(Math.cos(a) * rad, lerp(11, 1.2, k) + Math.sin(time * .6) * .18, Math.sin(a) * rad); balloon.rotation.y = time * .08; balloon.rotation.z = Math.sin(time * .5) * .03; }
  }
}

/* --------------------------------------------------------- modo foto */
let photo = false;
function setPhoto(v) {
  if (!started || busy || (v && !$('#modal').classList.contains('hidden'))) return;
  photo = v; document.body.classList.toggle('photo', v); const h = $('#photo-hint'); h.classList.toggle('hidden', !v);
  if (v) { setTool(null); select(null); setHover(null); setTimeout(() => h.classList.add('hidden'), 3200); }
}

/* --------------------------------------------------------- arranque */
addEventListener('resize', () => { resize(); if (G) renderChip(); });
document.addEventListener('visibilitychange', () => { last = performance.now(); if (audio.ctx) document.hidden ? audio.ctx.suspend() : audio.ctx.resume(); });
resize(); buildBackdrop(); setupFar(); setupFauna(); initUI();
window.rescoldo = { camera, get G() { return G; }, get E() { return E; }, tiles, endDay, build, upgrade, canPlace, setTool, cam, toast, seasonCard, festival, openMerchant, showEvent, journal, set tod(v) { todLock = v; }, set speed(v) { SPEED = v; }, get busy() { return busy; } };
requestAnimationFrame(frame);
