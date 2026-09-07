let TRAMITES = [];
let CATEGORIAS = [];
let GRUPOS = {}; // { tema: [grupo, grupo, ...] }
let temaActivo = null; // null = ningún tema abierto todavía; '' = "Todos" abierto explícitamente
let grupoActivo = null; // null = todos los grupos del tema; '__sin__' = sin grupo; string = grupo puntual

async function init() {
  const data = await Api.listTramites();
  TRAMITES = data.items;
  CATEGORIAS = data.categorias;
  GRUPOS = data.grupos || {};

  poblarSelectCategoria();
  poblarSelectGrupo();

  renderTemas();
  render();

  document.getElementById('buscar').addEventListener('input', render);
  document.getElementById('btnNuevo').addEventListener('click', () => adminGuard().then(() => toggleModal(true)));
  document.getElementById('nCancelar').addEventListener('click', () => toggleModal(false));
  document.getElementById('nCrear').addEventListener('click', crear);
  document.getElementById('btnSalir').addEventListener('click', salir);

  document.getElementById('nCategoria').addEventListener('change', poblarSelectGrupo);

  document.getElementById('nCategoriaNueva').addEventListener('click', () => {
    const box = document.getElementById('nCategoriaNuevaBox');
    box.hidden = !box.hidden;
    if (!box.hidden) document.getElementById('nCategoriaNuevaInput').focus();
  });
  document.getElementById('nCategoriaNuevaGuardar').addEventListener('click', async () => {
    const input = document.getElementById('nCategoriaNuevaInput');
    const nombre = input.value.trim();
    if (!nombre) { toast('Escribe el nombre del tema', true); return; }
    try {
      const data = await Api.crearCategoria(nombre);
      CATEGORIAS = data.items;
      const sel = document.getElementById('nCategoria');
      sel.appendChild(new Option(data.nombre, data.nombre, false, true));
      input.value = '';
      document.getElementById('nCategoriaNuevaBox').hidden = true;
      poblarSelectGrupo();
      renderTemas();
      toast(`Tema "${data.nombre}" agregado`);
    } catch (e) { toast(e.message, true); }
  });

  document.getElementById('nGrupoNuevo').addEventListener('click', () => {
    const box = document.getElementById('nGrupoNuevoBox');
    box.hidden = !box.hidden;
    if (!box.hidden) document.getElementById('nGrupoNuevoInput').focus();
  });
  document.getElementById('nGrupoNuevoGuardar').addEventListener('click', async () => {
    const input = document.getElementById('nGrupoNuevoInput');
    const nombre = input.value.trim();
    if (!nombre) { toast('Escribe el nombre del grupo', true); return; }
    const tema = document.getElementById('nCategoria').value;
    try {
      const data = await Api.crearGrupo(tema, nombre);
      GRUPOS = data.items;
      const sel = document.getElementById('nGrupo');
      sel.appendChild(new Option(data.nombre, data.nombre, false, true));
      input.value = '';
      document.getElementById('nGrupoNuevoBox').hidden = true;
      toast(`Grupo "${data.nombre}" agregado`);
    } catch (e) { toast(e.message, true); }
  });
}

function poblarSelectCategoria() {
  const sel = document.getElementById('nCategoria');
  sel.innerHTML = '';
  for (const c of CATEGORIAS) sel.appendChild(new Option(c, c));
}

function poblarSelectGrupo() {
  const sel = document.getElementById('nGrupo');
  const tema = document.getElementById('nCategoria').value;
  sel.innerHTML = '';
  sel.appendChild(new Option('Sin grupo', ''));
  for (const g of (GRUPOS[tema] || [])) sel.appendChild(new Option(g, g));
}

function salir() {
  // window.close() solo funciona si esta pestaña la abrió un script; si el
  // navegador lo bloquea (pestaña abierta a mano o por el usuario), la
  // sacamos de la app igual navegando a una pagina en blanco.
  window.close();
  setTimeout(() => { location.href = 'about:blank'; }, 300);
}

function toggleModal(show) {
  document.getElementById('modalNuevo').hidden = !show;
  if (show) document.getElementById('nTitulo').focus();
}

async function crear() {
  const titulo = document.getElementById('nTitulo').value.trim();
  if (!titulo) { toast('Escribe un título', true); return; }
  const categoria = document.getElementById('nCategoria').value;
  const grupo = document.getElementById('nGrupo').value;
  const descripcion = document.getElementById('nDescripcion').value.trim();
  try {
    const doc = await Api.createTramite({ titulo, categoria, grupo, descripcion });
    window.location.href = `/editor.html?id=${encodeURIComponent(doc.id)}`;
  } catch (e) {
    toast(e.message, true);
  }
}

