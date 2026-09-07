const ICONS = { pdf: 'picture_as_pdf', md: 'description', markdown: 'description', html: 'language', htm: 'language', txt: 'notes' };

let CATEGORIAS = [];
let GRUPOS = {}; // { tema: [grupo, grupo, ...] }
let MANUALES = [];
let categoriaActiva = null; // null = ningún tema abierto todavía; '' = "Todos" abierto explícitamente
let grupoActivo = null; // null = todos los grupos del tema; '__sin__' = sin grupo; string = grupo puntual

async function init() {
  const data = await Api.listManuales();
  CATEGORIAS = data.categorias || [];
  GRUPOS = data.grupos || {};
  MANUALES = data.items;

  renderTemas();
  render();

  document.getElementById('buscar').addEventListener('input', render);
  document.getElementById('btnSubir').addEventListener('click', () => adminGuard().then(() => toggleModal(true)));
  document.getElementById('fCancelar').addEventListener('click', () => toggleModal(false));
  document.getElementById('fSubir').addEventListener('click', subir);

  document.getElementById('fCategoria').addEventListener('change', poblarSelectGrupoSubida);

  document.getElementById('fCategoriaNueva').addEventListener('click', () => {
    const box = document.getElementById('fCategoriaNuevaBox');
    box.hidden = !box.hidden;
    if (!box.hidden) document.getElementById('fCategoriaNuevaInput').focus();
  });
  document.getElementById('fCategoriaNuevaGuardar').addEventListener('click', async () => {
    const input = document.getElementById('fCategoriaNuevaInput');
    const nombre = input.value.trim();
    if (!nombre) { toast('Escribe el nombre del tema', true); return; }
    try {
      const data = await Api.crearCategoria(nombre);
      CATEGORIAS = data.items;
      const sel = document.getElementById('fCategoria');
      sel.appendChild(new Option(data.nombre, data.nombre, false, true));
      input.value = '';
      document.getElementById('fCategoriaNuevaBox').hidden = true;
      poblarSelectGrupoSubida();
      renderTemas();
      toast(`Tema "${data.nombre}" agregado`);
    } catch (e) { toast(e.message, true); }
  });

  document.getElementById('fGrupoNuevo').addEventListener('click', () => {
    const box = document.getElementById('fGrupoNuevoBox');
    box.hidden = !box.hidden;
    if (!box.hidden) document.getElementById('fGrupoNuevoInput').focus();
  });
  document.getElementById('fGrupoNuevoGuardar').addEventListener('click', async () => {
    const input = document.getElementById('fGrupoNuevoInput');
    const nombre = input.value.trim();
    if (!nombre) { toast('Escribe el nombre del grupo', true); return; }
    const tema = document.getElementById('fCategoria').value;
    try {
      const data = await Api.crearGrupo(tema, nombre);
      GRUPOS = data.items;
      const sel = document.getElementById('fGrupo');
      sel.appendChild(new Option(data.nombre, data.nombre, false, true));
      input.value = '';
      document.getElementById('fGrupoNuevoBox').hidden = true;
      toast(`Grupo "${data.nombre}" agregado`);
    } catch (e) { toast(e.message, true); }
  });
}

function poblarSelectGrupoSubida() {
  const sel = document.getElementById('fGrupo');
  const tema = document.getElementById('fCategoria').value;
  sel.innerHTML = '';
  sel.appendChild(new Option('Sin grupo', ''));
  for (const g of (GRUPOS[tema] || [])) sel.appendChild(new Option(g, g));
}

