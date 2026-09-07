function qs(name) { return new URLSearchParams(location.search).get(name); }
let MANUAL = null;
let CATEGORIAS = [];
let GRUPOS = {}; // { tema: [grupo, grupo, ...] }

async function init() {
  const id = qs('id');
  const data = await Api.listManuales();
  CATEGORIAS = data.categorias || [];
  GRUPOS = data.grupos || {};
  MANUAL = data.items.find(m => m.id === id);
  if (!MANUAL) { document.getElementById('notFound').hidden = false; return; }

  document.getElementById('app').hidden = false;
  document.title = `${MANUAL.titulo} · CATA`;
  fillHeader();

  const body = document.getElementById('mBody');
  try {
    const contenido = await Api.getManualContenido(MANUAL.archivo);
    if (contenido.tipo === 'html') {
      body.innerHTML = `<div class="manual-content">${contenido.html}</div>`;
    } else if (contenido.tipo === 'texto') {
      body.innerHTML = `<div class="manual-content"><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(contenido.texto)}</pre></div>`;
    } else {
      body.innerHTML = `<iframe class="manual-frame" src="${contenido.url}"></iframe>`;
    }
  } catch (e) {
    body.innerHTML = `<div class="empty">No se pudo cargar el contenido: ${escapeHtml(e.message)}</div>`;
  }

  document.getElementById('btnEditarMeta').addEventListener('click', () => adminGuard().then(() => {
    document.getElementById('eTitulo').value = MANUAL.titulo;
    poblarSelectCategoria();
    document.getElementById('eCategoria').value = MANUAL.categoria;
    poblarSelectGrupo();
    document.getElementById('eDescripcion').value = MANUAL.descripcion || '';
    document.getElementById('modalMeta').hidden = false;
  }));
  document.getElementById('eCancelar').addEventListener('click', () => { document.getElementById('modalMeta').hidden = true; });
  document.getElementById('eGuardar').addEventListener('click', guardarMeta);
  document.getElementById('btnEliminar').addEventListener('click', () => adminGuard().then(eliminar));

  document.getElementById('eCategoria').addEventListener('change', poblarSelectGrupo);

  document.getElementById('eCategoriaNueva').addEventListener('click', () => {
    const box = document.getElementById('eCategoriaNuevaBox');
    box.hidden = !box.hidden;
    if (!box.hidden) document.getElementById('eCategoriaNuevaInput').focus();
  });
  document.getElementById('eCategoriaNuevaGuardar').addEventListener('click', async () => {
    const input = document.getElementById('eCategoriaNuevaInput');
    const nombre = input.value.trim();
    if (!nombre) { toast('Escribe el nombre del tema', true); return; }
    try {
      const data = await Api.crearCategoria(nombre);
      CATEGORIAS = data.items;
      const sel = document.getElementById('eCategoria');
      sel.appendChild(new Option(data.nombre, data.nombre, false, true));
      poblarSelectGrupo();
      input.value = '';
      document.getElementById('eCategoriaNuevaBox').hidden = true;
      toast(`Tema "${data.nombre}" agregado`);
    } catch (e) { toast(e.message, true); }
  });

  document.getElementById('eGrupoNuevo').addEventListener('click', () => {
    const box = document.getElementById('eGrupoNuevoBox');
    box.hidden = !box.hidden;
    if (!box.hidden) document.getElementById('eGrupoNuevoInput').focus();
  });
  document.getElementById('eGrupoNuevoGuardar').addEventListener('click', async () => {
    const input = document.getElementById('eGrupoNuevoInput');
    const nombre = input.value.trim();
    if (!nombre) { toast('Escribe el nombre del grupo', true); return; }
    const tema = document.getElementById('eCategoria').value;
    try {
      const data = await Api.crearGrupo(tema, nombre);
      GRUPOS = data.items;
      const sel = document.getElementById('eGrupo');
      sel.appendChild(new Option(data.nombre, data.nombre, false, true));
      input.value = '';
      document.getElementById('eGrupoNuevoBox').hidden = true;
      toast(`Grupo "${data.nombre}" agregado`);
    } catch (e) { toast(e.message, true); }
  });
}

function poblarSelectCategoria() {
  const sel = document.getElementById('eCategoria');
  sel.innerHTML = '';
  for (const c of CATEGORIAS) sel.appendChild(new Option(c, c));
}

function poblarSelectGrupo() {
  const sel = document.getElementById('eGrupo');
  const tema = document.getElementById('eCategoria').value;
  sel.innerHTML = '';
  sel.appendChild(new Option('Sin grupo', ''));
  for (const g of (GRUPOS[tema] || [])) sel.appendChild(new Option(g, g, false, g === MANUAL.grupo));
}

async function eliminar() {
  const ok = await confirmDialog(`¿Eliminar "${MANUAL.titulo}"? Esta acción no se puede deshacer.`, { titulo: 'Eliminar manual' });
  if (!ok) return;
  try {
    await Api.deleteManual(MANUAL.id);
    toast('Manual eliminado');
    location.href = '/manuales.html';
  } catch (e) {
    toast(e.message, true);
  }
}

function fillHeader() {
  const pill = document.getElementById('mCategoria');
  pill.textContent = MANUAL.grupo ? `${MANUAL.categoria} · ${MANUAL.grupo}` : MANUAL.categoria;
  pill.dataset.cat = MANUAL.categoria;
  document.getElementById('mTitulo').textContent = MANUAL.titulo;
  document.getElementById('mDescripcion').textContent = MANUAL.descripcion || '';
  const descarga = document.getElementById('mDescarga');
  descarga.href = `/manuales/${MANUAL.archivo}`;
  descarga.hidden = false;
  const descargaPdf = document.getElementById('mDescargaPdf');
  descargaPdf.href = Api.manualPdfUrl(MANUAL.archivo);
  descargaPdf.hidden = false;
}

async function guardarMeta() {
  const meta = {
    titulo: document.getElementById('eTitulo').value.trim() || MANUAL.titulo,
    categoria: document.getElementById('eCategoria').value,
    grupo: document.getElementById('eGrupo').value,
    descripcion: document.getElementById('eDescripcion').value.trim(),
    tags: MANUAL.tags || []
  };
  try {
    await Api.saveManualMeta(MANUAL.id, meta);
    Object.assign(MANUAL, meta);
    fillHeader();
    document.getElementById('modalMeta').hidden = true;
    toast('Datos del manual actualizados');
  } catch (e) {
    toast(e.message, true);
  }
}

init();
