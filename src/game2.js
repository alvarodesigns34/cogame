/* ======================================================================
   RESCOLDO — parte 2: reglas, mundo vivo, audio, interfaz y bucle
   ====================================================================== */

/* --------------------------------------------------------------- datos */
const SEASONS = [
  { name: 'Primavera', line: 'La tierra se despereza y llueve a menudo.', grass: 0x8fc46a, tuft: 0x7db85c, leaf: 0x9bd676, pine: 0x4f8f5a, tint: [1, 1, 1] },
  { name: 'Verano', line: 'Días largos y secos: los huertos sin agua cerca sufren.', grass: 0xa0c45c, tuft: 0x8cb850, leaf: 0x5fa84a, pine: 0x3f8050, tint: [1.04, 1, .95] },
  { name: 'Otoño', line: 'Cosecha generosa. El hogar empieza a pedir leña cada noche.', grass: 0xc2ae60, tuft: 0xc4a350, leaf: 0xe2823a, pine: 0x4d7a50, tint: [1.06, .98, .9] },
  { name: 'Invierno', line: 'Los huertos duermen. Mantén el fuego y a los tuyos cerca del calor.', grass: 0xb4c0a6, tuft: 0xa9b59a, leaf: 0xa58f7c, pine: 0x4a7866, tint: [.95, .99, 1.07] },
];
const WX = {
  sun: { name: 'Despejado', note: 'Las colmenas dan +1.' }, rain: { name: 'Lluvia', note: 'Los huertos dan +1.' },
  fog: { name: 'Niebla', note: 'Canteras −1; las abejas no salen.' }, snow: { name: 'Nevada', note: 'El hogar quema 1 leña más.' },
};
const RES = { food: 'Comida', wood: 'Leña', stone: 'Piedra' };
const DEF = {
  hearth: { name: 'El Hogar', icon: 'flame', desc: 'El corazón del valle. Cobija a 2 habitantes y calienta 2 casillas a la redonda. Pide leña cada noche de otoño (1) e invierno (2).' },
  garden: { name: 'Huerto', icon: 'sprout', cost: { wood: 3 }, worker: 1, desc: '+1 comida al día. +1 por charca contigua (máx. 2), +1 junto a una colmena, +1 con lluvia y +1 en otoño. En verano pierde 1 si no tiene agua al lado. Duerme en invierno.' },
  lumber: { name: 'Leñador', icon: 'axe', cost: { wood: 2 }, worker: 1, desc: '+1 leña al día por cada bosque contiguo (máx. 3).' },
  cabin: { name: 'Cabaña', icon: 'house', cost: { wood: 5, stone: 1 }, desc: 'Hogar para 2 habitantes más. En invierno debe quedar dentro del calor o sus vecinos hibernarán.' },
  quarry: { name: 'Cantera', icon: 'pick', cost: { wood: 4 }, worker: 1, desc: '+1 piedra al día por cada roquedal contiguo (máx. 3). La niebla la frena (−1).' },
  hive: { name: 'Colmena', icon: 'hive', cost: { wood: 3 }, desc: '+1 comida por cada 2 prados libres contiguos (máx. 2) y +1 los días de sol. No necesita manos y mejora los huertos vecinos (+1).' },
  brazier: { name: 'Brasero', icon: 'brazier', cost: { wood: 2, stone: 3 }, desc: 'Lleva el calor a las 6 casillas contiguas. Quema 1 leña cada noche de invierno.' },
  granary: { name: 'Granero', icon: 'barn', cost: { wood: 6, stone: 4 }, desc: 'La despensa crece en 20. Sin graneros solo caben 20 de comida.' },
  greenhouse: { name: 'Invernadero', icon: 'glass', cost: { wood: 6, stone: 6 }, worker: 1, desc: '+2 comida todo el año, también en invierno. +1 si está dentro del calor.' },
  beacon: { name: 'Gran Farol', icon: 'lantern', cost: { wood: 30, stone: 24, food: 24 }, desc: 'Una luz que el invierno no puede apagar. Calienta 3 casillas a la redonda sin gastar leña.' },
  plant: { name: 'Plantar', icon: 'tree', cost: { food: 2 }, tool: 1, desc: 'Siembra una arboleda en un prado. Será bosque en 4 días.' },
  fell: { name: 'Talar', icon: 'stump', tool: 1, desc: 'Convierte un bosque en prado y da 3 de leña al instante. El bosque no vuelve solo.' },
};
const BAR = ['garden', 'lumber', 'cabin', 'quarry', 'hive', 'brazier', 'granary', 'greenhouse', 'beacon', 'plant', 'fell'];
const TERR = {
  meadow: { name: 'Prado', desc: 'Suelo libre para construir. Las colmenas vecinas liban en los prados que dejes sin ocupar.' },
  forest: { name: 'Bosque', desc: 'Cada leñador contiguo saca +1 leña al día. Puedes talarlo, pero no volverá solo.' },
  rock: { name: 'Roquedal', desc: 'Cada cantera contigua saca +1 piedra al día.' },
  water: { name: 'Charca', desc: 'Riega los huertos contiguos: +1 comida cada una (máx. 2).' },
};
const WISHES = [
  { t: 'Un primer surco', d: 'Construye un Huerto pegado a una charca.', rw: { wood: 3 }, un: ['cabin'], ok: () => G.buildings.some(b => b.type === 'garden' && nbs(b.tile).some(n => n.terrain === 'water')) },
  { t: 'Leña para el hogar', d: 'Levanta un Leñador que toque al menos 2 bosques.', rw: { stone: 2 }, un: ['quarry', 'plant'], ok: () => G.buildings.some(b => b.type === 'lumber' && nbs(b.tile).filter(n => n.terrain === 'forest').length >= 2) },
  { t: 'Vecinos nuevos', d: 'Haz sitio en una Cabaña y espera: sed 4 habitantes.', rw: { food: 4 }, un: ['hive'], ok: () => G.pop >= 4 },
  { t: 'Piedra y miel', d: 'Construye una Cantera y una Colmena.', rw: { stone: 3 }, un: ['brazier', 'granary'], ok: () => has('quarry') && has('hive') },
  { t: 'Despensa de otoño', d: 'Construye un Granero para guardar comida de cara al invierno.', rw: { food: 5 }, un: ['greenhouse'], ok: () => has('granary') },
  { t: 'El largo invierno', d: 'Llega a la primavera del segundo año. Sin prisa.', rw: { wood: 6 }, un: ['beacon'], ok: () => G.day >= 24 },
  { t: 'El Gran Farol', d: 'Reúne 30 de leña, 24 de piedra y 24 de comida, y enciende una luz que no se apague.', rw: {}, un: [], ok: () => has('beacon') },
];
const IC = {
  food: 'M12 8c-4-2-7.5 1-7.5 5.2S8 20.5 12 20.5s7.5-3 7.5-7.3S16 6 12 8z M12 8c0-2 1-3.6 3-4.5',
  wood: 'M6 8.5a3.5 3.5 0 1 0 0 7h12a3.5 3.5 0 1 0 0-7z M18 8.5a3.5 3.5 0 0 0 0 7 M6 11v2',
  stone: 'M4 17.5l2.5-8 6-3.5 6.5 4.5 1 7z M6.5 9.5l5.5 4 7-3 M12 13.5l-1 4',
  pop: 'M12 4.2a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6z M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5',
  flame: 'M12 3c1 4 5.5 5.5 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2 1-3.4 2-4.5 0 2 1 3 2 3 0-3-1-5 1.5-9z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2.5v2 M12 19.5v2 M2.5 12h2 M19.5 12h2 M5.3 5.3l1.4 1.4 M17.3 17.3l1.4 1.4 M5.3 18.7l1.4-1.4 M17.3 6.7l1.4-1.4',
  moon: 'M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z',
  rain: 'M7 14.5a4 4 0 0 1 .4-8 5 5 0 0 1 9.6 1.2 3.4 3.4 0 0 1 0 6.8z M8.5 17.5l-.8 2.5 M12.5 17.5l-.8 2.5 M16.5 17.5l-.8 2.5',
  fog: 'M7 12.5a4 4 0 0 1 .4-8 5 5 0 0 1 9.6 1.2 3.4 3.4 0 0 1 0 6.8z M4 16h13 M7 19.5h13',
  snow: 'M12 3v18 M4.2 7.5l15.6 9 M19.8 7.5l-15.6 9 M9.5 4.5L12 6.5l2.5-2 M9.5 19.5l2.5-2 2.5 2',
  sprout: 'M12 21v-9 M12 14c0-4-3-6.5-7.5-6.5C4.5 11.5 7.5 14 12 14z M12 12c0-3.4 2.4-5.6 6.5-5.6 0 3.4-2.4 5.6-6.5 5.6z',
  axe: 'M13.5 4.5l6 6-3.2 3.2c-2-.4-4.6-3-5-5.2z M12.3 9.7L4 20',
  house: 'M3.5 11.5L12 4l8.5 7.5 M6 10v10h12V10 M10 20v-5.5h4V20',
  pick: 'M4.5 9.5c4.5-5.5 10.5-5.5 15 0 M12 5.5V21',
  hive: 'M12 3.5c-3.6 0-6 2.6-6 5.6v7.6c0 2.2 1.2 3.3 3 3.3h6c1.8 0 3-1.1 3-3.3V9.1c0-3-2.4-5.6-6-5.6z M6 10h12 M6 15h12 M10.8 20v-2.6h2.4V20',
  brazier: 'M5 13h14l-2 5H7z M10 18l-1 3 M14 18l1 3 M12 3.5c1 2.2 3 3 3 5.2a3 3 0 0 1-6 0c0-1.2.6-1.8 1.2-2.6 0 1 .6 1.6 1 1.6 0-1.6-.4-2.6.8-4.2z',
  barn: 'M4 20V10.5L8 5h8l4 5.5V20z M9 20v-6h6v6 M4 10.5h16 M9 14l6 6 M15 14l-6 6',
  glass: 'M4 20V10.5L12 4l8 6.5V20z M12 4v16 M4 13h16 M4 20h16',
  tree: 'M12 21v-5 M12 3L6.5 10h3L5 16h14l-4.500-6h3z',
  stump: 'M7 20v-7.500h10V20 M4.5 20h15 M7 12.500c0-2.200 10-2.200 10 0 M9.500 12.500c0 1 5 1 5 0 M12 4v4 M9 5.500l3 2.500 3-2.500',
  lantern: 'M9 8h6l2 9H7z M10 8V5.500h4V8 M12 3v2.500 M8 17v2.500h8V17 M12 11v3',
  sound: 'M4 9.500v5h3.500l4.500 4v-13l-4.500 4z M15.500 9a4 4 0 0 1 0 6 M18 6.500a7.500 7.500 0 0 1 0 11',
  mute: 'M4 9.500v5h3.500l4.500 4v-13l-4.500 4z M16 9.500l5 5 M21 9.500l-5 5',
  help: 'M9.200 9.200a3 3 0 1 1 4.300 2.700c-.900.500-1.500 1.100-1.500 2.300 M12 17.600v.400 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  seed: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M12 8.500a3.500 3.500 0 1 0 0 7 3.500 3.500 0 0 0 0-7z',
  pause: 'M9 6v12 M15 6v12', zzz: 'M5 6h6l-6 7h6 M14 12h5l-5 6h5', star: 'M12 3.500l2.500 5.500 6 .700-4.500 4 1.300 5.800L12 16.600 6.700 19.500 8 13.700l-4.500-4 6-.700z',
  hands: 'M12 4.200a3.300 3.300 0 1 0 0 6.600 3.300 3.300 0 0 0 0-6.600z M5 20c0-4 3-6.500 7-6.500 M16 15v6 M13 18h6',
};
const ic = n => `<svg class="i" viewBox="0 0 24 24"><path d="${IC[n]}"/></svg>`;

/* -------------------------------------------------------------- estado */
let G = null, E = null, busy = false, started = false;
const tiles = [], tmap = new Map();
let tool = null, hover = null, selected = null;
let tod = .31, dayClock = 0, todLock = null;
const SAVE = 'rescoldo.v1';
const season = (d = G.day) => Math.floor(d / 6) % 4;
const has = t => G.buildings.some(b => b.type === t);
const count = t => G.buildings.filter(b => b.type === t).length;
const nbs = t => DIRS.map(([dq, dr]) => tmap.get(hkey(t.q + dq, t.r + dr))).filter(Boolean);
function weatherAt(day) {
  if (day === 0) return 'sun';
  const s = season(day), r = hash2(G.seed, day * 7 + 3);
  const tb = [[.45, .40], [.72, .2], [.35, .35], [.35, 0]][s];
  if (r < tb[0]) return 'sun'; if (s === 3) return r < .8 ? 'snow' : 'fog';
  return r < tb[0] + tb[1] ? 'rain' : 'fog';
}

