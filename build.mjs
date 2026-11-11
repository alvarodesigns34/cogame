// Une src/shell.html + three.min.js + src/*.js en un único index.html autocontenido.
// Uso: node build.mjs [ruta/a/three.min.js]
import { readFileSync, writeFileSync } from 'node:fs';

const threePath = process.argv[2] || 'node_modules/three/build/three.min.js';
const three = readFileSync(threePath, 'utf8');
const game = ['src/game1.js', 'src/game2.js', 'src/game2b.js', 'src/game3.js'].map(f => readFileSync(f, 'utf8')).join('\n');
for (const [name, src] of [['three', three], ['game', game]])
  if (/<\/script/i.test(src)) throw new Error(`${name} contiene </script`);

const html = readFileSync('src/shell.html', 'utf8')
  .replace('/*__THREE__*/', () => three)
  .replace('/*__GAME__*/', () => `(()=>{\n'use strict';\n${game}\n})();`);
writeFileSync('index.html', html);
console.log(`index.html: ${(html.length / 1024).toFixed(0)} KB`);
