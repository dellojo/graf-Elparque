// main4.js — El Parque: Las 10 Notas (VR, Meta Quest 3)
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

/** ========= NOTAS (EDÍTALAS AQUÍ) =========
 *  Cada nota admite:
 *    texto : lo que dice (usa \n para saltos de línea)
 *    dibujo: 'slender' | 'arboles' | 'ojo' | 'ojos' | 'x' | 'garabatos' | 'cara' | 'ninguno'
 *    rojo  : true  -> la nota se escribe en rojo (opcional)
 *    tamano: tamaño de letra inicial (opcional; se reduce solo si no cabe)
 *    imagen: ruta a tu propio dibujo, ej. 'assets/notes/nota3.png' (opcional;
 *            reemplaza el diseño de esa nota. Mejor en proporción vertical 512x700)
 *  Si agregas o quitas notas de esta lista, el juego se ajusta solo. */
const NOTES = [
  { texto: 'NO MIRES\nO TE LLEVA', dibujo: 'arboles' },
  { texto: 'DÉJAME\nEN PAZ', dibujo: 'garabatos' },
  { texto: 'NO NO NO\nNO NO NO\nNO NO NO', dibujo: 'ninguno' },
  { texto: 'SIEMPRE\nTE VE', dibujo: 'ojo' },
  { texto: 'NO PUEDES\nCORRER', dibujo: 'x' },
  { texto: 'AYUDA\nME', dibujo: 'cara' },
  { texto: 'ME SIGUE', dibujo: 'slender' },
  { texto: 'ESTÁN EN\nLOS ÁRBOLES', dibujo: 'ojos' },
  { texto: 'YA ESTÁ\nAQUÍ', dibujo: 'garabatos', rojo: true },
  { texto: 'VOLTEA\nDESPACIO', dibujo: 'slender', rojo: true }
];

/** ========= CONFIG ========= */
const WORLD_SIZE = 260;
const TERRAIN_RES = 160;
const TERRAIN_MAX_H = 1.8;
const TREE_COUNT = 150;
const ROCK_COUNT = 14;
const PLAYER_RADIUS = 0.35;
const FOG_DENSITY = 0.032;       // más alto = más niebla
const FLASH_INTENSITY = 60;      // brillo de la linterna
const WALK_SPEED = 3.2;
const RUN_SPEED = 6;
const VR_WALK_SPEED = 3.5;
const VR_STRAFE_SPEED = 3.0;
const ARC_STEPS = 50;
const ARC_SPEED = 7.5;
const ARC_GRAVITY = 9.8;
const MAX_SLOPE_DEG = 45;
const WORLD_RADIUS = WORLD_SIZE * 0.5 - 1.0; // límite invisible del bosque
const GROUND_URL = 'assets/textures/pasto.jpg';
const NIGHT = 0x04070d;

const PICKUP_DIST = 2.0;   // distancia para recoger una nota
const READ_TIME = 9;       // segundos que se muestra una nota
const SCARE_DELAY = 6;     // segundos entre la última nota y el susto
const SCARE_TOTAL = 3.2;   // duración del susto

// --- Monstruo perseguidor y linterna ---
const MONSTER_TRIGGER = 5;        // notas necesarias para que aparezca
const MONSTER_SPEED = 3.0;        // velocidad base (en PC corres a 6)
const MONSTER_SPAWN_DIST = 28;    // a qué distancia aparece
const MONSTER_CATCH_DIST = 1.1;   // distancia a la que te atrapa
const MONSTER_PUSHBACK = 14;      // a qué distancia lo manda el flash
const FLASH_CONE = 0.5;           // ángulo del flash (rad)
const FLASH_RANGE = 30;           // alcance del flash
const STUN_TIME = 6;              // segundos que el monstruo se queda quieto
const BATTERY_DEAD_TIME = 8;      // segundos sin linterna tras flashear
const BURST_TIME = 0.3;           // duración del destello
const BURST_MULT = 5;             // fuerza del destello

/** ========= DOM ========= */
const hudHit = document.getElementById('hitNotes');
const hudTotal = document.getElementById('totalNotes');
const msgEl = document.getElementById('msg');
const flashEl = document.getElementById('flash');
const coverEl = document.getElementById('cover');
const startBtn = document.getElementById('startBtn');
const ambientEl = document.getElementById('ambient');
const canvas = document.getElementById('scene');
const battFill = document.getElementById('battFill');
const gearBtn = document.getElementById('gearBtn');
const settingsEl = document.getElementById('settings');

/** ========= RENDERER / ESCENA / CÁMARA ========= */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(NIGHT);
scene.fog = new THREE.FogExp2(NIGHT, FOG_DENSITY); // niebla del bosque

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 500);
const player = new THREE.Group();
player.add(camera);
scene.add(player);

/** ========= LUCES ========= */
scene.add(new THREE.HemisphereLight(0x5f7fb5, 0x080a0f, 2.0));

const moonLight = new THREE.DirectionalLight(0x9bb8ff, 1.6);
scene.add(moonLight, moonLight.target);

// Linterna (va en la cabeza del jugador)
const flashlight = new THREE.SpotLight(0xfff1d0, FLASH_INTENSITY, 55, Math.PI / 7, 0.6, 1);
camera.add(flashlight);
flashlight.target.position.set(0, 0, -5);
camera.add(flashlight.target);

// Luz roja del monstruo (siempre existe, para no recompilar shaders en el susto)
const monsterLight = new THREE.PointLight(0xff1010, 0, 10, 2);
scene.add(monsterLight);

/** ========= CIELO NOCTURNO: ESTRELLAS Y LUNA ========= */
const starCount = 2500;
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  const r = 380;
  const a = Math.random() * Math.PI * 2;
  const cosB = Math.random() * 1.05 - 0.05; // casi solo hemisferio superior
  const sinB = Math.sqrt(1 - cosB * cosB);
  starPos[i * 3] = r * sinB * Math.cos(a);
  starPos[i * 3 + 1] = r * cosB;
  starPos[i * 3 + 2] = r * sinB * Math.sin(a);
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starField = new THREE.Points(starGeo, new THREE.PointsMaterial({
  size: 2, sizeAttenuation: false, color: 0xffffff, fog: false, transparent: true, opacity: 0.9
}));
starField.frustumCulled = false;
scene.add(starField);

const moon = new THREE.Mesh(
  new THREE.SphereGeometry(9, 32, 24),
  new THREE.MeshBasicMaterial({ color: 0xe8f0ff, fog: false })
);
moon.frustumCulled = false;
scene.add(moon);