function renderTemas() {
  const conocidas = new Set(CATEGORIAS);
  const hayOtros = TRAMITES.some(t => !conocidas.has(t.categoria));
  const temas = [...CATEGORIAS];
  if (hayOtros) temas.push('Otros');

  const list = document.getElementById('temaList');
  list.innerHTML =
    folderItemHtml('', 'Todos los trámites', TRAMITES.length, temaActivo === '') +
    temas.map(cat => {
      const count = cat === 'Otros'
        ? TRAMITES.filter(t => !conocidas.has(t.categoria)).length
        : TRAMITES.filter(t => t.categoria === cat).length;
      return folderItemHtml(cat, cat, count, temaActivo === cat);
    }).join('');

  list.querySelectorAll('.folder-item').forEach(li => {
    li.addEventListener('click', () => {
      temaActivo = li.dataset.cat;
      grupoActivo = null;
      renderTemas();
      render();
    });
  });
}

function cardHtml(t) {
  const tags = (t.etiquetas || []).map(e =>
    `<span class="tag-pill" style="--tc:${escapeHtml(e.color)}">${escapeHtml(e.texto)}</span>`
  ).join('');
  const cl = TEMA_FOLDER_COLORS[t.categoria] || TEMA_FOLDER_COLORS['General'];
  return `
    <div class="tc-parent">
      <div class="tc-card" style="--tc-c1:${cl.f1};--tc-c2:${cl.f2};--tc-dark:${cl.back}">
        <div class="tc-glass">
          <div class="tc-content">
            <span class="pill" data-cat="${escapeHtml(t.categoria)}">${escapeHtml(t.categoria)}</span>
            ${t.grupo ? `<span class="pill outline">${escapeHtml(t.grupo)}</span>` : ''}
            ${tags ? `<div class="tag-row">${tags}</div>` : ''}
            <span class="tc-title">${escapeHtml(t.titulo)}</span>
            <span class="tc-text">${escapeHtml(t.descripcion || 'Sin descripción')}</span>
            <span class="tc-meta">${t.pasos} paso${t.pasos === 1 ? '' : 's'} · Actualizado ${fmtDate(t.actualizado)}</span>
          </div>
          <div class="tc-bottom">
            <a class="tc-ingresar" href="/viewer.html?id=${encodeURIComponent(t.id)}">
              Ingresar <span class="msym">arrow_outward</span>
            </a>
            <div class="tc-actions">
              <a class="tc-action-btn" href="/editor.html?id=${encodeURIComponent(t.id)}" title="Editar"><span class="msym">edit</span></a>
              <button class="tc-action-btn danger" data-del="${encodeURIComponent(t.id)}" title="Eliminar"><span class="msym">delete</span></button>
            </div>
          </div>
        </div>
        <div class="tc-logo">
          <span class="tc-circle tc-circle1"></span>
          <span class="tc-circle tc-circle2"></span>
          <span class="tc-circle tc-circle3"><span class="msym">${TEMA_ICONS[t.categoria] || 'folder_open'}</span></span>
        </div>
      </div>
    </div>
  `;
}

function grupoChipHtml(value, label, count, active) {
  return `<button class="grupo-chip${active ? ' act' : ''}" type="button" data-grupo="${escapeHtml(value)}">${escapeHtml(label)} <span class="count">${count}</span></button>`;
}