/* ------------------------------------------------- generación del mapa */
function genTerrain(seed) {
  const r = mulberry(seed), all = [];
  for (let q = -RADIUS; q <= RADIUS; q++) for (let rr = -RADIUS; rr <= RADIUS; rr++) if (Math.abs(q + rr) <= RADIUS) all.push({ q, r: rr, d: hdist({ q, r: rr }, { q: 0, r: 0 }), terrain: 'meadow' });
  const m = new Map(all.map(t => [hkey(t.q, t.r), t]));
  const near = (a, ring) => { const x = Math.cos(a) * ring * SQ3, z = Math.sin(a) * ring * SQ3; let best = null, bd = 1e9; for (const t of all) { const d = (hx(t.q, t.r) - x) ** 2 + (hz(t.q, t.r) - z) ** 2; if (d < bd && t.d >= 2) { bd = d; best = t; } } return best; };
  const grow = (start, n, terr, minD = 2) => {
    const set = []; const add = t => { t.terrain = terr; set.push(t); };
    if (start.terrain === 'meadow') add(start); let guard = 0;
    while (set.length < n && guard++ < 200) {
      const s = set[r() * set.length | 0] || start; const [dq, dr] = DIRS[r() * 6 | 0]; const t = m.get(hkey(s.q + dq, s.r + dr));
      if (t && t.terrain === 'meadow' && t.d >= minD) add(t);
    }
  };
  const a0 = r() * TAU;
  grow(near(a0, 2.3), 4 + (r() * 2 | 0), 'water');
  grow(near(a0 + 2.6 + r() * .6, 3.4), 2, 'water', 3);
  grow(near(a0 + Math.PI + (r() - .5) * .8, 3.3), 6, 'rock', 3);
  grow(near(a0 + 1.3 + r() * .4, 3), 6, 'forest');
  grow(near(a0 - 1.3 - r() * .4, 3), 5, 'forest');
  grow(near(a0 + Math.PI * .72, 2.2), 3, 'forest');
  grow(near(a0 - .2, 3.9), 2, 'forest', 3);
  return m;
}