// Halo de la luna
const glowCanvas = document.createElement('canvas');
glowCanvas.width = glowCanvas.height = 128;
{
  const g = glowCanvas.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(200,220,255,0.9)');
  grad.addColorStop(0.3, 'rgba(150,180,255,0.35)');
  grad.addColorStop(1, 'rgba(100,130,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
}
const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: new THREE.CanvasTexture(glowCanvas),
  blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false
}));
moonGlow.scale.set(80, 80, 1);
scene.add(moonGlow);

/** ========= TERRENO ========= */
function makePerlin(seed = 1337) {
  const p = new Uint8Array(512);
  for (let i = 0; i < 256; i++) p[i] = i;
  let n, q;
  for (let i = 255; i > 0; i--) {
    n = Math.floor((seed = (seed * 16807) % 2147483647) / 2147483647 * (i + 1));
    q = p[i]; p[i] = p[n]; p[n] = q;
  }
  for (let i = 0; i < 256; i++) p[256 + i] = p[i];
  const grad = (h, x, y) => { switch (h & 3) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; default: return -x - y; } };
  const fade = (t) => t * t * t * (t * (t * 6. - 15.) + 10.);
  const lerp = (a, b, t) => a + t * (b - a);
  return function noise(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255; x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y), A = p[X] + Y, B = p[X + 1] + Y;
    return lerp(lerp(grad(p[A], x, y), grad(p[B], x - 1., y), u),
                lerp(grad(p[A + 1], x, y - 1.), grad(p[B + 1], x - 1., y - 1.), u), v);
  };
}
const noise2D = makePerlin(2025);

function heightAt(x, z) {
  const h = noise2D(x * 0.02, z * 0.02) * 0.6 + noise2D(x * 0.05, z * 0.05) * 0.25 + noise2D(x * 0.1, z * 0.1) * 0.1;
  return h * TERRAIN_MAX_H;
}
function terrainNormal(x, z) {
  const e = 0.5;
  return new THREE.Vector3(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
}

const terrainGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, TERRAIN_RES, TERRAIN_RES);
terrainGeo.rotateX(-Math.PI / 2);
const tPos = terrainGeo.attributes.position;
for (let i = 0; i < tPos.count; i++) tPos.setY(i, heightAt(tPos.getX(i), tPos.getZ(i)));
tPos.needsUpdate = true;
terrainGeo.computeVertexNormals();

// Piso con textura de pasto (oscurecido para la noche)
const groundTex = new THREE.TextureLoader().load(GROUND_URL);
groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
groundTex.repeat.set(40, 40);
groundTex.colorSpace = THREE.SRGBColorSpace;
groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy?.() || 8;

const terrain = new THREE.Mesh(
  terrainGeo,
  new THREE.MeshStandardMaterial({ map: groundTex, color: 0x66756a, roughness: 1, metalness: 0 })
);
scene.add(terrain);

/** ========= UTILIDADES ========= */
let state = 'playing'; // playing | waiting | scare | ended
const eyeOffset = () => (renderer.xr.isPresenting ? 0 : 1.6);

function clampToWorld(v) {
  const r = Math.hypot(v.x, v.z);
  const max = WORLD_RADIUS - PLAYER_RADIUS;
  if (r > max) {
    const ang = Math.atan2(v.z, v.x);
    v.x = Math.cos(ang) * max;
    v.z = Math.sin(ang) * max;
  }
  return v;
}

const START_POS = new THREE.Vector3(0, 0, 3);
player.position.set(START_POS.x, heightAt(START_POS.x, START_POS.z) + 1.6, START_POS.z);

/** ========= COLOCACIÓN DE OBJETOS (sin encimarse) ========= */
const placed = [{ x: 0, z: 3, r: 4 }]; // zona libre donde aparece el jugador
const colliders = [];

function randomSpot(minR, maxR, r) {
  for (let k = 0; k < 40; k++) {
    const a = Math.random() * Math.PI * 2;
    const d = minR + Math.random() * (maxR - minR);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (placed.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + r + 1.0)) {
      placed.push({ x, z, r });
      return { x, z };
    }
  }
  return null;
}

/** ========= ÁRBOLES GRANDES (instanciados, ligeros para VR) ========= */
const treeData = [];
for (let i = 0; i < TREE_COUNT; i++) {
  const s = 2.2 + Math.random() * 2.3; // árboles enormes
  const spot = randomSpot(4, 125, 1.0 * s);
  if (!spot) continue;
  treeData.push({ x: spot.x, z: spot.z, s, y: heightAt(spot.x, spot.z), rot: Math.random() * 6.28 });
  colliders.push({ x: spot.x, z: spot.z, r: 0.36 * s });
}

const trunkGeo = new THREE.CylinderGeometry(0.16, 0.28, 3, 12);
trunkGeo.translate(0, 1.5, 0);
const crownDefs = [
  { r: 1.9, h: 2.6, y: 2.6 },
  { r: 1.5, h: 2.4, y: 3.8 },
  { r: 1.1, h: 2.2, y: 5.0 }
];
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2a1f16, roughness: 1 });
const crownMat = new THREE.MeshStandardMaterial({ color: 0x0b2414, roughness: 1 });

const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeData.length);
const crowns = crownDefs.map((d) => {
  const g = new THREE.ConeGeometry(d.r, d.h, 10);
  g.translate(0, d.y, 0);
  return new THREE.InstancedMesh(g, crownMat, treeData.length);
});
const dummy = new THREE.Object3D();
treeData.forEach((t, i) => {
  dummy.position.set(t.x, t.y, t.z);
  dummy.rotation.set(0, t.rot, 0);
  dummy.scale.setScalar(t.s);
  dummy.updateMatrix();
  trunks.setMatrixAt(i, dummy.matrix);
  crowns.forEach((c) => c.setMatrixAt(i, dummy.matrix));
});
for (const m of [trunks, ...crowns]) {
  m.instanceMatrix.needsUpdate = true;
  m.frustumCulled = false;
  scene.add(m);
}

/** ========= ROCAS ========= */
const rockGeo = new THREE.IcosahedronGeometry(1, 1);
const rockMat = new THREE.MeshStandardMaterial({ color: 0x6d6d70, roughness: 0.95, flatShading: true });
for (let i = 0; i < ROCK_COUNT; i++) {
  const r = 0.6 + Math.random() * 0.9;
  const s = randomSpot(6, 120, r);
  if (!s) continue;
  const rock = new THREE.Mesh(rockGeo, rockMat);
  rock.scale.set(r, r * 0.7, r);
  rock.position.set(s.x, heightAt(s.x, s.z) + r * 0.35, s.z);
  rock.rotation.y = Math.random() * 6.28;
  scene.add(rock);
  colliders.push({ x: s.x, z: s.z, r: r * 0.9 });
}

