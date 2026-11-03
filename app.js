/* Aldo — interfaz. Nada sale de esta pestaña. */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const E = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BASE = new URL(document.baseURI).pathname.replace(/\/$/, '');
const PAGINAS = ['pdf', 'cv', 'diapositivas', 'por-que'];
const TIT = { pdf: 'PDF', cv: 'CV', diapositivas: 'Diapositivas', 'por-que': 'Por qué' };
const est = { herr: 'unir', archivos: [], giro: '90', papel: 'A4', tema: 'claro' };
const peso = (b) => { const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (b >= 1024 && i < 3) { b /= 1024; i++; } return `${b.toFixed(i && b < 100 ? 1 : 0)} ${u[i]}`; };

function toast(t, malo) {
  const n = $('#toast');
  n.textContent = t;
  n.classList.toggle('err', !!malo);
  n.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { n.hidden = true; }, malo ? 5600 : 2600);
}
function seg(el, v, fn) {
  const pinta = (x) => $$('button', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(x))));
  pinta(v);
  el.addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) { pinta(b.dataset.v); fn(b.dataset.v); } });
}
function bajar(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 150);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function ocupado(btn, txt, fn) {
  const antes = btn.textContent;
  btn.disabled = true;
  btn.textContent = txt;
  $('#barTop').classList.add('activa');
  await esperar(30);
  try { return await fn(); } catch (e) { toast(e.message, true); } finally { btn.disabled = false; btn.textContent = antes; $('#barTop').classList.remove('activa'); }
}

function rutaActual() { const p = location.pathname.slice(BASE.length).replace(/^\/+|\/+$/g, ''); return PAGINAS.includes(p) ? p : 'pdf'; }
function ir(p, empujar = true) {
  $$('.pagina').forEach((s) => { s.hidden = s.dataset.p !== p; });
  $$('#tabs a').forEach((a) => a.classList.toggle('is-active', a.dataset.ir === p));
  $('#logoSub').textContent = TIT[p];
  if (empujar && rutaActual() !== p) history.pushState(null, '', `${BASE}/${p}`);
  window.scrollTo(0, 0);
}