/* ------------------------------------------------- construcción de casillas */
const hexFlat = new T.CircleGeometry(.9, 6).rotateX(-Math.PI / 2).rotateY(Math.PI / 6);
const pickGeo = new T.CylinderGeometry(1, 1, 1, 6).translate(0, .5, 0);
const pickMat = new T.MeshBasicMaterial({ visible: false });
const picks = [];
function makeTile(q, r, terrain) {
  const t = { q, r, key: hkey(q, r), terrain, d: hdist({ q, r }, { q: 0, r: 0 }), b: null, sap: 0, sapModel: null, y: 0, vy: 0, lift: 0, ovC: new T.Color(1, 1, 1), ovA: 0, wig: 0 };
  t.seed = (Math.imul(q + 40, 7919) ^ Math.imul(r + 40, 104729) ^ G.seed) >>> 0;
  const rr = mulberry(t.seed);
  t.h = terrain === 'water' ? -.1 : terrain === 'rock' ? .14 + rr() * .14 : .02 + rr() * .06 + (t.d === 0 ? 0 : Math.sin(q * 1.3 + r * .7) * .025);
  const g = t.group = new T.Group(); g.position.set(hx(q, r), 0, hz(q, r)); g.userData.tile = t;
  // columna de tierra y roca: más honda hacia el centro → isla flotante
  const depth = 1.0 + (RADIUS - t.d) * .55 + rr() * .8, top = t.h - (terrain === 'water' ? .1 : .13);
  const sg = new T.CylinderGeometry(1, .7 + rr() * .16, depth, 6, 2); sg.translate(0, top - depth / 2, 0);
  const sp_ = sg.attributes.position, col = new Float32Array(sp_.count * 3);
  const c1 = new T.Color(terrain === 'water' ? 0xb9a37c : 0x7d5a44), c2 = new T.Color(0x66504a), c3 = new T.Color(0x4c4854);
  const ox = (rr() - .5) * .3, oz = (rr() - .5) * .3;
  for (let i = 0; i < sp_.count; i++) {
    const y = sp_.getY(i), k = (top - y) / depth; const c = k < .25 ? c1 : k < .75 ? c2 : c3;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    if (k > .75) { sp_.setX(i, sp_.getX(i) + ox); sp_.setZ(i, sp_.getZ(i) + oz); }
  }
  sg.setAttribute('color', new T.BufferAttribute(col, 3)); sg.computeVertexNormals();
  const soil = new T.Mesh(sg, MAT.soil); soil.castShadow = soil.receiveShadow = true; g.add(soil);
  t.capMesh = null; t.ov = new T.Mesh(hexFlat, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  t.ov.position.y = t.h + .02; t.ov.renderOrder = 2; t.ov.visible = false; g.add(t.ov);
  t.pick = new T.Mesh(pickGeo, pickMat); t.pick.position.y = t.h - .3; t.pick.userData.tile = t; g.add(t.pick); picks.push(t.pick);
  rebuildTile(t); world.add(g); return t;
}
function capFor(t) {
  if (t.capMesh) { t.group.remove(t.capMesh); t.capMesh.geometry.dispose(); }
  let m;
  if (t.terrain === 'water') { m = new T.Mesh(new T.CylinderGeometry(1, 1, .1, 6).translate(0, t.h - .05, 0), MAT.water); m.receiveShadow = true; }
  else {
    const g = new T.CylinderGeometry(.945, 1, .13, 6).translate(0, t.h - .065, 0); const rr = mulberry(t.seed + 5);
    const k = t.terrain === 'forest' ? .8 + rr() * .08 : .94 + rr() * .12; const c = new Float32Array(g.attributes.position.count * 3).fill(k);
    g.setAttribute('color', new T.BufferAttribute(c, 3));
    m = new T.Mesh(g, t.terrain === 'rock' ? MAT.rockTop : MAT.grass); m.castShadow = m.receiveShadow = true;
  }
  t.capMesh = m; t.group.add(m);
}
function rebuildTile(t) {
  capFor(t);
  if (t.deco) { t.group.remove(t.deco); t.deco.traverse(o => o.geometry && o.geometry.dispose()); }
  const d = t.deco = new T.Group(); d.position.y = t.h; t.group.add(d); t.flowers = null; t.topH = .15;
  const r = mulberry(t.seed + 11), tuft = [], fl = [], rk = [], trunk = [], pine = [], leaf = [], sm = [];
  const tufts = n => { for (let i = 0; i < n; i++) { const a = r() * TAU, rad = Math.sqrt(r()) * .78, x = Math.cos(a) * rad, z = Math.sin(a) * rad, tint = vary(0xffffff, r, .14); for (let j = 0; j < 3; j++) tuft.push([GEO.cone4, tint, MX(x + (j - 1) * .035, .06, z + (r() - .5) * .04, .045, .12 + r() * .1, .045, r() * 3, (r() - .5) * .5, (j - 1) * .35)]); } };
  if (t.terrain === 'meadow') {
    tufts(7 + (r() * 6 | 0));
    const pal = [0xffffff, 0xffd166, 0xf28fb1, 0xb79cf0, 0xff9f6b]; const pc = pal[r() * 5 | 0];
    for (let i = 0, n = 3 + (r() * 6 | 0); i < n; i++) { const a = r() * TAU, rad = Math.sqrt(r()) * .75; sp(fl, r() < .7 ? pc : pal[r() * 5 | 0], Math.cos(a) * rad, .075 + r() * .05, Math.sin(a) * rad, .06 + r() * .03); }
    if (r() < .35) sp(rk, vary(0x9d968e, r, .1), (r() - .5) * 1.1, .03, (r() - .5) * 1.1, .16, .1, .13, GEO.dod, r() * 3);
  } else if (t.terrain === 'forest') {
    const pts = []; let guard = 0;
    while (pts.length < 3 + (r() * 2 | 0) && guard++ < 40) { const a = r() * TAU, rad = .12 + r() * .5, x = Math.cos(a) * rad, z = Math.sin(a) * rad; if (pts.every(p => (p[0] - x) ** 2 + (p[1] - z) ** 2 > .12)) pts.push([x, z]); }
    for (const [x, z] of pts) t.topH = Math.max(t.topH, treeParts(trunk, pine, leaf, r, x, 0, z, .8 + r() * .5));
    tufts(4);
    if (r() < .5) { const a = r() * TAU; cy(sm, 0xf2e6d0, Math.cos(a) * .7, 0, Math.sin(a) * .7, .015, .06); sm.push([GEO.cone, 0xd9503c, MX(Math.cos(a) * .7, .075, Math.sin(a) * .7, .08, .04, .08)]); }
  } else if (t.terrain === 'rock') {
    for (let i = 0, n = 3 + (r() * 3 | 0); i < n; i++) { const a = r() * TAU, rad = r() * .5, s = .3 + r() * .42; sp(rk, vary(i % 3 ? 0x9d968e : 0x8b8590, r, .09), Math.cos(a) * rad, s * .28, Math.sin(a) * rad, s, s * (.7 + r() * .5), s * (.8 + r() * .3), GEO.dod, r() * TAU); t.topH = Math.max(t.topH, s * .7); }
    tufts(2);
  } else {
    for (let i = 0, n = r() * 3 | 0; i < n; i++) { const a = r() * TAU, rad = r() * .6, x = Math.cos(a) * rad, z = Math.sin(a) * rad; cy(sm, vary(0x5faa58, r, .1), x, .005, z, .09 + r() * .05, .012, GEO.cyl); if (r() < .5) sp(sm, 0xf7a8c4, x + .03, .04, z, .06); }
    if (r() < .7) { const a = r() * TAU; for (let i = 0; i < 4; i++) { const x = Math.cos(a + i * .14) * .82, z = Math.sin(a + i * .14) * .82, hh = .28 + r() * .2; tuft.push([GEO.cone4, 0xc8e6a0, MX(x, hh / 2, z, .03, hh, .03)]); if (i % 2) sm.push([GEO.cyl, 0x7a5236, MX(x, hh + .02, z, .04, .1, .04)]); } }
  }
  if (tuft.length) d.add(mk(tuft, MAT.tuft, false)); if (fl.length) { t.flowers = mk(fl, MAT.flower, false); d.add(t.flowers); }
  if (rk.length) d.add(mk(rk, MAT.rock)); if (trunk.length) d.add(mk(trunk, MAT.build)); if (pine.length) d.add(mk(pine, MAT.pine)); if (leaf.length) d.add(mk(leaf, MAT.leaf)); if (sm.length) d.add(mk(sm, MAT.smooth, false));
  d.visible = !t.b; fitPick(t); if (t.flowers && G) t.flowers.scale.setScalar(season() < 2 ? 1 : .001);
}
const fitPick = t => t.pick.scale.y = .3 + (t.b ? t.b.model.userData.h * .8 : t.sap ? .4 : t.topH * .75);
function clearWorld() {
  for (const t of tiles) { world.remove(t.group); t.group.traverse(o => { if (o.geometry && o.geometry !== hexFlat && o.geometry !== pickGeo && o.geometry !== glowGeo && !Object.values(GEO).includes(o.geometry)) o.geometry.dispose(); }); }
  tiles.length = 0; tmap.clear(); picks.length = 0;
  for (const v of villagers) world.remove(v.m); villagers.length = 0;
  for (const el of badges.values()) el.remove(); badges.clear();
}
function tilePos(t, up = 0) { return new T.Vector3(t.group.position.x, t.h + t.y + up + world.position.y, t.group.position.z); }

/* -------------------------------------------------------------- reglas */
function isWarm(t) {
  if (G.hearthLit && t.d <= 2) return true;
  for (const b of G.buildings) { if (b.type === 'brazier' && b.lit && hdist(b.tile, t) <= 1) return true; if (b.type === 'beacon' && hdist(b.tile, t) <= 3) return true; }
  return false;
}
function calcYield(type, t, S, W) {
  const nb = nbs(t), parts = []; let res = 'food', note = '';
  const cnt = terr => nb.filter(n => n.terrain === terr).length;
  if (type === 'garden') {
    if (S === 3) note = 'Duerme bajo la nieve';
    else {
      parts.push(['Tierra labrada', 1]); const w = Math.min(2, cnt('water'));
      if (w) parts.push(['Charca contigua', w]); else if (S === 1) parts.push(['Sequía de verano', -1]);
      if (nb.some(n => n.b && n.b.type === 'hive')) parts.push(['Abejas vecinas', 1]);
      if (W === 'rain') parts.push(['Lluvia', 1]); if (S === 2) parts.push(['Cosecha de otoño', 1]);
    }
  } else if (type === 'lumber') { res = 'wood'; const f = Math.min(3, cnt('forest')); if (f) parts.push(['Bosque contiguo', f]); else note = 'Sin bosque al lado'; }
  else if (type === 'quarry') { res = 'stone'; const f = Math.min(3, cnt('rock')); if (f) { parts.push(['Roquedal contiguo', f]); if (W === 'fog') parts.push(['Niebla', -1]); } else note = 'Sin roca al lado'; }
  else if (type === 'hive') {
    if (S === 3) note = 'Las abejas invernan'; else if (W === 'fog') note = 'Con niebla no salen';
    else { const v = Math.min(2, Math.floor(nb.filter(n => n.terrain === 'meadow' && !n.b && !n.sap).length / 2)); if (v) { parts.push(['Prados libres', v]); if (W === 'sun') parts.push(['Día de sol', 1]); } else note = 'Necesita 2 prados libres al lado'; }
  } else if (type === 'greenhouse') { parts.push(['Bajo cristal', 2]); if (isWarm(t)) parts.push(['Dentro del calor', 1]); }
  else return null;
  return { res, parts, note, total: Math.max(0, parts.reduce((a, p) => a + p[1], 0)) };
}
function economy() {
  const S = season(), W = weatherAt(G.day); let hib = 0, idx = 0, cabins = 0;
  for (const b of G.buildings) if (b.type === 'cabin') { b.residents = clamp(G.pop - 2 - 2 * idx, 0, 2); idx++; cabins++; b.cold = S === 3 && !isWarm(b.tile); if (b.cold) hib += b.residents; }
  G.hib = hib; G.hungry = clamp(G.hungry, 0, Math.max(0, G.pop - 2 - hib));
  let free = G.pop - hib - G.hungry, need = 0; const prod = { food: 0, wood: 0, stone: 0 };
  for (const b of G.buildings) {
    if (DEF[b.type].worker) { if (!b.paused) need++; b.active = !b.paused && free > 0; if (b.active) free--; } else b.active = true;
    b.y = calcYield(b.type, b.tile, S, W); if (b.y && b.active) prod[b.y.res] += b.y.total;
  }
  let burn = 0; if (S === 2) burn = 1; if (S === 3) burn = (W === 'snow' ? 3 : 2) + count('brazier');
  E = { prod, eat: G.pop - hib, burn, free, need, workers: G.pop - hib - G.hungry, cap: { food: 20 + 20 * count('granary'), pop: 2 + 2 * cabins } };
  return E;
}
function totalProd() {
  const S = season(), W = weatherAt(G.day), p = { food: 0, wood: 0, stone: 0 };
  for (const b of G.buildings) { if (!(b.virtual || b.active)) continue; const y = calcYield(b.type, b.tile, S, W); if (y) p[y.res] += y.total; }
  return p;
}
const afford = type => Object.entries(DEF[type].cost || {}).every(([k, v]) => G.res[k] >= v);
function canPlace(type, t) {
  if (!t) return { ok: false };
  if (type === 'fell') return t.terrain === 'forest' ? { ok: true } : { ok: false, why: 'Solo se pueden talar bosques' };
  if (t.b || t.sap) return { ok: false, why: 'Casilla ocupada' };
  if (t.terrain !== 'meadow') return { ok: false, why: 'Solo sobre prado' };
  if (type === 'beacon' && has('beacon')) return { ok: false, why: 'Ya brilla un Gran Farol' };
  if (!afford(type)) return { ok: false, why: 'Faltan recursos' };
  return { ok: true };
}
/* diferencia de producción diaria si se hiciera la acción en la casilla */
function previewDelta(type, t) {
  const a = totalProd(); let b;
  if (type === 'fell') { t.terrain = 'meadow'; b = totalProd(); t.terrain = 'forest'; }
  else if (type === 'plant') { t.sap = 1; b = totalProd(); t.sap = 0; }
  else { const v = { type, tile: t, virtual: true, lit: true }; t.b = v; G.buildings.push(v); b = totalProd(); G.buildings.pop(); t.b = null; }
  return { food: b.food - a.food, wood: b.wood - a.wood, stone: b.stone - a.stone };
}
function synergyTiles(type, t) {
  const nb = nbs(t);
  if (type === 'garden') return nb.filter(n => n.terrain === 'water' || (n.b && n.b.type === 'hive'));
  if (type === 'lumber') return nb.filter(n => n.terrain === 'forest');
  if (type === 'quarry') return nb.filter(n => n.terrain === 'rock');
  if (type === 'hive') return nb.filter(n => (n.terrain === 'meadow' && !n.b && !n.sap) || (n.b && n.b.type === 'garden'));
  if (type === 'brazier') return nb;
  if (type === 'beacon') return tiles.filter(n => n !== t && hdist(n, t) <= 3);
  if (type === 'fell') return nb.filter(n => n.b && n.b.type === 'lumber');
  return [];
}
const WARM_TOOLS = ['cabin', 'brazier', 'greenhouse', 'beacon'];

function placeBuilding(type, t, silent) {
  const r = mulberry(t.seed + 99), model = MODELS[type](r);
  const b = { type, tile: t, paused: false, lit: true, model, active: true };
  model.position.y = t.h; t.group.add(model); t.b = b; t.deco.visible = false; G.buildings.push(b); fitPick(t);
  if (t.sapModel) { t.group.remove(t.sapModel); t.sapModel = null; t.sap = 0; }
  if (!silent) {
    model.scale.setScalar(.01); tween(.9, k => model.scale.set(lerp(.01, 1, ease.elastic(k)), lerp(.01, 1, ease.elastic(Math.min(1, k * 1.15))), lerp(.01, 1, ease.elastic(k))), ease.lin);
    t.vy = -1.6; const p = tilePos(t); burst(p, 26, 2.6, 1.9, .8); puff(p, 12);
    for (const n of nbs(t)) n.vy += .5; camKick = .5;
  }
  return b;
}
function build(type, t) {
  for (const [k, v] of Object.entries(DEF[type].cost || {})) G.res[k] -= v;
  if (type === 'plant') { setSapling(t, 4); sfx.plant(); t.vy = -1; puff(tilePos(t), 6); }
  else if (type === 'fell') {
    t.terrain = 'meadow'; G.res.wood += 3; rebuildTile(t); t.vy = -2; sfx.chop(); const p = tilePos(t); puff(p, 14);
    for (let i = 0; i < 14; i++) fxMix.spawn(p.x + (Math.random() - .5) * .8, p.y + .3 + Math.random() * .8, p.z + (Math.random() - .5) * .8, (Math.random() - .5) * 1.5, 1 + Math.random(), (Math.random() - .5) * 1.5, 1.6, .1, .45, .7, .35, .95, { grav: 3, kind: 2 });
    floatAt(t, `+3 ${ic('wood')}`);
  } else {
    placeBuilding(type, t); sfx.place(); G.built++;
    if (type === 'beacon') setTimeout(finale, 1400);
  }
  refresh(); checkWish();
  if (tool && !afford(tool) && DEF[tool].cost) setTool(null);
}
function setSapling(t, days) {
  t.sap = days; if (t.sapModel) t.group.remove(t.sapModel);
  const m = t.sapModel = MODELS.sapling(mulberry(t.seed + 3)); m.position.y = t.h; m.scale.setScalar(.35 + (4 - days) * .2); t.group.add(m); t.deco.visible = true; fitPick(t);
}
function demolish(b) {
  if (b.type === 'hearth') return;
  const t = b.tile, cost = DEF[b.type].cost || {};
  for (const [k, v] of Object.entries(cost)) if (k !== 'food') G.res[k] += Math.floor(v / 2);
  G.buildings.splice(G.buildings.indexOf(b), 1); t.b = null;
  tween(.3, k => b.model.scale.setScalar(1 - k), ease.inOut).then(() => { t.group.remove(b.model); t.deco.visible = true; });
  fitPick(t); puff(tilePos(t), 12); sfx.demolish();
  economy(); if (G.pop > E.cap.pop) { G.pop = E.cap.pop; toast('house', 'Sin su cabaña, dos vecinos se mudan a otro valle.'); }
  select(null); refresh();
}

/* ------------------------------------------------------------ anhelos */
function checkWish() {
  let guard = 0;
  while (G.wish < WISHES.length && WISHES[G.wish].ok() && guard++ < 8) {
    const w = WISHES[G.wish]; G.wish++;
    for (const [k, v] of Object.entries(w.rw)) G.res[k] += v;
    for (const u of w.un) if (!G.unlocked.includes(u)) { G.unlocked.push(u); fresh.add(u); }
    const rw = Object.entries(w.rw).map(([k, v]) => `+${v} ${RES[k].toLowerCase()}`).join(', ');
    toast('star', `<b>${w.t}</b> cumplido.${rw ? ' ' + rw + '.' : ''}${w.un.length ? ' Nuevo: ' + w.un.map(u => DEF[u].name).join(', ') + '.' : ''}`);
    sfx.wish(); $('#wish').classList.add('flash'); setTimeout(() => $('#wish').classList.remove('flash'), 500);
    refresh();
  }
}

/* ------------------------------------------------------ paso del día */
async function endDay() {
  if (busy || !started) return; busy = true; setTool(null); select(null); setHover(null); $('#hud').classList.add('busy'); sfx.dusk();
  economy(); const ev = [], S = season(), W = weatherAt(G.day), hearthT = tmap.get('0,0');
  const t0 = tod; tween(2.2, k => tod = lerp(t0, .775, k), ease.inOut);
  await wait(.5); let i = 0;
  for (const b of G.buildings) if (b.y && b.active && b.y.total > 0) { floatAt(b.tile, `+${b.y.total} ${ic(b.y.res)}`, '', b.model.userData.h); b.tile.vy = 1.3; sfx.pop(i++); await wait(.12); }
  await wait(.45);
  G.res.wood += E.prod.wood; G.res.stone += E.prod.stone;
  let food = G.res.food + E.prod.food; const short = Math.max(0, E.eat - food); food = Math.max(0, food - E.eat);
  if (food > E.cap.food) { ev.push(['barn', `La despensa está llena: ${food - E.cap.food} de comida no se pudo guardar.`]); food = E.cap.food; }
  G.res.food = food; G.hungry = Math.min(short, Math.max(0, G.pop - 2 - G.hib));
  floatAt(hearthT, `−${E.eat} ${ic('food')}`, 'neg', .9); sfx.eat();
  if (G.hungry) ev.push(['zzz', `No alcanzó la cena: ${G.hungry} ${G.hungry > 1 ? 'vecinos descansan' : 'vecino descansa'} hoy. Mañana será otro día.`]);
  renderRes();
  await tween(1.7, k => tod = lerp(.775, .98, k), ease.inOut);
  // noche: el fuego pide su leña
  let burnt = 0; const braz = G.buildings.filter(b => b.type === 'brazier');
  if (S >= 2) {
    const need = S === 2 ? 1 : (W === 'snow' ? 3 : 2);
    if (G.res.wood >= need) { G.res.wood -= need; burnt += need; G.hearthLit = true; }
    else { burnt += G.res.wood; G.res.wood = 0; if (G.hearthLit) ev.push(['flame', 'El hogar se quedó sin leña: solo quedan brasas. Vuelve a prender en cuanto haya madera.']); G.hearthLit = false; }
    for (const b of braz) { if (S === 3) { if (G.res.wood >= 1) { G.res.wood--; burnt++; b.lit = true; } else b.lit = false; } else b.lit = true; }
  }
  if (burnt) { floatAt(hearthT, `−${burnt} ${ic('wood')}`, 'neg', .9); sfx.crackleBig(); }
  renderRes(); syncVisuals();
  await wait(1.5);
  // amanecer
  G.day++; const nS = season(), prevHib = G.hib;
  if (nS < 2) { G.hearthLit = true; for (const b of braz) b.lit = true; }
  for (const t of tiles) if (t.sap) { t.sap--; if (t.sap <= 0) { t.group.remove(t.sapModel); t.sapModel = null; t.terrain = 'forest'; rebuildTile(t); t.vy = 1.5; ev.push(['tree', 'Una arboleda joven ya es bosque.']); } else tween(.8, k => t.sapModel.scale.setScalar(lerp(t.sapModel.scale.x, .35 + (4 - t.sap) * .2, k))); }
  economy();
  if (G.pop < E.cap.pop && G.res.food >= G.pop + 2 && G.hungry === 0 && nS !== 3) { G.pop++; ev.push(['pop', `Alguien nuevo llega al valle. Ya sois ${G.pop}.`]); }
  if (G.res.wood < 2 && !G.buildings.some(b => b.type === 'lumber' && b.active && b.y.total > 0)) { G.res.wood += 2; ev.push(['wood', 'El viento dejó ramas caídas junto al hogar: +2 leña.']); }
  economy();
  if (G.hib > prevHib) ev.push(['snow', `${G.hib} ${G.hib > 1 ? 'vecinos hibernan' : 'vecino hiberna'} en cabañas fuera del calor. Un brasero cerca los despertará.`]);
  refresh(); sfx.dawn(); applySeason(false);
  await tween(2.6, k => tod = lerp(.98, 1.31, k), ease.inOut); tod = .31; dayClock = 0;
  if (nS !== S) seasonCard(nS);
  ev.forEach(([i, m], k) => setTimeout(() => toast(i, m), k * 500));
  checkWish(); save(); busy = false; $('#hud').classList.remove('busy');
}
function finale() {
  G.won = true; save(); sfx.wish();
  modal(`<div class="eyebrow">Día ${G.day + 1} · año ${Math.floor(G.day / 24) + 1}</div><h2>El valle ya no teme al invierno</h2>
  <p>El Gran Farol está encendido. Desde ahora su luz calienta medio valle sin pedir leña, y las noches traerán aurora.</p>
  <div class="stats"><div><b class="num">${G.day + 1}</b><span>días</span></div><div><b class="num">${G.pop}</b><span>habitantes</span></div><div><b class="num">${G.built}</b><span>construcciones</span></div></div>
  <p>No hay más metas que las que tú quieras. El valle sigue aquí, y sigue siendo tuyo.</p>
  <div class="btns"><button class="btn pri" data-x>Seguir cuidando el valle</button></div>`);
}

/* --------------------------------------------------------- guardado */
function save() {
  try {
    localStorage.setItem(SAVE, JSON.stringify({
      v: 1, seed: G.seed, day: G.day, res: G.res, pop: G.pop, hungry: G.hungry, wish: G.wish, unlocked: G.unlocked, hearthLit: G.hearthLit, won: G.won, built: G.built,
      terr: tiles.map(t => t.terrain[0]).join(''), saps: tiles.filter(t => t.sap).map(t => [t.key, t.sap]),
      b: G.buildings.filter(b => b.type !== 'hearth').map(b => [b.type, b.tile.key, b.paused ? 1 : 0, b.lit ? 1 : 0]),
    }));
  } catch (e) { }
}
function loadSave() { try { const s = JSON.parse(localStorage.getItem(SAVE)); return s && s.v === 1 ? s : null; } catch (e) { return null; } }
function newGame(sv) {
  clearWorld();
  G = sv ? { seed: sv.seed, day: sv.day, res: sv.res, pop: sv.pop, hungry: sv.hungry, hib: 0, wish: sv.wish, unlocked: sv.unlocked, hearthLit: sv.hearthLit, won: sv.won, built: sv.built || 0, buildings: [] }
    : { seed: (Math.random() * 1e9) | 0, day: 0, res: { food: 10, wood: 7, stone: 2 }, pop: 2, hungry: 0, hib: 0, wish: 0, unlocked: ['garden', 'lumber', 'fell'], hearthLit: true, won: false, built: 0, buildings: [] };
  const terr = genTerrain(G.seed), tk = { m: 'meadow', f: 'forest', r: 'rock', w: 'water' }; let i = 0;
  for (const [k, v] of terr) { const t = makeTile(v.q, v.r, sv ? tk[sv.terr[i]] : v.terrain); tiles.push(t); tmap.set(k, t); i++; }
  placeBuilding('hearth', tmap.get('0,0'), true);
  if (sv) { for (const [type, key, p, l] of sv.b) { const b = placeBuilding(type, tmap.get(key), true); b.paused = !!p; b.lit = !!l; } for (const [key, d] of sv.saps) setSapling(tmap.get(key), d); }
  tod = .31; dayClock = 0; tool = null; selected = null; hover = null; fresh.clear();
  applySeason(true); refresh();
}

/* ------------------------------------------------- estaciones y cielo */
const vis = { grass: new T.Color(), tuft: new T.Color(), leaf: new T.Color(), pine: new T.Color(), tint: new T.Color(1, 1, 1), snow: 0, overcast: 0, fog: 0, rain: 0, snowfall: 0, aurora: 0 };
function applySeason(instant) {
  const s = SEASONS[season()], w = weatherAt(G.day);
  vis.grass.set(s.grass); vis.tuft.set(s.tuft); vis.leaf.set(s.leaf); vis.pine.set(s.pine); vis.tint.setRGB(...s.tint);
  vis.snow = season() === 3 ? 1 : 0; vis.overcast = w === 'rain' ? .85 : w === 'fog' ? .55 : w === 'snow' ? .6 : 0; vis.fog = w === 'fog' ? 1 : 0; vis.rain = w === 'rain' ? 1 : 0; vis.snowfall = w === 'snow' ? 1 : 0;
  const fs = season() < 2 ? 1 : .001;
  for (const t of tiles) if (t.flowers) { if (instant) t.flowers.scale.setScalar(fs); else if (Math.abs(t.flowers.scale.x - fs) > .01) { const a = t.flowers.scale.x, f = t.flowers; tween(1.5, k => f.scale.setScalar(lerp(a, fs, k))); } }
  if (instant) { MAT.grass.color.copy(vis.grass); MAT.tuft.color.copy(vis.tuft); MAT.leaf.color.copy(vis.leaf); MAT.pine.color.copy(vis.pine); U.uSnow.value = vis.snow; U.uIce.value = vis.snow; cur.overcast = vis.overcast; cur.fog = vis.fog; }
  if (audio.ctx) audio.setScale(season());
}
const cur = { overcast: 0, fog: 0, rain: 0, snowfall: 0, night: 0, day: 1, e: 1 };
const K = {}; for (const [n, v] of Object.entries({
  night: { zen: 0x070c26, hor: 0x1f2c58, gnd: 0x0c1230, sun: 0xa9c0ff, hs: 0x4a5fa6, hg: 0x23273c },
  dusk: { zen: 0x333b78, hor: 0xf79a62, gnd: 0x4a4a86, sun: 0xff8442, hs: 0x8f80ae, hg: 0x4b3a38 },
  gold: { zen: 0x4f89cf, hor: 0xffdcb0, gnd: 0x7fa6d8, sun: 0xffc88a, hs: 0xc0d3ee, hg: 0x86705a },
  day: { zen: 0x3f8fe0, hor: 0xcfeaf7, gnd: 0x6fb0ea, sun: 0xfff2de, hs: 0xcfe4ff, hg: 0x8f8668 },
})) { K[n] = {}; for (const [k, h] of Object.entries(v)) K[n][k] = new T.Color(h); }
const _k = new T.Color(), _g = new T.Color(), sunDir = new T.Vector3(), moonDir = new T.Vector3(-.45, .72, -.52).normalize();
function skyMix(e, key, out) {
  if (e < -.18) out.copy(K.night[key]); else if (e < .03) out.copy(K.night[key]).lerp(K.dusk[key], sstep(-.18, .03, e));
  else if (e < .32) out.copy(K.dusk[key]).lerp(K.gold[key], sstep(.03, .32, e)); else out.copy(K.gold[key]).lerp(K.day[key], sstep(.32, .78, e));
  return out;
}
function updateSky(dt, time) {
  if (!busy && started) { dayClock += dt; tod = lerp(.31, .69, sstep(0, 1, dayClock / 320)); }
  if (todLock !== null) tod = todLock;
  const ang = (tod - .25) * TAU, e = Math.sin(ang);
  sunDir.set(Math.cos(ang) * .82, e, .52).normalize();
  const dayF = sstep(-.15, .12, e), night = 1 - dayF; cur.night = night; cur.day = dayF; cur.e = e;
  for (const k of ['overcast', 'fog', 'rain', 'snowfall']) cur[k] = damp(cur[k], vis[k], .7, dt);
  const oc = cur.overcast;
  _g.setRGB(.6, .65, .72).multiplyScalar(lerp(.05, .95, dayF));
  skyU.uZen.value.copy(skyMix(e, 'zen', _k)).lerp(_g, oc * .8);
  skyU.uHor.value.copy(skyMix(e, 'hor', _k)).lerp(_g.multiplyScalar(1.15), oc * .75);
  skyU.uGnd.value.copy(skyMix(e, 'gnd', _k)).lerp(_g, oc * .6);
  skyU.uSunDir.value.copy(sunDir); skyU.uMoonDir.value.copy(moonDir); skyU.uNight.value = night * (1 - oc * .7);
  skyMix(e, 'sun', sun.color); skyU.uSunCol.value.copy(sun.color).multiplyScalar((1 - oc) * dayF);
  vis.aurora = G && G.won ? 1 : 0; skyU.uAurora.value = damp(skyU.uAurora.value, vis.aurora * night, .5, dt);
  if (e > -.04) { sun.position.copy(sunDir).multiplyScalar(36); sun.intensity = 3.3 * sstep(-.04, .3, e) * (1 - oc * .62); }
  else { sun.position.copy(moonDir).multiplyScalar(36); sun.intensity = 1.25 * sstep(.04, .3, -e) * (1 - oc * .4); sun.color.set(0x9fb6ff); }
  skyMix(e, 'hs', hemi.color).lerp(_g, oc * .5); skyMix(e, 'hg', hemi.groundColor);
  hemi.intensity = lerp(.95, 1.05, dayF) + oc * .22 * dayF;
  scene.fog.color.copy(skyU.uHor.value); scene.fog.density = lerp(.0055, .036, cur.fog) + cur.rain * .008 + cur.snowfall * .007;
  mFinal.uniforms.uExp.value = lerp(1.32, 1.08, dayF); mFinal.uniforms.uTint.value.lerp(vis.tint, 1 - Math.exp(-dt * .6));
  // estaciones: interpolación suave de materiales
  const a = 1 - Math.exp(-dt * .55);
  MAT.grass.color.lerp(vis.grass, a); MAT.tuft.color.lerp(vis.tuft, a); MAT.leaf.color.lerp(vis.leaf, a); MAT.pine.color.lerp(vis.pine, a);
  U.uSnow.value = damp(U.uSnow.value, vis.snow, .5, dt); U.uIce.value = damp(U.uIce.value, vis.snow, .4, dt);
  U.uWind.value = 1 + cur.rain * 1.2 + cur.snowfall * .5 + Math.sin(time * .23) * .35;
  MAT.cloud.emissiveIntensity = lerp(.03, .12, dayF);
  // luces cálidas
  const fl = .8 + .12 * Math.sin(time * 11.3) + .08 * Math.sin(time * 23.7 + 1.3);
  MAT.win.color.setRGB(lerp(.03, 2.9, night), lerp(.025, 1.6, night), lerp(.02, .55, night));
  MAT.glass.emissiveIntensity = night * .9; MAT.beacon.color.setRGB(3.2 + Math.sin(time * 2) * .5, 2.5, 1.3);
  hearthLight.intensity = G && G.hearthLit ? (2.5 + 9 * night) * fl : 1 * night;
  world.traverse(o => {
    const u = o.userData; if (u.glow) { const k = u.kind === 'win' ? night : u.kind === 'fire' ? (.07 + .93 * night) * (.85 + .15 * Math.sin(time * 9 + u.ph)) : .35 + .65 * night; o.material.opacity = u.on ? u.base * k : 0; o.visible = o.material.opacity > .01; }
    else if (u.isFlame) for (const m of o.children) { const f = m.userData, w = Math.sin(time * 9 + f.ph) * .12 + Math.sin(time * 17 + f.ph * 2) * .08; m.scale.set(f.r * (1 - w * .5), f.h * (1 + w), f.r * (1 - w * .5)); m.position.y = f.h * (1 + w) / 2; m.position.x = Math.sin(time * 6 + f.ph) * .012; m.rotation.y = time * 1.5 + f.ph; }
    else if (u.crystal) { u.crystal.rotation.y = time * .8; u.crystal.position.y = 1.38 + Math.sin(time * 1.6) * .03; }
  });
  for (const c of clouds) { c.a += c.sp * dt; c.m.position.set(Math.cos(c.a) * c.rad, c.y + Math.sin(time * .1 + c.a * 3) * .2, Math.sin(c.a) * c.rad); }
  for (const f of floaters) f.position.y = f.userData.y + Math.sin(time * .4 + f.userData.ph) * .25;
  world.position.y = Math.sin(time * .45) * .05;
}
function syncVisuals() {
  for (const b of G.buildings) {
    const u = b.model.userData;
    if (b.type === 'hearth') { u.flame.scale.setScalar(G.hearthLit ? 1 : .25); b.model.children.forEach(c => { if (c.userData.glow) c.userData.on = G.hearthLit; }); }
    if (b.type === 'brazier') { u.flame.visible = b.lit; u.glowM.userData.on = b.lit; }
    if (b.type === 'cabin') { const dark = b.cold || !b.residents; u.win.material = dark ? MAT.winCold : MAT.win; u.glowM.userData.on = !dark; }
  }
}

/* ---------------------------------------------- partículas ambientales */
const acc = {};
function emit(key, rate, dt, fn) { acc[key] = (acc[key] || 0) + rate * dt; let n = 0; while (acc[key] >= 1 && n++ < 60) { acc[key]--; fn(); } }
const rnd = (a, b) => a + Math.random() * (b - a);
function updateAmbient(dt, time) {
  if (!G) return; const S = season(), N = cur.night, wet = cur.rain > .3 || cur.snowfall > .3;
  const disk = (R) => { const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * R; return [Math.cos(a) * r, Math.sin(a) * r]; };
  if (!wet) emit('mote', 7 * cur.day, dt, () => { const [x, z] = disk(8); fxAdd.spawn(x, rnd(.3, 4), z, rnd(-.1, .1), rnd(-.02, .06), rnd(-.1, .1), rnd(5, 9), rnd(.04, .08), 1, .85, .55, .5, { kind: 1, drag: .8 }); });
  if (S < 3 && !wet) emit('fly', 7 * N, dt, () => { const [x, z] = disk(6.5); fxAdd.spawn(x, rnd(.25, 1.6), z, rnd(-.15, .15), 0, rnd(-.15, .15), rnd(4, 8), rnd(.07, .11), 1.5, 2.2, .5, 1, { kind: 1, drag: 1 }); });
  emit('rain', 520 * cur.rain, dt, () => { const [x, z] = disk(9.5); const l = .22 + .78 * cur.day; fxMix.spawn(x + 1, 9, z, -1.4, -15, 0, .72, .55, .78 * l, .86 * l, l, .3, { shape: 1 }); });
  emit('snow', 85 * cur.snowfall, dt, () => { const [x, z] = disk(9.5); const l = .35 + .65 * cur.day; fxMix.spawn(x, 8, z, rnd(-.2, .2), rnd(-1.4, -.8), rnd(-.2, .2), 7.5, rnd(.07, .13), l, l, l * 1.05, .9, { kind: 2 }); });
  const forests = tiles.filter(t => t.terrain === 'forest');
  if (forests.length && (S === 2 || S === 0)) emit('leaf', S === 2 ? 4 : 2, dt, () => {
    const t = forests[Math.random() * forests.length | 0], p = tilePos(t, rnd(.5, 1)); const c = S === 2 ? [[.95, .5, .15], [.85, .3, .12], [.98, .75, .25]][Math.random() * 3 | 0] : [1, .72, .82];
    fxMix.spawn(p.x + rnd(-.5, .5), p.y, p.z + rnd(-.5, .5), rnd(.1, .5), rnd(-.5, -.25), rnd(-.2, .2), 5, rnd(.07, .11), c[0], c[1], c[2], .95, { kind: 2 });
  });
  for (const b of G.buildings) {
    const p = tilePos(b.tile);
    if (b.type === 'hearth' && G.hearthLit) {
      emit('hsp', 9, dt, () => fxAdd.spawn(p.x + rnd(-.1, .1), p.y + .4, p.z + rnd(-.1, .1), rnd(-.15, .15), rnd(.6, 1.3), rnd(-.15, .15), rnd(1, 2), rnd(.04, .07), 3, 1.3, .3, 1, { kind: 1 }));
      emit('hsm', 2.5, dt, () => fxMix.spawn(p.x, p.y + .7, p.z, rnd(.05, .2), rnd(.4, .6), rnd(-.05, .05), rnd(3, 4.5), .16, .8, .76, .72, .2, { grow: .22, drag: .2 }));
    } else if (b.type === 'brazier' && b.lit) emit('bz' + b.tile.key, 3, dt, () => fxAdd.spawn(p.x, p.y + .6, p.z, rnd(-.1, .1), rnd(.5, 1), rnd(-.1, .1), rnd(.8, 1.5), .05, 3, 1.3, .3, 1, { kind: 1 }));
    else if (b.type === 'cabin' && b.residents && !b.cold && (N > .3 || S >= 2)) { const s = b.model.userData.smoke; emit('cs' + b.tile.key, 1.6, dt, () => fxMix.spawn(p.x + s.x, p.y + s.y, p.z + s.z, rnd(.05, .18), rnd(.35, .5), rnd(-.04, .04), rnd(2.8, 4), .1, .86, .83, .8, .24, { grow: .2, drag: .2 })); }
    else if (b.type === 'hive' && S < 3 && !wet && cur.day > .5 && cur.fog < .5) emit('bee' + b.tile.key, 3.5, dt, () => fxMix.spawn(p.x + rnd(-.3, .3), p.y + rnd(.2, .5), p.z + rnd(-.3, .3), rnd(-.4, .4), rnd(-.1, .2), rnd(-.4, .4), rnd(1.5, 2.5), .05, 1, .78, .1, 1, { kind: 3, drag: 3 }));
    else if (b.type === 'beacon') emit('bk', 1.2 + 2 * N, dt, () => { const [x, z] = disk(7); fxAdd.spawn(x, rnd(0, .5), z, rnd(-.05, .05), rnd(.25, .5), rnd(-.05, .05), rnd(8, 12), rnd(.1, .18), 3, 1.7, .55, .9 * (.25 + .75 * N), { kind: 1, drag: .3 }); });
  }
  fxAdd.update(dt, time); fxMix.update(dt, time);
  const px = VH * .5 / Math.tan(camera.fov * Math.PI / 360); fxAdd.u.uPx.value = fxMix.u.uPx.value = px;
}

/* ----------------------------------------------------------- vecinos */
const villagers = [];
function tileAt(x, z) { const r = z / 1.5, q = x / SQ3 - r / 2; let rq = Math.round(q), rr = Math.round(r), rs = Math.round(-q - r); const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs + q + r); if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs; return tmap.get(hkey(rq, rr)); }
function findPath(a, b) {
  for (const strict of [2, 1, 0]) {
    const prev = new Map([[a, null]]), qu = [a];
    while (qu.length) {
      const c = qu.shift(); if (c === b) { const p = []; for (let n = b; n; n = prev.get(n)) p.unshift(n); return p; }
      for (const n of nbs(c)) { if (prev.has(n)) continue; if (n !== b) { if (strict >= 1 && (n.terrain === 'water' || n.terrain === 'rock')) continue; if (strict === 2 && (n.terrain === 'forest' || n.b || n.sap)) continue; } prev.set(n, c); qu.push(n); }
    }
  }
  return [a, b];
}
function syncVillagers() {
  const homes = [tmap.get('0,0'), tmap.get('0,0')];
  for (const b of G.buildings) if (b.type === 'cabin' && !b.cold) for (let i = 0; i < b.residents; i++) homes.push(b.tile);
  const jobs = G.buildings.filter(b => DEF[b.type].worker && b.active);
  while (villagers.length > jobs.length) world.remove(villagers.pop().m);
  jobs.forEach((b, i) => {
    let v = villagers[i]; const home = homes[i % homes.length];
    if (!v) { v = villagers[i] = { m: villagerMesh(mulberry(i * 977 + G.seed)), s: 0, dir: 1, dwell: Math.random() * 3, key: '', sc: 0 }; world.add(v.m); }
    const key = home.key + '>' + b.tile.key;
    if (v.key !== key) {
      v.key = key; const path = findPath(home, b.tile); const pts = path.map(t => new T.Vector2(t.group.position.x, t.group.position.z));
      if (pts.length > 1) { pts[0].lerp(pts[1], .42); const n = pts.length - 1; pts[n].lerp(pts[n - 1], .42); } else pts.push(pts[0].clone().add(new T.Vector2(.5, .2)));
      const off = new T.Vector2(Math.cos(i * 2.4) * .12, Math.sin(i * 2.4) * .12); pts.forEach(p => p.add(off));
      v.pts = pts; v.len = []; v.total = 0; for (let j = 1; j < pts.length; j++) { const l = pts[j].distanceTo(pts[j - 1]); v.len.push(l); v.total += l; }
      v.s = 0; v.dir = 1; v.dwell = Math.random() * 2;
    }
  });
}
const _v2 = new T.Vector2();
function updateVillagers(dt, time) {
  const sleepy = cur.night > .55;
  villagers.forEach((v, i) => {
    if (sleepy) v.dir = -1;
    if (v.dwell > 0 && !sleepy) v.dwell -= dt; else { v.s += v.dir * dt * .6; if (v.s >= v.total) { v.s = v.total; v.dir = -1; v.dwell = rnd(6, 11); } else if (v.s <= 0) { v.s = 0; if (!sleepy) { v.dir = 1; v.dwell = rnd(2, 4); } } }
    let s = v.s, j = 0; while (j < v.len.length - 1 && s > v.len[j]) { s -= v.len[j]; j++; }
    _v2.copy(v.pts[j]).lerp(v.pts[j + 1], v.len[j] ? clamp(s / v.len[j]) : 0);
    const t = tileAt(_v2.x, _v2.y), moving = v.dwell <= 0 && v.s > 0 && v.s < v.total, working = v.s >= v.total;
    const hop = moving ? Math.abs(Math.sin(time * 9 + i)) * .035 : working ? Math.max(0, Math.sin(time * 5 + i)) * .03 : 0;
    v.m.position.set(_v2.x, (t ? t.h + t.y : 0) + hop, _v2.y);
    if (moving) { v.m.rotation.y = damp(v.m.rotation.y, Math.atan2(v.pts[j + 1].x - v.pts[j].x, v.pts[j + 1].y - v.pts[j].y) + (v.dir < 0 ? Math.PI : 0), 8, dt); }
    v.sc = damp(v.sc, sleepy && v.s <= 0 ? 0 : 1, 5, dt); v.m.scale.setScalar(Math.max(.001, v.sc)); v.m.visible = v.sc > .02;
  });
}