/** ========= DIBUJO DE LAS NOTAS (estilo cuaderno con garabatos) ========= */
const INK = '#26211c';
const RED = 'rgba(125,16,16,0.9)';
const HAND = '"Segoe Print","Bradley Hand","Marker Felt","Chalkboard SE","Comic Sans MS",cursive';

function rnd(a, b) { return a + Math.random() * (b - a); }

// línea temblorosa, como hecha a mano
function wobble(g, x1, y1, x2, y2, jit = 2) {
  const n = Math.max(2, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 14));
  g.beginPath();
  g.moveTo(x1, y1);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    g.lineTo(x1 + (x2 - x1) * t + rnd(-jit, jit), y1 + (y2 - y1) * t + rnd(-jit, jit));
  }
  g.stroke();
}

// rayones de sombreado dentro de un rectángulo
function hatch(g, x, y, w, h, count) {
  for (let i = 0; i < count; i++) {
    const sx = x + rnd(0, w), sy = y + rnd(0, h);
    wobble(g, sx, sy, Math.min(x + w, sx + rnd(6, 22)), Math.min(y + h, sy + rnd(10, 30)), 1);
  }
}

function drawPine(g, x, baseY, hgt) {
  const wdt = hgt * 0.38;
  wobble(g, x, baseY, x, baseY - hgt * 0.18, 1);
  const levels = 4;
  for (let i = 0; i < levels; i++) {
    const top = baseY - hgt * (0.18 + (i + 1) * 0.82 / levels);
    const bot = baseY - hgt * (0.18 + i * 0.82 / levels * 0.8);
    const ww = wdt * (1 - i * 0.2) * 0.5;
    g.beginPath();
    g.moveTo(x, top);
    g.lineTo(x - ww, bot);
    g.lineTo(x + ww, bot);
    g.closePath();
    g.stroke();
  }
  hatch(g, x - wdt * 0.4, baseY - hgt * 0.9, wdt * 0.8, hgt * 0.7, 18);
}

function drawSlender(g, x, y, w, h) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  g.lineWidth = 3.5;
  drawPine(g, x + w * 0.14, y + h, h * 0.7);
  drawPine(g, x + w * 0.86, y + h, h * 0.6);

  const cx = x + w * 0.5;
  g.strokeStyle = INK;
  g.lineWidth = 5;

  // cabeza sin cara
  const headR = h * 0.055;
  const headY = y + headR + 2;
  g.beginPath();
  g.ellipse(cx, headY, headR * 0.9, headR * 1.1, 0, 0, Math.PI * 2);
  g.stroke();

  // cuello y torso (traje)
  wobble(g, cx, headY + headR * 1.1, cx, y + h * 0.16, 1);
  const tx = cx - w * 0.05, ty = y + h * 0.16, tw = w * 0.10, th = h * 0.42;
  g.beginPath();
  g.rect(tx, ty, tw, th);
  g.stroke();
  g.lineWidth = 3;
  hatch(g, tx, ty, tw, th, 40);

  // corbata roja
  g.strokeStyle = RED;
  g.lineWidth = 5;
  wobble(g, cx, ty, cx, ty + th * 0.55, 1);

  // brazos larguísimos
  g.strokeStyle = INK;
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(tx, ty + 8);
  g.quadraticCurveTo(tx - w * 0.13, ty + th * 0.8, tx - w * 0.06, y + h * 0.93);
  g.stroke();
  g.beginPath();
  g.moveTo(tx + tw, ty + 8);
  g.quadraticCurveTo(tx + tw + w * 0.13, ty + th * 0.8, tx + tw + w * 0.06, y + h * 0.93);
  g.stroke();

  // piernas
  wobble(g, cx - tw * 0.25, ty + th, cx - tw * 0.3, y + h, 1);
  wobble(g, cx + tw * 0.25, ty + th, cx + tw * 0.3, y + h, 1);
}

function drawArboles(g, x, y, w, h) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  g.lineWidth = 3.5;
  const n = 5;
  for (let i = 0; i < n; i++) {
    const px = x + w * (0.1 + 0.8 * i / (n - 1)) + rnd(-8, 8);
    drawPine(g, px, y + h - rnd(0, 20), h * rnd(0.55, 0.95));
  }
}

function drawOjo(g, x, y, w, h) {
  g.lineCap = 'round';
  const cx = x + w / 2, cy = y + h / 2;
  const ew = w * 0.42, eh = h * 0.28;

  g.strokeStyle = INK;
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(cx - ew, cy);
  g.quadraticCurveTo(cx, cy - eh * 1.7, cx + ew, cy);
  g.quadraticCurveTo(cx, cy + eh * 1.7, cx - ew, cy);
  g.stroke();

  g.beginPath();
  g.arc(cx, cy, eh * 0.7, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = INK;
  g.beginPath();
  g.arc(cx, cy, eh * 0.32, 0, Math.PI * 2);
  g.fill();

  // pestañas
  g.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    const t = -0.85 + 1.7 * i / 8;
    const x0 = cx + t * ew;
    const y0 = cy - eh * 0.85 * (1 - t * t);
    wobble(g, x0, y0, x0 + t * 14, y0 - 20, 1);
  }

  // venas rojas
  g.strokeStyle = RED;
  g.lineWidth = 2.5;
  for (let i = 0; i < 8; i++) {
    const a = rnd(0, Math.PI * 2);
    const r0 = eh * 0.7, r1 = eh * rnd(1.0, 1.4);
    wobble(g, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.8, cx + Math.cos(a) * r1 * 1.8, cy + Math.sin(a) * r1 * 0.9, 2);
  }
}

function drawOjos(g, x, y, w, h) {
  g.fillStyle = 'rgba(18,14,10,0.92)';
  g.fillRect(x, y, w, h);
  for (let i = 0; i < 7; i++) {
    const ex = x + w * rnd(0.12, 0.88), ey = y + h * rnd(0.12, 0.88), s = rnd(7, 14);
    [-1, 1].forEach((d) => {
      g.fillStyle = '#e9e2cf';
      g.beginPath();
      g.ellipse(ex + d * s * 1.4, ey, s, s * 0.6, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#7a0f0f';
      g.beginPath();
      g.arc(ex + d * s * 1.4, ey, s * 0.3, 0, Math.PI * 2);
      g.fill();
    });
  }
}

function drawX(g, x, y, w, h) {
  g.lineCap = 'round';
  g.strokeStyle = RED;
  g.lineWidth = 9;
  const m = Math.min(w, h) * 0.5;
  const cx = x + w / 2, cy = y + h / 2;
  for (let k = 0; k < 3; k++) {
    wobble(g, cx - m + rnd(-6, 6), cy - m + rnd(-6, 6), cx + m + rnd(-6, 6), cy + m + rnd(-6, 6), 3);
    wobble(g, cx + m + rnd(-6, 6), cy - m + rnd(-6, 6), cx - m + rnd(-6, 6), cy + m + rnd(-6, 6), 3);
  }
}

function drawGarabatos(g, x, y, w, h) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  g.lineWidth = 3.5;
  let px = x + w * rnd(0.2, 0.8), py = y + h * rnd(0.2, 0.8);
  g.beginPath();
  g.moveTo(px, py);
  for (let i = 0; i < 90; i++) {
    px = THREE.MathUtils.clamp(px + rnd(-70, 70), x, x + w);
    py = THREE.MathUtils.clamp(py + rnd(-50, 50), y, y + h);
    g.lineTo(px, py);
  }
  g.stroke();
}