/* ---- PDF ---- */
function pintarHerramientas() {
  $('#herramientas').innerHTML = Object.entries(Doc.HERRAMIENTAS).map(([k, h]) => `<li data-h="${k}"${k === est.herr ? ' class="sel"' : ''}><button class="row" type="button"><span class="title">${E(h.t)}</span><span class="tag">${E(h.d)}</span></button></li>`).join('');
}
function pintarHerr() {
  const h = Doc.HERRAMIENTAS[est.herr];
  $$('#herramientas li').forEach((l) => l.classList.toggle('sel', l.dataset.h === est.herr));
  $('#filePdf').accept = h.acepta;
  $('#filePdf').multiple = !!h.varios;
  $('#dropPdfS').textContent = h.acepta === '.pdf' ? (h.varios ? 'Varios PDF · Se procesan aquí. Nada se sube' : 'Un PDF · Se procesa aquí. Nada se sube') : 'Imágenes · Se procesan aquí. Nada se sube';
  $('#btnPdf').textContent = h.t;
  $('#pasoOpc').hidden = !h.opc;
  $('#opcPaginas').hidden = h.opc !== 'paginas';
  $('#opcGiro').hidden = h.opc !== 'giro';
  $('#opcTexto').hidden = h.opc !== 'texto';
  if (!h.varios && est.archivos.length > 1) est.archivos.length = 1;
  pintarArchivos();
}
function pintarArchivos() {
  const v = Doc.HERRAMIENTAS[est.herr].varios;
  $('#listaInfo').textContent = est.archivos.length ? `${est.archivos.length} · ${peso(est.archivos.reduce((s, f) => s + f.size, 0))}` : '';
  $('#archivos').innerHTML = est.archivos.map((f, i) => `<li data-i="${i}"><b title="${E(f.name)}">${E(f.name)}</b><span class="muted">${peso(f.size)}</span><span class="acc">${v && i ? '<button type="button" data-a="sube">↑</button>' : ''}${v && i < est.archivos.length - 1 ? '<button type="button" data-a="baja">↓</button>' : ''}<button type="button" data-a="quita">Quitar</button></span></li>`).join('');
}
function anadir(lista) {
  const h = Doc.HERRAMIENTAS[est.herr];
  const nuevos = [...lista].filter((f) => (h.acepta === '.pdf' ? /\.pdf$/i.test(f.name) || f.type === 'application/pdf' : /^image\//.test(f.type)));
  if (nuevos.length < lista.length) toast(h.acepta === '.pdf' ? 'Esta herramienta solo acepta PDF' : 'Esta herramienta solo acepta imágenes', true);
  est.archivos = h.varios ? [...est.archivos, ...nuevos] : nuevos.slice(0, 1).concat();
  pintarArchivos();
}
async function procesar() {
  const h = Doc.HERRAMIENTAS[est.herr];
  if (!est.archivos.length) { toast('Primero elige los archivos', true); return; }
  await ocupado($('#btnPdf'), 'Procesando…', async () => {
    const t0 = performance.now();
    const out = await h.run(est.archivos, { paginas: $('#paginas').value, giro: est.giro, texto: $('#textoMarca').value });
    for (const r of out) { bajar(new Blob([r.bytes], { type: 'application/pdf' }), r.nombre); if (out.length > 1) await esperar(250); }
    const total = out.reduce((s, r) => s + r.bytes.length, 0);
    $('#resPdf').textContent = `${out.length} ${out.length === 1 ? 'archivo' : 'archivos'} · ${peso(total)} · ${((performance.now() - t0) / 1000).toFixed(1)} s · en tus descargas`;
  });
}

/* ---- CV ---- */
const CLAVE_CV = 'aldo.cv';
function leerCv() { const d = {}; $$('[data-cv]').forEach((n) => { d[n.dataset.cv] = n.value; }); return d; }
function vistaCv() {
  const c = Doc.trocearCv(leerCv());
  const lista = (bs) => bs.map((b) => b.map((l, j) => {
    const v = l.match(/^[-•*]\s+(.*)/);
    if (v) return `<p class="vi">• ${E(v[1])}</p>`;
    if (j === 0) { const [a, f] = l.split(/\s*\|\s*/); return `<p class="ve"><b>${E(a)}</b>${f ? `<span>${E(f)}</span>` : ''}</p>`; }
    return `<p>${E(l)}</p>`;
  }).join('')).join('<br>');
  const sec = (t, h) => (h ? `<h4>${t}</h4>${h}` : '');
  const vacio = !c.nombre && !c.perfil && !c.exp.length;
  $('#cvVista').innerHTML = vacio ? '<div class="ghost vacio-g">CV<small>Escribe a la izquierda y aparece aquí</small></div>'
    : `<h3>${E(c.nombre)}</h3><p class="vt">${E(c.titular)}</p><p class="vc">${E(c.contacto)}</p>${sec('Perfil', c.perfil && `<p>${E(c.perfil)}</p>`)}${sec('Experiencia', lista(c.exp))}${sec('Educación', lista(c.edu))}${sec('Habilidades', c.hab && `<p>${E(c.hab)}</p>`)}`;
}

/* ---- diapositivas ---- */
const GUION = `# El plan de este año
Tres ideas en cinco minutos

# Qué queremos
- Más clientes con el mismo equipo
- Menos tareas manuales
- Decidir con datos

# Cómo lo haremos
- Primero, medir lo que hay
- Después, automatizar lo repetido
- Revisar cada mes`;
function vistaDiapos() {
  const ds = Doc.trocearGuion($('#guion').value);
  $('#diaInfo').textContent = `${ds.length} ${ds.length === 1 ? 'diapositiva' : 'diapositivas'}`;
  $('#diapos').classList.toggle('osc', est.tema === 'oscuro');
  $('#diapos').innerHTML = ds.map((s, i) => `<article><h3>${E(s.titulo)}</h3>${s.puntos.map((p) => `<p>${i === 0 && s.puntos.length <= 1 ? '' : '• '}${E(p)}</p>`).join('')}<small>${i + 1}/${ds.length}</small></article>`).join('');
}

const VS = [
  ['Aldo', 'En tu navegador: <em>sin subir archivos, sin cuenta y sin topes</em>. Funciona sin conexión una vez abierta. Además crea tu CV y tus presentaciones. Gratis y de código abierto.', true],
  ['Smallpdf', 'En la nube. El plan gratis permite <em>unas 2 tareas al día</em>. Tus archivos pasan por sus servidores.'],
  ['iLovePDF', 'Muy cómodo, pero <em>sube tus archivos a sus servidores</em> y el plan gratis tiene topes.'],
  ['Stirling-PDF', 'Libre y local, con <em>muchas más funciones (más de 50)</em>, pero hay que montarle un servidor con Java. Aldo hace menos y no necesita nada.'],
  ['Lo que Aldo no hace', '<em>No comprime ni convierte a Word</em> ni aplica OCR: eso exige motores pesados. Para eso, Stirling-PDF.'],
];

/* ---- arranque ---- */
function enganchar() {
  document.addEventListener('click', (e) => { const a = e.target.closest('[data-ir]'); if (a && !e.ctrlKey && !e.metaKey) { e.preventDefault(); ir(a.dataset.ir); } });
  window.addEventListener('popstate', () => ir(rutaActual(), false));
  $('#herramientas').addEventListener('click', (e) => { const l = e.target.closest('li[data-h]'); if (l) { est.herr = l.dataset.h; est.archivos = est.archivos.filter((f) => (Doc.HERRAMIENTAS[est.herr].acepta === '.pdf' ? /\.pdf$/i.test(f.name) : /^image\//.test(f.type))); pintarHerr(); } });
  const zona = $('#dropPdf');
  zona.addEventListener('click', () => $('#filePdf').click());
  zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('over'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('over'));
  zona.addEventListener('drop', (e) => { e.preventDefault(); zona.classList.remove('over'); anadir(e.dataTransfer.files); });
  $('#filePdf').addEventListener('change', (e) => { anadir(e.target.files); e.target.value = ''; });
  $('#archivos').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-a]');
    if (!b) return;
    const i = +b.closest('li').dataset.i, a = est.archivos;
    if (b.dataset.a === 'quita') a.splice(i, 1);
    else { const j = b.dataset.a === 'sube' ? i - 1 : i + 1; [a[i], a[j]] = [a[j], a[i]]; }
    pintarArchivos();
  });
  $('#btnPdf').addEventListener('click', procesar);
  seg($('#segGiro'), '90', (v) => { est.giro = v; });
  seg($('#segPapel'), 'A4', (v) => { est.papel = v; });
  seg($('#segTema'), 'claro', (v) => { est.tema = v; vistaDiapos(); });
  $$('[data-cv]').forEach((n) => n.addEventListener('input', () => {
    vistaCv();
    try { localStorage.setItem(CLAVE_CV, JSON.stringify(leerCv())); } catch (e) { /* modo privado */ }
  }));
  $('#btnCv').addEventListener('click', () => ocupado($('#btnCv'), 'Generando…', async () => {
    const d = leerCv();
    if (!d.nombre.trim()) throw new Error('Falta tu nombre');
    bajar(new Blob([await Doc.cvPdf(d, est.papel)], { type: 'application/pdf' }), `CV ${d.nombre.trim()}.pdf`);
  }));
  $('#guion').addEventListener('input', vistaDiapos);
  $('#btnPptx').addEventListener('click', () => ocupado($('#btnPptx'), 'Generando…', async () => bajar(await Doc.pptx($('#guion').value, est.tema), 'presentacion.pptx')));
}
try { const g = JSON.parse(localStorage.getItem(CLAVE_CV) || '{}'); $$('[data-cv]').forEach((n) => { if (g[n.dataset.cv]) n.value = g[n.dataset.cv]; }); } catch (e) { /* sin datos */ }
$('#guion').value = GUION;
$('#vs').innerHTML = VS.map(([n, t, yo]) => `<li${yo ? ' class="yo"' : ''}><b>${n}</b><span>${t}</span></li>`).join('');
pintarHerramientas();
enganchar();
pintarHerr();
vistaCv();
vistaDiapos();
ir(rutaActual(), false);
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