/* --------------------------------------------------------------- audio */
const audio = {
  ctx: null, on: true, scale: [0, 2, 4, 7, 9], root: 50, mel: 7, padT: 1, pluckT: 2, birdT: 4, crickT: 1, crackT: .3,
  init() {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC || this.ctx) return;
    const c = this.ctx = new AC(); this.master = c.createGain(); this.master.gain.value = this.on ? .85 : 0;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3; this.master.connect(comp); comp.connect(c.destination);
    const len = c.sampleRate * 3.2, ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    this.rev = c.createConvolver(); this.rev.buffer = ir; const rg = c.createGain(); rg.gain.value = .55; this.rev.connect(rg); rg.connect(this.master);
    this.music = c.createGain(); this.music.gain.value = .5; this.music.connect(this.master); this.music.connect(this.rev);
    this.sfx = c.createGain(); this.sfx.gain.value = .7; this.sfx.connect(this.master); const sr = c.createGain(); sr.gain.value = .35; this.sfx.connect(sr); sr.connect(this.rev);
    this.amb = c.createGain(); this.amb.gain.value = 1; this.amb.connect(this.master);
    const nb = this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const loop = (type, f, q) => { const s = c.createBufferSource(); s.buffer = nb; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.amb); s.start(); return { g, fl }; };
    this.wind = loop('bandpass', 420, .5); this.rainN = loop('highpass', 2400, .3); this.rainLow = loop('bandpass', 900, .4);
    if (G) this.setScale(season());
  },
  setScale(s) { this.scale = [[0, 2, 4, 7, 9], [0, 2, 4, 7, 9], [0, 3, 5, 7, 10], [0, 3, 5, 7, 10]][s]; this.root = [50, 55, 52, 49][s]; },
  f(deg) { const n = this.scale.length, o = Math.floor(deg / n), i = ((deg % n) + n) % n; return 440 * Math.pow(2, (this.root + this.scale[i] + 12 * o - 69) / 12); },
  env(g, t, a, d, peak) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); },
  tone(freq, { type = 'sine', a = .005, d = .5, g = .15, when = 0, to = 0, dest } = {}) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + when, o = c.createOscillator(), gn = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + a + d * .8);
    this.env(gn, t, a, d, g); o.connect(gn); gn.connect(dest || this.sfx); o.start(t); o.stop(t + a + d + .05);
  },
  pluck(freq, vol = .14, when = 0, dest) { this.tone(freq, { d: 1.3, g: vol, when, dest: dest || this.music }); this.tone(freq * 3.01, { d: .25, g: vol * .22, when, dest: dest || this.music }); this.tone(freq * 2, { type: 'triangle', d: .6, g: vol * .12, when, dest: dest || this.music }); },
  hit(f, d, g, when = 0, type = 'lowpass') { if (!this.ctx) return; const c = this.ctx, t = c.currentTime + when, s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; const gn = c.createGain(); this.env(gn, t, .004, d, g); s.connect(fl); fl.connect(gn); gn.connect(this.sfx); s.start(t, Math.random()); s.stop(t + d + .1); },
  pad() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime, base = [0, 2, 3, -1, 1][Math.random() * 5 | 0] - 5;
    [0, 2, 4, 7].forEach((st, i) => {
      const f = this.f(base + st), o1 = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
      o1.type = 'triangle'; o2.type = 'sine'; o1.frequency.value = f; o2.frequency.value = f * 1.004; fl.type = 'lowpass'; fl.frequency.value = 650;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(i === 3 ? .03 : .055, t + 3.5); g.gain.linearRampToValueAtTime(0.0001, t + 11.5);
      o1.connect(fl); o2.connect(fl); fl.connect(g); g.connect(this.music); o1.start(t); o2.start(t); o1.stop(t + 12); o2.stop(t + 12);
    });
  },
  update(dt) {
    if (!this.ctx || !G) return; const c = this.ctx, N = cur.night, S = season(), t = c.currentTime;
    this.wind.g.gain.setTargetAtTime(.02 + cur.snowfall * .05 + cur.rain * .03 + (S === 3 ? .02 : 0) + cur.fog * .01, t, .8);
    this.wind.fl.frequency.setTargetAtTime(380 + Math.sin(t * .2) * 160, t, .5);
    this.rainN.g.gain.setTargetAtTime(cur.rain * .035, t, .6); this.rainLow.g.gain.setTargetAtTime(cur.rain * .05, t, .6);
    if ((this.padT -= dt) <= 0) { this.padT = 9; this.pad(); }
    if ((this.pluckT -= dt) <= 0) {
      this.pluckT = rnd(.5, 2.6) * (1 + N * .9) * (S === 3 ? 1.4 : 1);
      this.mel = clamp(this.mel + [-2, -1, -1, 1, 1, 2][Math.random() * 6 | 0], 3, 13);
      this.pluck(this.f(this.mel - (N > .5 ? 5 : 0)), .075); if (Math.random() < .25) this.pluck(this.f(this.mel + 2), .045, .18);
    }
    if ((this.birdT -= dt) <= 0) { this.birdT = rnd(3, 9); if (cur.day > .6 && S < 3 && cur.rain < .3 && started) { const f = rnd(2300, 3400), n = 2 + (Math.random() * 3 | 0); for (let i = 0; i < n; i++) this.tone(f * (1 + i * .04), { d: .09, g: .022, when: i * .13, to: f * 1.25 }); } }
    if ((this.crickT -= dt) <= 0) { this.crickT = rnd(.5, 1.3); if (N > .6 && S < 3 && cur.rain < .3) for (let i = 0; i < 3; i++) this.tone(4300, { d: .03, g: .009, when: i * .055 }); }
    if ((this.crackT -= dt) <= 0) { this.crackT = rnd(.08, .5); if (G.hearthLit) this.hit(rnd(1800, 3800), .02, .012 + N * .02, 0, 'bandpass'); }
  },
  toggle() { this.on = !this.on; if (this.ctx) this.master.gain.setTargetAtTime(this.on ? .85 : 0, this.ctx.currentTime, .1); $('#b-snd').innerHTML = ic(this.on ? 'sound' : 'mute'); },
};
const sfx = {
  place() { audio.tone(190, { to: 70, d: .16, g: .4 }); audio.hit(900, .07, .25); audio.pluck(audio.f(5), .13, .06, audio.sfx); audio.pluck(audio.f(7), .11, .16, audio.sfx); audio.pluck(audio.f(9), .09, .26, audio.sfx); },
  error() { audio.tone(196, { type: 'triangle', d: .12, g: .1 }); audio.tone(165, { type: 'triangle', d: .16, g: .1, when: .09 }); },
  tick() { audio.tone(1250, { d: .04, g: .035 }); },
  select() { audio.pluck(audio.f(8), .07, 0, audio.sfx); },
  pop(i) { audio.pluck(audio.f(5 + (i % 8)), .11, 0, audio.sfx); },
  eat() { audio.tone(330, { to: 250, d: .12, g: .08, type: 'triangle' }); },
  dusk() { [9, 7, 5, 4].forEach((d, i) => audio.pluck(audio.f(d), .1, i * .22, audio.sfx)); },
  dawn() { [3, 5, 7, 9, 12].forEach((d, i) => audio.pluck(audio.f(d), .09, 1.2 + i * .16, audio.sfx)); },
  chop() { audio.hit(1300, .05, .3, 0, 'bandpass'); audio.hit(1100, .05, .3, .16, 'bandpass'); audio.tone(120, { to: 50, d: .25, g: .4, when: .34 }); audio.hit(500, .3, .2, .34); },
  plant() { audio.hit(700, .12, .14); audio.pluck(audio.f(6), .1, .08, audio.sfx); },
  demolish() { audio.tone(150, { to: 60, d: .22, g: .3 }); audio.hit(600, .25, .2); },
  wish() { [5, 7, 9, 10, 12, 14].forEach((d, i) => audio.pluck(audio.f(d), .11, i * .09, audio.sfx)); },
  crackleBig() { for (let i = 0; i < 6; i++) audio.hit(rnd(1500, 3500), .03, .06, i * .07 + Math.random() * .05, 'bandpass'); },
};