function drawCara(g, x, y, w, h) {
  g.lineCap = 'round';
  const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.38;
  g.strokeStyle = INK;
  g.lineWidth = 5;
  g.beginPath();
  g.ellipse(cx, cy, r * 0.85, r, 0, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = INK;
  [-1, 1].forEach((s) => {
    g.beginPath();
    g.ellipse(cx + s * r * 0.38, cy - r * 0.2, r * 0.2, r * 0.28, 0, 0, Math.PI * 2);
    g.fill();
  });
  g.beginPath();
  g.ellipse(cx, cy + r * 0.5, r * 0.2, r * 0.32, 0, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 3;
  hatch(g, cx - r * 0.8, cy - r, r * 1.6, r * 2, 25);
}

const DRAW = {
  slender: drawSlender,
  arboles: drawArboles,
  ojo: drawOjo,
  ojos: drawOjos,
  x: drawX,
  garabatos: drawGarabatos,
  cara: drawCara
};

// texto "escrito a mano": cada letra con un pequeño giro y desnivel
function scrawl(g, text, cx, y, size, color) {
  g.font = `bold ${size}px ${HAND}`;
  g.fillStyle = color;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  const chars = [...text];
  const widths = chars.map((c) => g.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0);
  let x = cx - total / 2;
  chars.forEach((c, i) => {
    g.save();
    g.translate(x + widths[i] / 2, y + rnd(-size * 0.06, size * 0.06));
    g.rotate(rnd(-0.09, 0.09));
    g.fillText(c, -widths[i] / 2, 0);
    g.restore();
    x += widths[i];
  });
}

function makeNoteTexture(def, pie) {
  const w = 512, h = 700;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');

  // papel envejecido
  g.fillStyle = '#d9cfae';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 45; i++) {
    g.fillStyle = `rgba(110,80,35,${Math.random() * 0.1})`;
    g.beginPath();
    g.arc(Math.random() * w, Math.random() * h, 10 + Math.random() * 55, 0, Math.PI * 2);
    g.fill();
  }

  // renglones de cuaderno y margen rojo
  g.strokeStyle = 'rgba(70,95,140,0.35)';
  g.lineWidth = 2;
  for (let ly = 70; ly < h; ly += 34) {
    g.beginPath();
    g.moveTo(0, ly);
    g.lineTo(w, ly);
    g.stroke();
  }
  g.strokeStyle = 'rgba(150,40,40,0.45)';
  g.beginPath();
  g.moveTo(64, 0);
  g.lineTo(64, h);
  g.stroke();

  // bordes oscurecidos
  const vg = g.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(40,20,5,0.45)');
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);

  // texto
  const color = def.rojo ? RED : INK;
  const dibujoFn = def.dibujo && def.dibujo !== 'ninguno' ? DRAW[def.dibujo] : null;
  const lines = String(def.texto || '').split('\n');
  const textTop = 50;
  const textH = dibujoFn ? 270 : 560;
  const maxW = w - 100;

  let size = def.tamano || 78;
  const fits = (s) => {
    g.font = `bold ${s}px ${HAND}`;
    return lines.every((l) => g.measureText(l).width <= maxW) && lines.length * s * 1.1 <= textH;
  };
  while (size > 22 && !fits(size)) size -= 2;

  const blockH = lines.length * size * 1.1;
  let ty = textTop + (textH - blockH) / 2 + size * 0.9;
  lines.forEach((l) => {
    scrawl(g, l, w / 2 + 10, ty, size, color);
    ty += size * 1.1;
  });

  // dibujo
  if (dibujoFn) dibujoFn(g, 60, 340, w - 120, 300);

  // número de nota
  g.font = '22px "Courier New", monospace';
  g.fillStyle = 'rgba(60,30,20,0.7)';
  g.textAlign = 'center';
  g.fillText(pie, w / 2, h - 18);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** ========= NOTAS: COLOCACIÓN EN LOS ÁRBOLES ========= */
function pickNoteTrees(n) {
  const cands = treeData
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => {
      const d = Math.hypot(t.x, t.z - 3);
      return d > 14 && d < 115;
    })
    .sort(() => Math.random() - 0.5);

  let minSep = 32;
  const chosen = [];
  while (chosen.length < n && minSep >= 0) {
    for (const c of cands) {
      if (chosen.length >= n) break;
      if (chosen.includes(c)) continue;
      if (chosen.every((o) => Math.hypot(o.t.x - c.t.x, o.t.z - c.t.z) >= minSep)) chosen.push(c);
    }
    minSep -= 8;
  }
  return chosen;
}

const notes = [];
pickNoteTrees(NOTES.length).forEach((c, i) => {
  const t = c.t;
  const def = NOTES[i];

  // posición sobre el tronco, mirando hacia afuera
  const a = Math.random() * Math.PI * 2;
  const dx = Math.sin(a), dz = Math.cos(a);
  const yLoc = 1.5 / t.s;
  const rLoc = 0.28 + (0.16 - 0.28) * (yLoc / 3);
  const rW = rLoc * t.s + 0.02;

  const px = t.x + dx * rW;
  const pz = t.z + dz * rW;
  const py = t.y + 1.5;

  const tex = makeNoteTexture(def, `${i + 1} / ${NOTES.length}`);
  const mat = new THREE.MeshStandardMaterial({
    map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.28,
    roughness: 1, side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.68), mat);
  mesh.position.set(px, py, pz);
  mesh.rotation.y = Math.atan2(dx, dz);
  mesh.rotateZ((Math.random() - 0.5) * 0.25);
  scene.add(mesh);

  const note = { mesh, mat, tex, x: px, z: pz, y: py, collected: false };
  notes.push(note);

  // Dibujo propio (opcional): reemplaza el diseño de esta nota
  if (def.imagen) {
    new THREE.TextureLoader().load(
      def.imagen,
      (t2) => {
        t2.colorSpace = THREE.SRGBColorSpace;
        note.tex = t2;
        mat.map = t2;
        mat.emissiveMap = t2;
        mat.needsUpdate = true;
      },
      undefined,
      () => console.warn('No se encontró la imagen de la nota: ' + def.imagen)
    );
  }
});
if (hudTotal) hudTotal.textContent = String(notes.length);