// Chips para filtrar/ordenar los trámites de un tema puntual por su grupo
// (subcategoría). "itemsTema" ya viene filtrado por tema y búsqueda.
function renderGrupoFiltros(tema, itemsTema) {
  const bar = document.getElementById('grupoFiltros');
  const gruposTema = GRUPOS[tema] || [];
  if (!gruposTema.length) {
    bar.hidden = true;
    bar.innerHTML = '';
    grupoActivo = null;
    return;
  }

  const sinGrupo = itemsTema.filter(t => !t.grupo).length;
  const chips = [grupoChipHtml('', 'Todos', itemsTema.length, grupoActivo === null)]
    .concat(gruposTema.map(g => grupoChipHtml(g, g, itemsTema.filter(t => t.grupo === g).length, grupoActivo === g)));
  if (sinGrupo) chips.push(grupoChipHtml('__sin__', 'Sin grupo', sinGrupo, grupoActivo === '__sin__'));

  bar.innerHTML = chips.join('') +
    `<button class="grupo-chip add" type="button" id="btnGrupoNuevoInline"><span class="msym">add_circle</span> Nuevo grupo</button>`;
  bar.hidden = false;

  bar.querySelectorAll('[data-grupo]').forEach(el => {
    el.addEventListener('click', () => {
      grupoActivo = el.dataset.grupo === '' ? null : el.dataset.grupo;
      render();
    });
  });
  document.getElementById('btnGrupoNuevoInline').addEventListener('click', async () => {
    await adminGuard();
    const nombre = await promptDialog(`Nombre del grupo nuevo dentro de "${tema}":`, {
      titulo: 'Nuevo grupo', placeholder: 'Ej: Créditos', confirmarTexto: 'Agregar'
    });
    if (!nombre) return;
    try {
      const data = await Api.crearGrupo(tema, nombre);
      GRUPOS = data.items;
      grupoActivo = data.nombre;
      render();
      toast(`Grupo "${data.nombre}" agregado`);
    } catch (e) { toast(e.message, true); }
  });
}

function render() {
  const q = document.getElementById('buscar').value.toLowerCase();
  const grid = document.getElementById('grid');
  const grupoBar = document.getElementById('grupoFiltros');
  const conocidas = new Set(CATEGORIAS);

  if (temaActivo === null && !q) {
    grupoBar.hidden = true;
    grupoBar.innerHTML = '';
    grid.innerHTML = `
      <div class="tema-placeholder">
        <span class="msym">arrow_back</span>
        <h3>Elegí un tema para ver sus trámites</h3>
        <p>Seleccioná una opción del menú de la izquierda (o buscá directamente) para abrir su contenido.</p>
      </div>
    `;
    return;
  }

  const temaEfectivo = temaActivo === null ? '' : temaActivo;
  const itemsTema = TRAMITES.filter(t => {
    const matchQ = !q || t.titulo.toLowerCase().includes(q) || (t.descripcion || '').toLowerCase().includes(q);
    const matchC = !temaEfectivo || (temaEfectivo === 'Otros' ? !conocidas.has(t.categoria) : t.categoria === temaEfectivo);
    return matchQ && matchC;
  });

  if (temaEfectivo && temaEfectivo !== 'Otros') {
    renderGrupoFiltros(temaEfectivo, itemsTema);
  } else {
    grupoBar.hidden = true;
    grupoBar.innerHTML = '';
    grupoActivo = null;
  }

  const items = itemsTema.filter(t => {
    if (grupoActivo === null) return true;
    if (grupoActivo === '__sin__') return !t.grupo;
    return t.grupo === grupoActivo;
  });

  if (!items.length) {
    grid.innerHTML = `<div class="empty">No hay trámites que coincidan. Crea uno nuevo con "+ Nuevo trámite".</div>`;
    return;
  }

  let html;
  if (!temaEfectivo) {
    const secciones = CATEGORIAS
      .map(c => ({ cat: c, items: items.filter(t => t.categoria === c) }))
      .filter(s => s.items.length);
    const otros = items.filter(t => !conocidas.has(t.categoria));
    if (otros.length) secciones.push({ cat: null, items: otros });

    html = secciones.map(sec => `
      <section class="cat-section">
        <div class="cat-section-head" data-cat="${escapeHtml(sec.cat || 'General')}">
          <span class="dot"></span>
          <h2>${escapeHtml(sec.cat || 'Otros')}</h2>
          <span class="count">${sec.items.length}</span>
        </div>
        <div class="grid">${sec.items.map(cardHtml).join('')}</div>
      </section>
    `).join('');
  } else {
    html = `
      <div class="tema-content-head">
        <h2>${escapeHtml(temaActivo)}</h2>
        <span class="count">${items.length} trámite${items.length === 1 ? '' : 's'}</span>
      </div>
      <div class="grid">${items.map(cardHtml).join('')}</div>
    `;
  }
  grid.innerHTML = html;

  grid.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await adminGuard();
      const ok = await confirmDialog('¿Eliminar este trámite y todos sus archivos? Esta acción no se puede deshacer.', { titulo: 'Eliminar trámite' });
      if (!ok) return;
      try {
        await Api.deleteTramite(btn.dataset.del);
        TRAMITES = TRAMITES.filter(t => t.id !== decodeURIComponent(btn.dataset.del));
        renderTemas();
        render();
        toast('Trámite eliminado');
      } catch (e) {
        toast(e.message, true);
      }
    });
  });
}

init();