/* ------------------------------------------------------------ interfaz */
const fresh = new Set(), floats = [], badges = new Map();
const labels = $('#labels'), hov = $('#hov');
function floatAt(t, html, cls = '', up = .5) { const el = document.createElement('div'); el.className = 'fl ' + cls; el.innerHTML = `<div class="in">${html}</div>`; labels.appendChild(el); floats.push({ el, t, up, born: performance.now() }); }
function toast(icon, html) { const el = document.createElement('div'); el.className = 'tst'; el.innerHTML = ic(icon) + `<span>${html}</span>`; const box = $('#toast'); box.appendChild(el); while (box.children.length > 4) box.firstChild.remove(); setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 6500); }
function seasonCard(s) { const el = $('#season'); el.querySelector('.eyebrow').textContent = `Año ${Math.floor(G.day / 24) + 1}`; el.querySelector('h1').textContent = SEASONS[s].name; el.querySelector('p').textContent = SEASONS[s].line; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
function modal(html) { const m = $('#modal'); m.querySelector('.card').innerHTML = html; m.classList.remove('hidden'); m.querySelectorAll('[data-x]').forEach(b => b.onclick = () => m.classList.add('hidden')); return m; }
function renderDate() {
  const s = season(), d = G.day % 6, w = weatherAt(G.day);
  $('#date').innerHTML = `<h2>${SEASONS[s].name}</h2>
  <div class="sub"><span class="num">Día ${d + 1} de 6 · año ${Math.floor(G.day / 24) + 1}</span><span class="dots">${[0, 1, 2, 3, 4, 5].map(i => `<i class="${i < d ? 'on' : i === d ? 'now' : ''}"></i>`).join('')}</span></div>
  <div class="wx">${ic(w)}<b>${WX[w].name}</b><span class="fc" title="Próximos días">${[1, 2, 3].map(i => `<span title="${WX[weatherAt(G.day + i)].name}">${ic(weatherAt(G.day + i))}</span>`).join('')}</span></div>
  <div class="wxnote">${WX[w].note}${d === 5 ? ` Mañana empieza ${['el verano', 'el otoño', 'el invierno', 'la primavera'][s]}.` : ''}</div>`;
}
const lastRes = {};
function renderRes() {
  const sg = n => n > 0 ? `<span class="d num">+${n}</span>` : n < 0 ? `<span class="d neg num">−${-n}</span>` : `<span class="d zero num">±0</span>`;
  const nf = E.prod.food - E.eat, nw = E.prod.wood - E.burn;
  const idle = E.free, lack = Math.max(0, E.need - E.workers), asleep = G.hib + G.hungry;
  const pills = [
    ['food', G.res.food, `<span class="cap num">/${E.cap.food}</span>${sg(nf)}`, `Comida\nProducción +${E.prod.food} · Cena −${E.eat}\nDespensa: ${E.cap.food}`],
    ['wood', G.res.wood, sg(nw), `Leña\nProducción +${E.prod.wood}${E.burn ? ` · Fuego −${E.burn} esta noche` : ' · El fuego no pide leña ahora'}`],
    ['stone', G.res.stone, sg(E.prod.stone), `Piedra\nProducción +${E.prod.stone}`],
    ['pop', G.pop, `<span class="cap num">/${E.cap.pop}</span>` + (lack ? `<span class="d neg">faltan ${lack}</span>` : asleep ? `<span class="d neg">${asleep} en reposo</span>` : idle ? `<span class="d">${idle} libre${idle > 1 ? 's' : ''}</span>` : `<span class="d zero">ocupados</span>`), `Habitantes\n${E.workers} con fuerzas · ${E.need} tareas que piden manos${G.hib ? `\n${G.hib} hibernando en cabañas frías` : ''}${G.hungry ? `\n${G.hungry} descansando sin cenar` : ''}\nLlega alguien cada día si hay sitio y comida de sobra.`],
  ];
  const box = $('#res'); if (!box.children.length) box.innerHTML = pills.map(p => `<div class="pill" id="p-${p[0]}"></div>`).join('');
  for (const [k, v, extra, tip] of pills) { const el = $('#p-' + k); el.innerHTML = `${ic(k)}<span class="v num">${v}</span>${extra}`; el.dataset.tip = tip; if (lastRes[k] !== undefined && lastRes[k] !== v) { el.classList.add('bump'); setTimeout(() => el.classList.remove('bump'), 260); } lastRes[k] = v; }
}
function renderBar() {
  const bar = $('#bar'); let key = 0, html = '';
  for (const t of BAR) {
    if (!G.unlocked.includes(t)) continue; key++; const D = DEF[t];
    const cost = Object.entries(D.cost || {}).map(([k, v]) => `<span class="${G.res[k] < v ? 'no' : ''}">${ic(k)}<i class="num" style="font-style:normal">${v}</i></span>`).join('') || (t === 'fell' ? `<span>+3${ic('wood')}</span>` : '');
    html += `<button class="tool${tool === t ? ' sel' : ''}${afford(t) ? '' : ' poor'}${fresh.has(t) ? ' new' : ''}${t === 'plant' || (t === 'fell' && !G.unlocked.includes('plant')) ? ' sep' : ''}" data-t="${t}" aria-label="${D.name}"><span class="k">${key < 10 ? key : key === 10 ? 0 : ''}</span><svg class="i g" viewBox="0 0 24 24"><path d="${IC[D.icon]}"/></svg><span class="n">${D.name}</span><span class="c">${cost}</span></button>`;
  }
  bar.innerHTML = html; fresh.clear();
  bar.querySelectorAll('.tool').forEach(b => { b.onclick = () => { audio.init(); setTool(tool === b.dataset.t ? null : b.dataset.t); }; b.onmouseenter = () => showHint(b.dataset.t); b.onmouseleave = () => showHint(tool); });
}
function showHint(t) { const h = $('#hint'); if (!t) { h.classList.add('hidden'); return; } h.innerHTML = `<b>${DEF[t].name}</b>${DEF[t].desc}`; h.classList.remove('hidden'); }
function renderWish() {
  const el = $('#wish'), w = WISHES[G.wish];
  const steps = `<div class="steps">${WISHES.map((_, i) => `<i class="${i < G.wish ? 'on' : ''}"></i>`).join('')}</div>`;
  if (!w) { el.innerHTML = `<div class="eyebrow">Valle en calma</div><h3>Todo anhelo, cumplido</h3><p>Sigue cuidando el valle a tu ritmo. Las noches traen aurora.</p>${steps}`; return; }
  const rw = Object.entries(w.rw).map(([k, v]) => `+${v} ${ic(k)}`).join(' ');
  el.innerHTML = `<div class="eyebrow">Anhelo ${G.wish + 1} de ${WISHES.length}</div><h3>${w.t}</h3><p>${w.d}</p>${steps}${rw || w.un.length ? `<div class="rw">${rw}${w.un.length ? ` · abre ${w.un.map(u => DEF[u].name).join(', ')}` : ''}</div>` : ''}`;
}
function renderInfo() {
  const el = $('#info'), t = selected; if (!t) { el.classList.add('hidden'); return; }
  let h = '<button class="x" aria-label="Cerrar">×</button>';
  if (t.b) {
    const b = t.b, D = DEF[b.type]; let st = 'Activo', off = false;
    if (b.type === 'hearth') { st = G.hearthLit ? 'Encendido' : 'En brasas: falta leña'; off = !G.hearthLit; }
    else if (b.paused) { st = 'En pausa'; off = true; } else if (D.worker && !b.active) { st = 'Sin manos libres'; off = true; }
    else if (b.type === 'cabin') { st = b.cold ? 'Fría: sus vecinos hibernan' : `${b.residents} de 2 vecinos${season() === 3 ? ' · al calor' : isWarm(t) ? ' · quedará al calor' : ' · fuera del calor'}`; off = b.cold; }
    else if (b.type === 'brazier') { st = b.lit ? 'Encendido' : 'Apagado: falta leña'; off = !b.lit; }
    h += `<h3>${D.name}</h3><div class="st${off ? ' off' : ''}">${st}</div><p>${D.desc}</p>`;
    if (b.y) h += `<table>${b.y.parts.map(p => `<tr><td>${p[0]}</td><td class="num">${p[1] > 0 ? '+' : '−'}${Math.abs(p[1])}</td></tr>`).join('')}${b.y.note ? `<tr><td colspan="2">${b.y.note}</td></tr>` : ''}<tr class="tot"><td>${RES[b.y.res]} hoy</td><td class="num">+${b.active ? b.y.total : 0}</td></tr></table>`;
    if (b.type === 'hearth' && E.burn) h += `<table><tr class="tot"><td>Leña esta noche</td><td class="num">−${E.burn}</td></tr></table>`;
    if (b.type !== 'hearth') { const rf = Object.entries(D.cost || {}).filter(([k]) => k !== 'food').map(([k, v]) => `+${Math.floor(v / 2)} ${RES[k].toLowerCase()}`).join(', '); h += `<div class="acts">${D.worker ? `<button data-a="pause">${b.paused ? 'Reanudar' : 'Pausar'}</button>` : ''}<button data-a="demo" title="Recuperas ${rf}">Desmontar</button></div>`; }
  } else if (t.sap) h += `<h3>Arboleda joven</h3><div class="st">Bosque en ${t.sap} día${t.sap > 1 ? 's' : ''}</div><p>Crece sola. Cuando madure, los leñadores vecinos sacarán +1 leña.</p>`;
  else h += `<h3>${TERR[t.terrain].name}</h3><p>${TERR[t.terrain].desc}</p>${t.terrain === 'meadow' ? `<p>${isWarm(t) ? 'Dentro del calor del hogar.' : 'Fuera del calor: una cabaña aquí pasaría frío en invierno.'}</p>` : ''}`;
  el.innerHTML = h; el.classList.remove('hidden');
  el.querySelector('.x').onclick = () => select(null);
  el.querySelectorAll('[data-a]').forEach(bn => bn.onclick = () => { if (bn.dataset.a === 'pause') { t.b.paused = !t.b.paused; sfx.tick(); refresh(); } else demolish(t.b); });
}
function renderBadges() {
  for (const b of G.buildings) {
    let st = b.paused ? 'pause' : DEF[b.type].worker && !b.active ? 'hands' : (b.type === 'cabin' && b.cold) || (b.type === 'brazier' && !b.lit) || (b.type === 'hearth' && !G.hearthLit) ? 'snow' : null;
    let el = badges.get(b);
    if (!st) { if (el) { el.remove(); badges.delete(b); } continue; }
    if (!el) { el = document.createElement('div'); el.className = 'bdg'; labels.appendChild(el); badges.set(b, el); }
    if (el.dataset.s !== st) { el.dataset.s = st; el.innerHTML = ic(st); }
  }
  for (const [b, el] of badges) if (!G.buildings.includes(b)) { el.remove(); badges.delete(b); }
}
function refresh() { economy(); renderDate(); renderRes(); renderBar(); renderWish(); renderInfo(); renderBadges(); syncVisuals(); syncVillagers(); updateHover(); }
function setTool(t) { if (busy && t) return; tool = t; if (t) { select(null); sfx.select(); } showHint(t); document.querySelectorAll('.tool').forEach(b => b.classList.toggle('sel', b.dataset.t === t)); updateHover(); canvas.style.cursor = t ? 'crosshair' : ''; }
function select(t) { selected = t; renderInfo(); }

/* ------------------------------------------------ hover, vista previa */
let ghost = null, ghostType = null;
function setHover(t) { if (hover === t) return; hover = t; if (t && !busy) sfx.tick(); updateHover(); }
function updateHover() {
  if (!G) return;
  const warmView = (tool && WARM_TOOLS.includes(tool)) || (selected && selected.b && ['hearth', 'brazier', 'cabin', 'beacon'].includes(selected.b.type));
  let virt = null;
  if (tool && hover && (tool === 'brazier' || tool === 'beacon') && canPlace(tool, hover).ok) { virt = { type: tool, tile: hover, lit: true, virtual: true }; G.buildings.push(virt); }
  for (const t of tiles) { t.ovA = 0; t.lift = 0; if (warmView && isWarm(t) && t.terrain !== 'water') { t.ovC.setRGB(1, .55, .2); t.ovA = .3; } else if (tool && !warmView && tool !== 'fell' && t.terrain === 'meadow' && !t.b && !t.sap) { t.ovC.setRGB(1, .95, .8); t.ovA = .07; } }
  if (virt) G.buildings.pop();
  if (selected) { selected.ovC.setRGB(1, 1, 1); selected.ovA = .32; selected.lift = .05; }
  if (ghost) { ghost.parent && ghost.parent.remove(ghost); }
  hov.classList.add('hidden');
  if (!hover || busy) return;
  const t = hover;
  if (tool) {
    const c = canPlace(tool, t); t.lift = .1;
    if (c.ok) {
      t.ovC.setRGB(1, .93, .7); t.ovA = .5;
      for (const n of synergyTiles(tool, t)) { if (tool !== 'beacon') { n.ovC.setRGB(1, .78, .3); n.ovA = Math.max(n.ovA, .55); n.lift = .06; } }
      const d = previewDelta(tool, t), D = DEF[tool], bits = [];
      for (const k of ['food', 'wood', 'stone']) if (d[k]) bits.push(`<em class="${d[k] < 0 ? 'neg' : ''}">${d[k] > 0 ? '+' : '−'}${Math.abs(d[k])} ${ic(k)}</em>`);
      let line = bits.length ? bits.join('') + '<i style="font-style:normal">al día</i>' : '';
      if (tool === 'fell') line = `<em>+3 ${ic('wood')}</em> ahora` + (bits.length ? ' · ' + bits.join('') + ' al día' : '');
      if (tool === 'plant') line = 'Bosque en 4 días';
      if (tool === 'cabin') line = `+2 hogares · ${isWarm(t) ? 'al calor en invierno' : '<i class="warn" style="font-style:normal">fría en invierno</i>'}`;
      if (tool === 'granary') line = '+20 de despensa';
      if (tool === 'brazier') { const n = G.buildings.filter(b => b.type === 'cabin' && hdist(b.tile, t) <= 1).length; line = `Calienta 6 casillas${n ? ` · ${n} cabaña${n > 1 ? 's' : ''}` : ''}`; }
      if (tool === 'beacon') line = 'Calor eterno a 3 casillas';
      if (!line && D.worker) line = 'No rinde nada aquí';
      if (D.worker && E.free <= 0) line += ' · <i class="warn" style="font-style:normal">sin manos libres</i>';
      hov.innerHTML = `<b>${D.name}</b><span>${line}</span>`;
      if (MODELS[tool] || tool === 'plant') {
        const mt = tool === 'plant' ? 'sapling' : tool;
        if (ghostType !== mt) { ghost = MODELS[mt](mulberry(5)); const rm = []; ghost.traverse(o => { if (o.isMesh) { if (o.userData.glow) rm.push(o); else { o.material = MAT.ghost; o.castShadow = false; } } }); rm.forEach(o => o.parent.remove(o)); ghostType = mt; }
        ghost.position.y = t.h; t.group.add(ghost);
      }
    } else { t.ovC.setRGB(1, .35, .3); t.ovA = .4; hov.innerHTML = `<span class="warn">${c.why || ''}</span>`; }
    hov.classList.remove('hidden'); hov.dataset.up = c.ok && MODELS[tool] ? .9 : .5;
  } else {
    if (t !== selected) { t.ovC.setRGB(1, 1, 1); t.ovA = .2; t.lift = .06; }
    let name, line = '';
    if (t.b) { const b = t.b; name = DEF[b.type].name; if (b.y) line = b.paused ? 'En pausa' : !b.active ? '<i class="warn" style="font-style:normal">Sin manos libres</i>' : b.y.total ? `<em>+${b.y.total} ${ic(b.y.res)}</em> hoy` : (b.y.note || 'No rinde hoy'); else if (b.type === 'cabin') line = b.cold ? '<i class="warn" style="font-style:normal">Hibernando</i>' : `${b.residents}/2 vecinos`; }
    else { name = t.sap ? 'Arboleda joven' : TERR[t.terrain].name; if (t.sap) line = `Bosque en ${t.sap} día${t.sap > 1 ? 's' : ''}`; }
    hov.innerHTML = `<b>${name}</b>${line ? `<span>${line}</span>` : ''}`; hov.classList.remove('hidden'); hov.dataset.up = t.b ? t.b.model.userData.h + .15 : t.topH + .3;
  }
}
function clickTile(t) {
  if (busy || !started) return; audio.init();
  if (tool) {
    const c = canPlace(tool, t);
    if (c.ok) build(tool, t); else { sfx.error(); t.vy = .8; if (c.why) floatAt(t, c.why, 'note'); }
  } else { select(selected === t ? null : t); t.vy = -1.1; t.wig = 1; sfx.select(); if (t.terrain === 'water') audio.tone(600, { to: 300, d: .15, g: .12 }); updateHover(); }
}

/* ------------------------------------------------------ cámara y entrada */
const cam = { yaw: -1.1, pitch: .5, dist: 42, tx: 0, tz: 0, yawT: .62, pitchT: .66, distT: 25, txT: 0, tzT: 0 };
let camKick = 0;
const ray = new T.Raycaster(), ndc = new T.Vector2();
const ptrs = new Map(); let dragging = false, downAt = null, pinch = 0, lastMove = null;
function pickAt(x, y) { ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); const h = ray.intersectObjects(picks, false)[0]; return h ? h.object.userData.tile : null; }
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 1) { downAt = { x: e.clientX, y: e.clientY, b: e.button }; dragging = false; if (e.pointerType !== 'mouse') setHover(started ? pickAt(e.clientX, e.clientY) : null); } else { dragging = true; const p = [...ptrs.values()]; pinch = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); } });
canvas.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId);
  if (!p) { if (started && !busy) lastMove = { x: e.clientX, y: e.clientY }; return; }
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 2) { const q = [...ptrs.values()], d = Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y); cam.distT = clamp(cam.distT * pinch / d, 9, 34); pinch = d; return; }
  if (!dragging && downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) { dragging = true; setHover(null); }
  if (dragging) {
    if (downAt.b === 2 || e.shiftKey) { const s = cam.dist * .0016, c = Math.cos(cam.yaw), sn = Math.sin(cam.yaw); cam.txT = clamp(cam.txT - (dx * c + dy * sn) * s, -6, 6); cam.tzT = clamp(cam.tzT - (-dx * sn + dy * c) * s, -6, 6); }
    else { cam.yawT -= dx * .006; cam.pitchT = clamp(cam.pitchT + dy * .004, .3, 1.3); }
  }
});
const up = e => { if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId); if (ptrs.size === 0) { if (!dragging && downAt) { if (downAt.b === 0) { const t = pickAt(e.clientX, e.clientY); if (t) clickTile(t); else if (!tool) select(null); } else if (downAt.b === 2) { if (tool) setTool(null); else select(null); } } dragging = false; downAt = null; if (e.pointerType !== 'mouse') setHover(null); } };
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
canvas.addEventListener('pointerleave', () => { lastMove = null; if (!ptrs.size) setHover(null); });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { e.preventDefault(); cam.distT = clamp(cam.distT * Math.exp(e.deltaY * .0011), 9, 34); }, { passive: false });
const keys = {};
addEventListener('keydown', e => {
  if (e.repeat && !'wasdqe'.includes(e.key.toLowerCase()) && !e.key.startsWith('Arrow')) return; keys[e.key.toLowerCase()] = 1;
  if (!started) return; const m = $('#modal');
  if (e.key === 'Escape') { if (!m.classList.contains('hidden')) m.classList.add('hidden'); else if (tool) setTool(null); else select(null); return; }
  if (!m.classList.contains('hidden')) return;
  if (/^[0-9]$/.test(e.key)) { const list = BAR.filter(t => G.unlocked.includes(t)), i = e.key === '0' ? 9 : +e.key - 1; if (list[i]) { audio.init(); setTool(tool === list[i] ? null : list[i]); } }
  else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); endDay(); }
  else if (e.key.toLowerCase() === 'm') audio.toggle(); else if (e.key.toLowerCase() === 'h') help();
});
addEventListener('keyup', e => keys[e.key.toLowerCase()] = 0);
addEventListener('blur', () => { for (const k in keys) keys[k] = 0; });
const _t = new T.Vector3();
function updateCamera(dt) {
  if (!started) cam.yawT += dt * .035;
  const rot = (keys.q ? 1 : 0) - (keys.e ? 1 : 0); cam.yawT += rot * dt * 1.4;
  const fx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0), fz = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
  if (fx || fz) { const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw), v = dt * 7; cam.txT = clamp(cam.txT + (fx * c + fz * s) * v, -6, 6); cam.tzT = clamp(cam.tzT + (-fx * s + fz * c) * v, -6, 6); }
  const l = REDUCED ? 30 : started ? 6 : 1.2;
  cam.yaw = damp(cam.yaw, cam.yawT, l, dt); cam.pitch = damp(cam.pitch, cam.pitchT, l, dt); cam.dist = damp(cam.dist, cam.distT, started ? 5 : 1.1, dt); cam.tx = damp(cam.tx, cam.txT, 6, dt); cam.tz = damp(cam.tz, cam.tzT, 6, dt);
  camKick = damp(camKick, 0, 6, dt); const d = cam.dist - camKick, cp = Math.cos(cam.pitch);
  // en pantallas anchas el título ocupa la izquierda: desplaza el encuadre
  const shift = !started && innerWidth > 900 ? -4.2 : 0; cam.sh = damp(cam.sh || shift, shift, 1.5, dt);
  _t.set(cam.tx + Math.cos(cam.yaw) * cam.sh, .35, cam.tz - Math.sin(cam.yaw) * cam.sh);
  camera.position.set(_t.x + Math.sin(cam.yaw) * cp * d, _t.y + Math.sin(cam.pitch) * d, _t.z + Math.cos(cam.yaw) * cp * d); camera.lookAt(_t);
  sun.target.position.set(0, 0, 0);
}