/** ========= CARTEL FLOTANTE (lee las notas dentro de VR) ========= */
const panelMat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false });
const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 1.06), panelMat);
panel.position.set(0, -0.02, -1.15);
panel.renderOrder = 999;
panel.visible = false;
camera.add(panel);

let panelTimer = 0;
let panelPersistent = false;

function showPanel(tex, persistent = false) {
  panelMat.map = tex;
  panelMat.needsUpdate = true;
  panel.visible = true;
  panelPersistent = persistent;
  panelTimer = READ_TIME;
}
function dismissPanel() {
  if (!panelPersistent) panel.visible = false;
}

let msgTimer = null;
function toast(text) {
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.classList.add('show');
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => msgEl.classList.remove('show'), 2200);
}

// Final bueno: juntaste las 10 notas y sale el susto
const endTex = makeNoteTexture(
  { texto: 'LAS ENCONTRASTE\nTODAS...\nÉL TAMBIÉN\nA TI', dibujo: 'slender', rojo: true, tamano: 64 },
  'R / gatillo: reiniciar'
);
// Final malo: el monstruo te atrapó antes de juntar todas
const loseTex = makeNoteTexture(
  { texto: 'TE ENCONTRÓ...', dibujo: 'slender', rojo: true, tamano: 64 },
  'R / gatillo: reiniciar'
);

/** ========= AUDIO ========= */
const listener = new THREE.AudioListener();
camera.add(listener);
const audioLoader = new THREE.AudioLoader();

let chimeBuffer = null;
let windBuffer = null;
let screamBuffer = null;
let windSfx = null;
let audioStarted = false;

// --- Volumen: música/ambiente y efectos (se guardan en el navegador) ---
let musicGain = null;
let volMusic = 1, volFx = 1;
try {
  volMusic = parseFloat(localStorage.getItem('vol_music') ?? '1');
  volFx = parseFloat(localStorage.getItem('vol_fx') ?? '1');
} catch (e) { /* sin localStorage */ }
if (isNaN(volMusic)) volMusic = 1;
if (isNaN(volFx)) volFx = 1;

function applyVolumes() {
  if (musicGain) musicGain.gain.value = 0.35 * volMusic;
  if (windSfx) windSfx.setVolume(0.3 * volMusic);
  document.querySelectorAll('.vol-music').forEach((el) => { el.value = Math.round(volMusic * 100); });
  document.querySelectorAll('.vol-fx').forEach((el) => { el.value = Math.round(volFx * 100); });
}
function playChimeTest() {
  if (!chimeBuffer) return;
  if (listener.context.state === 'suspended') listener.context.resume();
  const s = new THREE.Audio(listener);
  s.setBuffer(chimeBuffer);
  s.setVolume(0.8 * volFx);
  s.play();
}
document.querySelectorAll('.vol-music').forEach((el) => el.addEventListener('input', () => {
  volMusic = el.value / 100;
  try { localStorage.setItem('vol_music', volMusic); } catch (e) { /* nada */ }
  applyVolumes();
}));
document.querySelectorAll('.vol-fx').forEach((el) => {
  el.addEventListener('input', () => {
    volFx = el.value / 100;
    try { localStorage.setItem('vol_fx', volFx); } catch (e) { /* nada */ }
  });
  el.addEventListener('change', playChimeTest); // suena una muestra al soltar
});
applyVolumes();

audioLoader.load('assets/audio/chime.mp3', (b) => { chimeBuffer = b; }, undefined, () => console.warn('Falta assets/audio/chime.mp3'));
audioLoader.load('assets/audio/wind.mp3', (b) => { windBuffer = b; if (audioStarted) startAmbientAudio(); }, undefined, () => console.warn('Falta assets/audio/wind.mp3'));
audioLoader.load('assets/audio/screamer.mp3', (b) => { screamBuffer = b; }, undefined, () => { /* si no existe, se sintetiza el grito */ });

function startAmbientAudio() {
  if (listener.context.state === 'suspended') listener.context.resume();

  if (!audioStarted) {
    audioStarted = true;
    if (ambientEl) {
      try {
        const src = listener.context.createMediaElementSource(ambientEl);
        musicGain = listener.context.createGain();
        src.connect(musicGain);
        musicGain.connect(listener.getInput());
      } catch (e) { /* ya conectado */ }
      ambientEl.loop = true;
      ambientEl.volume = 1;
      applyVolumes();
      ambientEl.play().catch(() => {});
    }
  }

  if (windBuffer && !windSfx) {
    windSfx = new THREE.Audio(listener);
    windSfx.setBuffer(windBuffer);
    windSfx.setLoop(true);
    windSfx.setVolume(0.3 * volMusic);
    windSfx.play();
  }
}

// Grito sintetizado (se usa si no existe assets/audio/screamer.mp3)
function synthScream() {
  const ctx = listener.context;
  if (ctx.state === 'suspended') ctx.resume();
  const now = ctx.currentTime;
  const dur = 1.6;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.7 * volFx), now + 0.03);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) curve[i] = Math.tanh((i / 128 - 1) * 6);
  shaper.curve = curve;

  [[520, 1100], [530, 1300], [260, 640]].forEach(([f0, f1]) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, now);
    o.frequency.exponentialRampToValueAtTime(f1, now + 0.5);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.8, now + dur);
    o.connect(shaper);
    o.start(now);
    o.stop(now + dur);
  });

  const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const d = nb.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const ns = ctx.createBufferSource();
  ns.buffer = nb;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  bp.Q.value = 0.7;
  const ng = ctx.createGain();
  ng.gain.value = 0.6;
  ns.connect(bp); bp.connect(ng); ng.connect(shaper);
  ns.start(now);

  shaper.connect(master);
  master.connect(ctx.destination);
}

function playScream() {
  if (screamBuffer) {
    const s = new THREE.Audio(listener);
    s.setBuffer(screamBuffer);
    s.setLoop(false);
    s.setVolume(1.0 * volFx);
    s.play();
  } else {
    synthScream();
  }
}

