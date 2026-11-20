import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

const root = process.cwd();
const publicDir = resolve(root, 'public');
const generatedDir = resolve(root, 'src/generated');
const imagePattern = /\.(avif|gif|jpe?g|png|webp)$/i;

function discover(folder) {
  const absoluteFolder = resolve(publicDir, folder);
  return readdirSync(absoluteFolder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && imagePattern.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map((filename) => '/' + relative(publicDir, resolve(absoluteFolder, filename)).split(sep).join('/'));
}

const menuBackgrounds = discover('fondos-menu');
const gameBackgrounds = discover('fondos-juego-tablero');
if (menuBackgrounds.length === 0) throw new Error('No se encontraron imágenes en public/fondos-menu');
if (gameBackgrounds.length === 0) throw new Error('No se encontraron imágenes en public/fondos-juego-tablero');
mkdirSync(generatedDir, { recursive: true });
const output = '// Archivo generado automáticamente por scripts/generate-backgrounds.mjs.\n// No editar manualmente: se reconstruye antes de iniciar Vite o compilar.\n\n' +
  'export const menuBackgrounds = ' + JSON.stringify(menuBackgrounds, null, 2) + ' as const;\n\n' +
  'export const gameBackgrounds = ' + JSON.stringify(gameBackgrounds, null, 2) + ' as const;\n';
writeFileSync(resolve(generatedDir, 'backgrounds.ts'), output, 'utf8');
console.log('Fondos detectados: menú ' + menuBackgrounds.length + ', tablero ' + gameBackgrounds.length);