/* ------------------------------------------------------------- ayuda */
function help() {
  modal(`<div class="eyebrow">Cómo se juega</div><h2>Cuida el fuego, lee el terreno</h2>
  <p>El tiempo no corre: coloca lo que quieras y pulsa <b>Dejar caer la tarde</b> cuando te apetezca. Al anochecer cada edificio rinde según lo que tenga <b>al lado</b>, los vecinos cenan y el hogar quema su leña.</p>
  <dl>
   <dt>${ic('sprout')}Vecindad</dt><dd>Huertos junto a charcas y colmenas, leñadores junto a bosques, canteras junto a roca. Al elegir una herramienta, cada casilla te enseña cuánto rendiría.</dd>
   <dt>${ic('pop')}Manos</dt><dd>Huertos, leñadores, canteras e invernaderos piden un vecino cada uno. Más cabañas, más manos… y más bocas.</dd>
   <dt>${ic('flame')}Calor</dt><dd>En invierno, las cabañas fuera del resplandor del hogar o de un brasero hibernan. El fuego pide leña en otoño e invierno.</dd>
   <dt>${ic('snow')}Estaciones</dt><dd>Seis días cada una. El pronóstico de arriba a la izquierda te avisa de lluvia, niebla y nevadas.</dd>
   <dt>${ic('zzz')}Sin castigo</dt><dd>Si falta comida o leña nadie se pierde: descansan y al día siguiente se vuelve a intentar.</dd>
  </dl>
  <p><kbd>arrastrar</kbd> girar · <kbd>rueda</kbd> acercar · <kbd>clic derecho</kbd> desplazar o cancelar · <kbd>1</kbd>–<kbd>0</kbd> herramientas · <kbd>Espacio</kbd> terminar el día · <kbd>Q</kbd> <kbd>E</kbd> girar · <kbd>WASD</kbd> mover</p>
  <div class="btns"><button class="btn pri" data-x>Entendido</button></div>`);
}