/** ========= MONSTRUO ========= */
function buildMonster() {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 });
  const blackBasic = new THREE.MeshBasicMaterial({ color: 0x000000 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.7, 10), black);
  body.position.y = 1.5;
  g.add(body);

  [-0.1, 0.1].forEach((x) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.7, 8), black);
    leg.position.set(x, 0.35, 0);
    g.add(leg);
  });

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xd9d9d2, roughness: 0.8, emissive: 0x333333 })
  );
  head.scale.set(0.85, 1.25, 0.95);
  head.position.y = 2.65;
  g.add(head);

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff1010 });
  [-0.09, 0.09].forEach((x) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), eyeMat);
    eye.position.set(x, 2.72, 0.2);
    g.add(eye);
  });

  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), blackBasic);
  mouth.scale.set(1.2, 2.0, 0.4);
  mouth.position.set(0, 2.5, 0.23);
  g.add(mouth);

  [-1, 1].forEach((side) => {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 1.9, 8), black);
    arm.position.set(side * 0.3, 1.4, 0.15);
    arm.rotation.z = side * 0.12;
    arm.rotation.x = -0.25;
    g.add(arm);
  });

  g.visible = false;
  scene.add(g);
  return g;
}
const monster = buildMonster();

/** ========= COLISIONES ========= */
function resolveCollisions(next) {
  for (const c of colliders) {
    const dx = next.x - c.x, dz = next.z - c.z;
    const dist = Math.hypot(dx, dz);
    const minD = PLAYER_RADIUS + c.r;
    if (dist < minD) {
      const push = (minD - dist) + 1e-3;
      next.x += (dx / (dist || 1)) * push;
      next.z += (dz / (dist || 1)) * push;
    }
  }
  return clampToWorld(next);
}

/** ========= JUEGO: NOTAS, MONSTRUO, SUSTO Y REINICIO ========= */
let hitCount = 0;
const headPos = new THREE.Vector3();
let waitT = 0;
let scareT = 0;

// Estado del monstruo perseguidor y la linterna
let monsterActive = false;
let monsterDist = 99;
let stunT = 0;          // segundos que le quedan aturdido
let flashDeadT = 0;     // segundos que faltan para que vuelva la batería
let flashBurstT = 0;    // duración restante del destello

function checkNotes() {
  for (const n of notes) {
    if (n.collected) continue;
    if (Math.hypot(headPos.x - n.x, headPos.z - n.z) < PICKUP_DIST && Math.abs(headPos.y - n.y) < 2.5) collectNote(n);
  }
}

function collectNote(n) {
  n.collected = true;
  n.mesh.visible = false;
  hitCount++;
  if (hudHit) hudHit.textContent = String(hitCount);

  if (chimeBuffer) {
    const sfx = new THREE.Audio(listener);
    sfx.setBuffer(chimeBuffer);
    sfx.setLoop(false);
    sfx.setVolume(0.8 * volFx);
    sfx.play();
  }

  showPanel(n.tex);
  toast(`Nota ${hitCount} de ${notes.length}`);

  // Con 5 notas aparece el monstruo
  if (hitCount === MONSTER_TRIGGER && !monsterActive) spawnMonster();

  if (hitCount === notes.length) {
    // el susto final lo maneja startScare
    monsterActive = false;
    monster.visible = false;
    monsterLight.intensity = 0;
    state = 'waiting';
    waitT = SCARE_DELAY;
  }
}

function spawnMonster() {
  monsterActive = true;
  stunT = 0;
  const a = Math.random() * Math.PI * 2;
  const c = clampToWorld(new THREE.Vector3(
    headPos.x + Math.cos(a) * MONSTER_SPAWN_DIST, 0,
    headPos.z + Math.sin(a) * MONSTER_SPAWN_DIST
  ));
  monster.position.set(c.x, heightAt(c.x, c.z), c.z);
  monster.visible = true;
  toast('Algo te está siguiendo...');
}

function updateMonsterChase(dt) {
  if (!monsterActive) return;
  const dx = headPos.x - monster.position.x;
  const dz = headPos.z - monster.position.z;
  const dist = Math.hypot(dx, dz);
  monsterDist = dist;
  monster.rotation.y = Math.atan2(dx, dz);

  if (stunT > 0) {
    stunT -= dt; // aturdido: se queda quieto
  } else if (dist > 0.001) {
    // cada nota extra lo hace un poco más rápido (siempre menos que correr)
    const speed = Math.min(MONSTER_SPEED + (hitCount - MONSTER_TRIGGER) * 0.25, 5);
    const step = Math.min(speed * dt, dist);
    monster.position.x += (dx / dist) * step;
    monster.position.z += (dz / dist) * step;
  }
  monster.position.y = heightAt(monster.position.x, monster.position.z);

  monsterLight.position.set(monster.position.x, monster.position.y + 2.5, monster.position.z);
  monsterLight.intensity = stunT > 0 ? 2 : 8;

  if (dist < MONSTER_CATCH_DIST) startScare(); // te atrapó
}

// Flash de la linterna: clic derecho (PC) / gatillo derecho (VR)
function tryFlash() {
  if (state !== 'playing' && state !== 'waiting') return;
  if (flashDeadT > 0 || flashBurstT > 0) return; // sin batería
  flashBurstT = BURST_TIME;
  if (!monsterActive) return; // sin monstruo no gasta batería
  flashDeadT = BATTERY_DEAD_TIME;

  const to = new THREE.Vector3(
    monster.position.x - headPos.x,
    monster.position.y + 1.6 - headPos.y,
    monster.position.z - headPos.z
  );
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);

  if (to.length() < FLASH_RANGE && fwd.angleTo(to) < FLASH_CONE) {
    stunT = STUN_TIME;
    const hx = monster.position.x - headPos.x, hz = monster.position.z - headPos.z;
    const hd = Math.hypot(hx, hz) || 1;
    const nd = Math.max(hd, MONSTER_PUSHBACK);
    const c = clampToWorld(new THREE.Vector3(headPos.x + (hx / hd) * nd, 0, headPos.z + (hz / hd) * nd));
    monster.position.set(c.x, heightAt(c.x, c.z), c.z);
    toast('¡Lo ahuyentaste! Corre...');
  }
}

function flashScreen() {
  if (!flashEl) return;
  flashEl.style.transition = 'none';
  flashEl.style.background = '#fff';
  flashEl.style.opacity = '1';
  setTimeout(() => {
    flashEl.style.background = '#7a0000';
    flashEl.style.transition = 'opacity 0.5s';
    flashEl.style.opacity = '0';
  }, 120);
}

