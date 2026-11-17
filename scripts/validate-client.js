'use strict';
const fs = require('node:fs');
const vm = require('node:vm');

function checkJavaScript(source, filename) {
  new vm.Script(source, { filename, displayErrors: true });
  console.log('[validate] syntax OK: ' + filename);
}

for (const filename of ['server.js', 'public/features.js', 'public/rest.js']) {
  checkJavaScript(fs.readFileSync(filename, 'utf8'), filename);
}

const html = fs.readFileSync('public/index.html', 'utf8');
const inlineScripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1].trim())
  .filter(Boolean);
if (!inlineScripts.length) throw new Error('No inline JavaScript found in public/index.html');
inlineScripts.forEach((source, index) => checkJavaScript(source, 'public/index.html:inline-' + (index + 1)));

const features = fs.readFileSync('public/features.js', 'utf8');
const rest = fs.readFileSync('public/rest.js', 'utf8');
if (!features.includes('rf-calendar-filter') || !features.includes('data-study-calendar')) {
  throw new Error('Weekly calendar / Estudio integration is missing');
}
if (!features.includes('Saldos por apartado') || !features.includes('/api/storage/status')) {
  throw new Error('Economy or storage status integration is missing');
}
if (!rest.includes('room-sleep-v1::') || !rest.includes('últimos 14 días')) {
  throw new Error('Per-account rest storage or 14-day chart is missing');
}
console.log('[validate] Studyhub integration assertions passed');