/* --------------------------------------------------------- arranque */
function start(sv) {
  audio.init(); if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
  if (sv !== 'keep') newGame(sv);
  started = true; $('#title').classList.add('hidden'); $('#hud').classList.remove('hidden');
  cam.yawT = Math.round(cam.yaw / TAU) * TAU + .62; cam.distT = innerWidth < 900 ? 30 : 25; cam.pitchT = .66;
  if (!sv || sv === 'keep') { if (G.day === 0) { setTimeout(() => seasonCard(0), 600); setTimeout(() => toast('sprout', 'Empieza por el <b>Huerto</b>: pásalo sobre el mapa y busca la casilla que más rinda junto al agua.'), 2600); } }
  sfx.dawn();
}
function initUI() {
  $('#b-snd').innerHTML = ic('sound'); $('#b-help').innerHTML = ic('help'); $('#b-menu').innerHTML = ic('seed');
  $('#b-snd').onclick = () => { audio.init(); audio.toggle(); }; $('#b-help').onclick = help;
  $('#b-menu').onclick = () => { const m = modal(`<div class="eyebrow">Otro valle</div><h2>¿Empezar de nuevo en una isla distinta?</h2><p>El valle actual se perderá. El nuevo tendrá otro relieve, otra charca y otros bosques.</p><div class="btns"><button class="btn sec" data-x>Me quedo aquí</button><button class="btn pri" id="m-new">Nuevo valle</button></div>`); m.querySelector('#m-new').onclick = () => { m.classList.add('hidden'); localStorage.removeItem(SAVE); newGame(null); cam.yaw -= 1.2; cam.dist = 34; seasonCard(0); sfx.dawn(); }; };
  $('#endday').innerHTML = `${ic('moon')}<span>Dejar caer la tarde<small>Espacio · sin prisa</small></span>`; $('#endday').onclick = () => { audio.init(); endDay(); };
  const sv = loadSave(), tb = $('#title-btns');
  tb.innerHTML = sv ? `<button class="btn pri" id="t-cont">Volver al valle</button><button class="btn sec" id="t-new">Nuevo valle</button>` : `<button class="btn pri" id="t-new">Encender el hogar</button>`;
  $('#t-new').onclick = () => { localStorage.removeItem(SAVE); start(sv ? null : 'keep'); }; if (sv) $('#t-cont').onclick = () => start('keep');
  const st = document.createElement('style'); st.textContent = '.bdg{position:absolute;left:0;top:0;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;background:var(--panel-strong);border:1px solid var(--hairline-strong);display:grid;place-items:center;font-size:.72rem;color:var(--bad)}'; document.head.appendChild(st);
  newGame(sv);
}