function startScare() {
  monsterActive = false;
  stunT = 0;
  state = 'scare';
  scareT = 0;
  panel.visible = false;
  panelPersistent = false;

  // se corta el ambiente y suena el grito
  if (ambientEl) ambientEl.pause();
  if (windSfx && windSfx.isPlaying) windSfx.pause();
  playScream();
  flashScreen();

  // cancela el teletransporte si estaba en curso
  teleportCtrl = null;
  arcLine.visible = false;
  marker.visible = false;

  monster.visible = true;
}

function endScare() {
  state = 'ended';
  monster.visible = false;
  monsterLight.intensity = 0;
  showPanel(hitCount >= notes.length ? endTex : loseTex, true);
}

function updateScare(dt) {
  scareT += dt;

  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
  fwd.normalize();

  const k = Math.min(scareT / 0.45, 1);
  const e = k * k;
  const dist = THREE.MathUtils.lerp(4.2, 0.65, e);
  const drop = THREE.MathUtils.lerp(0, -1.1, e);
  const jitter = k >= 1 ? 0.04 : 0;

  const mx = headPos.x + fwd.x * dist + (Math.random() - 0.5) * jitter;
  const mz = headPos.z + fwd.z * dist + (Math.random() - 0.5) * jitter;
  monster.position.set(mx, heightAt(mx, mz) + drop, mz);
  monster.rotation.y = Math.atan2(headPos.x - mx, headPos.z - mz);

  monsterLight.position.set(mx - fwd.x * 0.6, monster.position.y + 2.5, mz - fwd.z * 0.6);
  monsterLight.intensity = 30 * (0.6 + 0.4 * Math.random());

  if (scareT > SCARE_TOTAL) endScare();
}

function resetGame() {
  notes.forEach((n) => { n.collected = false; n.mesh.visible = true; });
  hitCount = 0;
  if (hudHit) hudHit.textContent = '0';

  monster.visible = false;
  monsterLight.intensity = 0;
  panel.visible = false;
  panelPersistent = false;
  state = 'playing';

  monsterActive = false;
  stunT = 0;
  flashDeadT = 0;
  flashBurstT = 0;

  yaw = 0; pitch = 0;
  player.rotation.y = 0;
  camera.rotation.x = 0;
  player.position.set(START_POS.x, heightAt(START_POS.x, START_POS.z) + eyeOffset(), START_POS.z);

  if (ambientEl) ambientEl.play().catch(() => {});
  if (windSfx && !windSfx.isPlaying) windSfx.play();
}

/** ========= MOVIMIENTO COMÚN ========= */
function moveBy(fwd, strafe, dt) {
  player.updateMatrixWorld(true);
  const f = new THREE.Vector3();
  camera.getWorldDirection(f);
  f.y = 0;
  if (f.lengthSq() < 1e-6) return;
  f.normalize();
  const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();

  const next = player.position.clone();
  next.addScaledVector(f, fwd * dt);
  next.addScaledVector(r, strafe * dt);
  resolveCollisions(next);
  next.y = heightAt(next.x, next.z) + eyeOffset();
  player.position.copy(next);
}

/** ========= MODO COMPUTADORA (para probar sin gafas) ========= */
const keys = {};
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code.startsWith('Arrow')) e.preventDefault();
  if (e.code === 'KeyE' && (state === 'playing' || state === 'waiting')) dismissPanel();
  if (e.code === 'KeyR' && state === 'ended') resetGame();
  // Tecla de prueba: lanza el susto de inmediato (puedes borrar esta línea al final)
  if (e.code === 'KeyT' && state === 'playing') startScare();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

let yaw = 0, pitch = 0, dragging = false;
canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 2) { tryFlash(); return; } // clic derecho = flash
  dragging = true;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointermove', (e) => {
  if (!dragging || renderer.xr.isPresenting) return;
  yaw -= e.movementX * 0.003;
  pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.003, -1.2, 1.2);
});

function desktopLook() {
  player.rotation.y = yaw;
  camera.rotation.x = pitch;
}
function desktopMove(dt) {
  const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  if (!f && !s) return;
  const speed = (keys.ShiftLeft || keys.ShiftRight) ? RUN_SPEED : WALK_SPEED;
  moveBy(f * speed, s * speed, dt);
}

/** ========= VR: CONTROLES + TELETRANSPORTE ========= */
const vrBtn = VRButton.createButton(renderer);
vrBtn.classList.add('vr-button');
document.body.appendChild(vrBtn);

const arcMatOK = new THREE.LineBasicMaterial({ color: 0x7ad1ff, transparent: true, opacity: 0.95 });
const arcMatBAD = new THREE.LineBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.95 });
const arcGeo = new THREE.BufferGeometry().setFromPoints(new Array(ARC_STEPS).fill(0).map(() => new THREE.Vector3()));
const arcLine = new THREE.Line(arcGeo, arcMatOK);
arcLine.visible = false;
arcLine.frustumCulled = false;
scene.add(arcLine);

const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.25, 0.30, 32),
  new THREE.MeshBasicMaterial({ color: 0x7ad1ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
);
marker.rotation.x = -Math.PI / 2;
marker.visible = false;
scene.add(marker);

let teleportCtrl = null;
let teleportValid = false;
const teleportPoint = new THREE.Vector3();

const controllerModelFactory = new XRControllerModelFactory();
for (let i = 0; i < 2; i++) {
  // Los controles van dentro de "player" para moverse junto con el jugador
  const ctrl = renderer.xr.getController(i);
  player.add(ctrl);

  const grip = renderer.xr.getControllerGrip(i);
  grip.add(controllerModelFactory.createControllerModel(grip));
  player.add(grip);

  ctrl.addEventListener('connected', (e) => { ctrl.userData.hand = e.data.handedness; });

  ctrl.addEventListener('selectstart', () => {
    if (state === 'ended') { resetGame(); return; }
    if (state === 'scare') return;
    // Gatillo derecho: flash. Gatillo izquierdo: teletransporte.
    if (ctrl.userData.hand === 'right') { tryFlash(); return; }
    teleportCtrl = ctrl;
    arcLine.visible = true;
  });
  ctrl.addEventListener('selectend', () => {
    if (teleportCtrl !== ctrl) return;
    teleportCtrl = null;
    arcLine.visible = false;
    marker.visible = false;
    if (teleportValid && (state === 'playing' || state === 'waiting')) {
      const p = clampToWorld(teleportPoint.clone());
      player.position.set(p.x, heightAt(p.x, p.z) + eyeOffset(), p.z);
    }
  });
}

renderer.xr.addEventListener('sessionstart', () => {
  coverEl.classList.add('hidden');
  player.position.y = heightAt(player.position.x, player.position.z); // en VR los ojos ya están a su altura real
  startAmbientAudio();
});
renderer.xr.addEventListener('sessionend', () => {
  camera.position.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);
  player.position.y = heightAt(player.position.x, player.position.z) + 1.6;
});