function toggleModal(show) {
  document.getElementById('modalSubir').hidden = !show;
  if (show) {
    const sel = document.getElementById('fCategoria');
    sel.innerHTML = CATEGORIAS.map(c => `<option${c === 'General' ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('');
    poblarSelectGrupoSubida();
  }
}

async function subir() {
  const file = document.getElementById('fArchivo').files[0];
  if (!file) { toast('Selecciona un archivo', true); return; }
  const meta = {
    titulo: document.getElementById('fTitulo').value.trim() || file.name,
    categoria: document.getElementById('fCategoria').value,
    grupo: document.getElementById('fGrupo').value,
    descripcion: document.getElementById('fDescripcion').value.trim()
  };
  try {
    await Api.uploadManual(file, meta);
    toast('Manual cargado en /manuales');
    toggleModal(false);
    const data = await Api.listManuales();
    MANUALES = data.items;
    renderTemas();
    render();
  } catch (e) {
    toast(e.message, true);
  }
}

function renderTemas() {
  const conocidas = new Set(CATEGORIAS);
  const temas = [...CATEGORIAS];
  if (MANUALES.some(m => !conocidas.has(m.categoria))) temas.push('Otros');

  const list = document.getElementById('temaList');
  list.innerHTML =
    folderItemHtml('', 'Todos', MANUALES.length, categoriaActiva === '') +
    temas.map(cat => {
      const count = cat === 'Otros'
        ? MANUALES.filter(m => !conocidas.has(m.categoria)).length
        : MANUALES.filter(m => m.categoria === cat).length;
      return folderItemHtml(cat, cat, count, categoriaActiva === cat);
    }).join('');

  list.querySelectorAll('.folder-item').forEach(li => {
    li.addEventListener('click', () => {
      categoriaActiva = li.dataset.cat;
      grupoActivo = null;
      renderTemas();
      render();
    });
  });
}

function grupoChipHtml(value, label, count, active) {
  return `<button class="grupo-chip${active ? ' act' : ''}" type="button" data-grupo="${escapeHtml(value)}">${escapeHtml(label)} <span class="count">${count}</span></button>`;
}

// Chips para filtrar/ordenar los manuales de un tema puntual por su grupo
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

  const sinGrupo = itemsTema.filter(m => !m.grupo).length;
  const chips = [grupoChipHtml('', 'Todos', itemsTema.length, grupoActivo === null)]
    .concat(gruposTema.map(g => grupoChipHtml(g, g, itemsTema.filter(m => m.grupo === g).length, grupoActivo === g)));
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

  if (categoriaActiva === null && !q) {
    grupoBar.hidden = true;
    grupoBar.innerHTML = '';
    grid.innerHTML = `
      <div class="tema-placeholder">
        <span class="msym">arrow_back</span>
        <h3>Elegí un tema para ver sus manuales</h3>
        <p>Seleccioná una opción del menú de la izquierda (o buscá directamente) para ver los manuales disponibles.</p>
      </div>
    `;
    return;
  }

  const conocidas = new Set(CATEGORIAS);
  const categoriaEfectiva = categoriaActiva === null ? '' : categoriaActiva;
  const itemsTema = MANUALES.filter(m => {
    const matchQ = !q || m.titulo.toLowerCase().includes(q) || (m.descripcion || '').toLowerCase().includes(q);
    const matchC = !categoriaEfectiva || (categoriaEfectiva === 'Otros' ? !conocidas.has(m.categoria) : m.categoria === categoriaEfectiva);
    return matchQ && matchC;
  });

  if (categoriaEfectiva && categoriaEfectiva !== 'Otros') {
    renderGrupoFiltros(categoriaEfectiva, itemsTema);
  } else {
    grupoBar.hidden = true;
    grupoBar.innerHTML = '';
    grupoActivo = null;
  }

  const items = itemsTema.filter(m => {
    if (grupoActivo === null) return true;
    if (grupoActivo === '__sin__') return !m.grupo;
    return m.grupo === grupoActivo;
  });

  if (!items.length) {
    grid.innerHTML = `<div class="empty">No hay manuales que coincidan. Carga uno con "+ Cargar manual".</div>`;
    return;
  }

  if (!categoriaEfectiva) {
    const secciones = CATEGORIAS
      .map(cat => ({ cat, items: items.filter(m => m.categoria === cat) }))
      .filter(s => s.items.length);
    const otros = items.filter(m => !conocidas.has(m.categoria));
    if (otros.length) secciones.push({ cat: 'Otros', items: otros });

    grid.innerHTML = secciones.map(sec => `
      <section class="cat-section">
        <div class="cat-section-head" data-cat="${escapeHtml(sec.cat)}">
          <span class="dot"></span>
          <h2>${escapeHtml(sec.cat)}</h2><span class="count">${sec.items.length}</span>
        </div>
        <div class="grid">${sec.items.map(cardHtml).join('')}</div>
      </section>
    `).join('');
    return;
  }

  grid.innerHTML = `
    <div class="tema-content-head">
      <h2>${escapeHtml(categoriaActiva)}</h2>
      <span class="count">${items.length} manual${items.length === 1 ? '' : 'es'}</span>
    </div>
    <div class="grid">${items.map(cardHtml).join('')}</div>
  `;
}

function cardHtml(m) {
  const cl = folderColor(m.categoria);
  return `
    <div class="tc-parent">
      <div class="tc-card" style="--tc-c1:${cl.f1};--tc-c2:${cl.f2};--tc-dark:${cl.back}">
        <div class="tc-glass">
          <div class="tc-content">
            <span class="pill" data-cat="${escapeHtml(m.categoria)}">${escapeHtml(m.categoria)}</span>
            ${m.grupo ? `<span class="pill outline">${escapeHtml(m.grupo)}</span>` : ''}
            <span class="tc-title">${escapeHtml(m.titulo)}</span>
            <span class="tc-text">${escapeHtml(m.descripcion || 'Sin descripción')}</span>
            <span class="tc-meta">${m.tipo.toUpperCase()}</span>
          </div>
          <div class="tc-bottom">
            <a class="tc-ingresar" href="/manual.html?id=${encodeURIComponent(m.id)}">
              Abrir <span class="msym">arrow_outward</span>
            </a>
          </div>
        </div>
        <div class="tc-logo">
          <span class="tc-circle tc-circle1"></span>
          <span class="tc-circle tc-circle2"></span>
          <span class="tc-circle tc-circle3"><span class="msym">${ICONS[m.tipo] || 'description'}</span></span>
        </div>
      </div>
    </div>
  `;
}

init();