/* ------------------------------------------------------------- bucle */
const _p = new T.Vector3(); let last = performance.now(), time = 0, slow = 0, fadeIn = 0;
function place(el, pos, yOff = 0) { _p.copy(pos).project(camera); const x = (_p.x * .5 + .5) * innerWidth, y = (-_p.y * .5 + .5) * innerHeight; el.style.transform = `translate(${x.toFixed(1)}px,${(y + yOff).toFixed(1)}px) translate(-50%,-50%)`; el.style.display = _p.z > 1 ? 'none' : ''; }
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000; last = now; const dt = Math.min(.05, raw); time += dt; U.uTime.value = time;
  // calidad adaptativa: si el equipo no llega, baja resolución interna
  if (raw > .04 && time > 3) { if ((slow += raw) > 2.5 && quality > .55) { quality = Math.max(.55, quality - .2); slow = 0; resize(); } } else slow = Math.max(0, slow - dt * .5);
  for (let i = tweens.length - 1; i >= 0; i--) { const w = tweens[i]; w.t += dt; const k = Math.min(1, w.t / w.dur); w.fn(w.e(k)); if (k >= 1) { tweens.splice(i, 1); w.res(); } }
  if (lastMove) { setHover(pickAt(lastMove.x, lastMove.y)); lastMove = null; }
  updateCamera(dt); updateSky(dt, time);
  for (const t of tiles) {
    const a = (t.lift - t.y) * 160 - t.vy * 15; t.vy += a * dt; t.y += t.vy * dt; t.group.position.y = t.y;
    const m = t.ov.material; m.opacity = damp(m.opacity, t.ovA * (1 + .12 * Math.sin(time * 3)), 12, dt); if (t.ovA > 0) m.color.lerp(t.ovC, .3); t.ov.visible = m.opacity > .012;
    if (t.wig > 0) { t.wig = Math.max(0, t.wig - dt * 1.6); const w = Math.sin(t.wig * 22) * t.wig * .07; t.deco.rotation.z = w; t.deco.rotation.x = w * .6; }
  }
  if (ghost && ghost.parent) ghost.scale.setScalar(1 + Math.sin(time * 4) * .025);
  updateVillagers(dt, time); updateAmbient(dt, time); audio.update(dt);
  fadeIn = Math.min(1, fadeIn + dt * .6); mFinal.uniforms.uFade.value = ease.out(fadeIn);
  mFinal.uniforms.uTilt.value = lerp(.95, .55, sstep(12, 30, cam.dist));
  renderFrame();
  // etiquetas ancladas al mundo
  for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; if (now - f.born > 1900) { f.el.remove(); floats.splice(i, 1); continue; } place(f.el, tilePos(f.t, f.up)); }
  if (hover && !hov.classList.contains('hidden')) place(hov, tilePos(hover, +hov.dataset.up || .5), -22);
  for (const [b, el] of badges) place(el, tilePos(b.tile, b.model.userData.h + .22));
}
addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => { last = performance.now(); if (audio.ctx) document.hidden ? audio.ctx.suspend() : audio.ctx.resume(); });
resize(); buildBackdrop(); initUI();
window.rescoldo = { get G() { return G; }, get E() { return E; }, tiles, endDay, build, canPlace, setTool, cam, set tod(v) { todLock = v; }, toast, seasonCard, get busy() { return busy; } };
requestAnimationFrame(frame);