let snapLock = false;
let bLock = false;
function vrGamepadMove(dt) {
  const session = renderer.xr.getSession();
  if (!session) return;

  for (const src of session.inputSources) {
    const gp = src.gamepad;
    if (!gp) continue;

    let x = gp.axes[2] ?? gp.axes[0] ?? 0;
    let y = gp.axes[3] ?? gp.axes[1] ?? 0;

    if (src.handedness === 'right') {
      // Botón B (buttons[5] en Quest): cerrar la nota
      const bDown = !!gp.buttons[5]?.pressed;
      if (bDown && !bLock) dismissPanel();
      bLock = bDown;

      // Stick derecho: giro por pasos de 30°
      if (Math.abs(x) > 0.7 && !snapLock) {
        player.rotation.y -= Math.sign(x) * Math.PI / 6;
        snapLock = true;
      } else if (Math.abs(x) < 0.3) {
        snapLock = false;
      }
      continue;
    }

    // Stick izquierdo: caminar
    const dead = 0.12;
    if (Math.abs(x) < dead) x = 0;
    if (Math.abs(y) < dead) y = 0;
    if (x === 0 && y === 0) continue;
    moveBy(-y * VR_WALK_SPEED, x * VR_STRAFE_SPEED, dt);
  }
}

function updateTeleportArc() {
  if (!teleportCtrl) return;
  teleportValid = false;

  teleportCtrl.updateMatrixWorld(true);
  const origin = new THREE.Vector3().setFromMatrixPosition(teleportCtrl.matrixWorld);
  const q = new THREE.Quaternion();
  teleportCtrl.getWorldQuaternion(q);
  const vel = new THREE.Vector3(0, 0, -1).applyQuaternion(q).normalize().multiplyScalar(ARC_SPEED);

  const dt = 1 / 30;
  const p = origin.clone();
  const arr = arcGeo.attributes.position.array;
  let hit = null;
  let last = 0;

  for (let i = 0; i < ARC_STEPS; i++) {
    arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
    last = i;

    vel.y -= ARC_GRAVITY * dt;
    p.addScaledVector(vel, dt);

    const gy = heightAt(p.x, p.z);
    if (p.y <= gy) {
      hit = new THREE.Vector3(p.x, gy, p.z);
      if (i + 1 < ARC_STEPS) {
        arr[(i + 1) * 3] = hit.x; arr[(i + 1) * 3 + 1] = hit.y; arr[(i + 1) * 3 + 2] = hit.z;
        last = i + 1;
      }
      break;
    }
  }
  for (let i = last + 1; i < ARC_STEPS; i++) {
    arr[i * 3] = arr[last * 3]; arr[i * 3 + 1] = arr[last * 3 + 1]; arr[i * 3 + 2] = arr[last * 3 + 2];
  }
  arcGeo.attributes.position.needsUpdate = true;

  if (hit) {
    const slopeDeg = THREE.MathUtils.radToDeg(Math.acos(terrainNormal(hit.x, hit.z).y));
    const inside = Math.hypot(hit.x, hit.z) <= WORLD_RADIUS;
    teleportValid = slopeDeg <= MAX_SLOPE_DEG && inside;

    arcLine.material = teleportValid ? arcMatOK : arcMatBAD;
    marker.material.color.set(teleportValid ? 0x7ad1ff : 0xff5a5a);

    const c = clampToWorld(hit.clone());
    marker.position.set(c.x, heightAt(c.x, c.z) + 0.03, c.z);
    teleportPoint.copy(c);
    marker.visible = true;
  } else {
    marker.visible = false;
  }
}

/** ========= PORTADA Y AJUSTES ========= */
if (gearBtn && settingsEl) {
  gearBtn.addEventListener('click', () => settingsEl.classList.toggle('show'));
}

startBtn.addEventListener('click', () => {
  coverEl.classList.add('hidden');
  startAmbientAudio();
});

/** ========= LOOP ========= */
const clock = new THREE.Clock();

// Precalienta el monstruo para que no haya tirones en el susto
monster.visible = true;
renderer.compile(scene, camera);
monster.visible = false;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = performance.now() * 0.001;

  player.updateMatrixWorld(true);
  camera.getWorldPosition(headPos);

  if (!renderer.xr.isPresenting) desktopLook();

  if (state === 'playing' || state === 'waiting') {
    if (renderer.xr.isPresenting) {
      vrGamepadMove(dt);
      updateTeleportArc();
    } else {
      desktopMove(dt);
    }
    checkNotes();
    updateMonsterChase(dt);
  }

  // Cartel de la nota
  if (panel.visible && !panelPersistent) {
    panelTimer -= dt;
    if (panelTimer <= 0) panel.visible = false;
  }

  // Estados del final
  let flick = 0.97 + 0.03 * Math.sin(t * 23);
  if (state === 'waiting') {
    waitT -= dt;
    if (waitT < 3 && Math.random() < 0.35) flick = 0.05; // la linterna parpadea
    if (waitT <= 0) startScare();
  } else if (state === 'scare') {
    updateScare(dt);
    flick = Math.random() < 0.5 ? 0 : 1;
  } else if (state === 'ended') {
    flick = 0.5;
  }

  // Linterna: destello, batería agotada y parpadeo con el monstruo cerca
  let flashMul = 1;
  if (flashBurstT > 0) {
    flashBurstT -= dt;
    flashMul = BURST_MULT;                       // el destello
  } else if (flashDeadT > 0) {
    flashDeadT -= dt;                            // sin batería
    flashMul = (flashDeadT < 1.5 && Math.random() < 0.35) ? 0.4 : 0; // parpadea al volver
  }
  if (monsterActive && stunT <= 0 && monsterDist < 9 && Math.random() < 0.06) flick *= 0.15;
  flashlight.intensity = FLASH_INTENSITY * flick * flashMul;

  // Barra de batería (HUD de la computadora)
  if (battFill) {
    const pct = flashDeadT > 0 ? (1 - flashDeadT / BATTERY_DEAD_TIME) * 100 : 100;
    battFill.style.width = pct + '%';
    battFill.classList.toggle('dead', flashDeadT > 0);
  }

  // El cielo acompaña al jugador
  const p = player.position;
  starField.position.copy(p);
  moon.position.set(p.x + 60, p.y + 150, p.z - 140);
  moonGlow.position.copy(moon.position);
  moonLight.position.set(p.x + 60, 150, p.z - 140);
  moonLight.target.position.copy(p);
  moonLight.target.updateMatrixWorld();

  renderer.render(scene, camera);
});

/** ========= RESIZE ========= */
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});