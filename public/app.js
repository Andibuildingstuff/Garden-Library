import { plants, settings, newId, exportAll, importAll } from './db.js';
import {
  MONTH_NAMES,
  monthLabel,
  monthsLabel,
  seasonFor,
  seasonalNote,
  tasksForMonth,
  wateringStatus,
  yearAtAGlance,
} from './care.js';
import { BUILT_IN_PLANTS, findBuiltIn } from './plantData.js';
import { buildPasteablePrompt, parsePastedProfile } from './profile.js';

const view = document.getElementById('view');
const toastEl = document.getElementById('toast');
const todoBadge = document.getElementById('todo-badge');

const state = {
  plants: [],
  settings: { hemisphere: 'north', location: '', accessCode: '' },
  identificationAvailable: false,
  accessCodeRequired: false,
  // What /api/status said, kept so Settings can show it. Diagnosing a
  // deployment from a phone is otherwise guesswork.
  serverStatus: { checked: false, reachable: false, model: '' },
  draft: { images: [], notes: '', busy: false, error: '', paste: '', pasteError: '', showPromptText: false },
  search: '',
};

const emptyDraft = () => ({ images: [], notes: '', busy: false, error: '', paste: '', pasteError: '', showPromptText: false });

/* ---------------------------------------------------------------- helpers */

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

/** Renders a multi-line string as paragraphs, escaped. */
function paras(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return '';
  return trimmed
    .split(/\n{1,}/)
    .filter(Boolean)
    .map((line) => `<p>${esc(line)}</p>`)
    .join('');
}

/**
 * Copy to the clipboard, falling back to a hidden textarea. The Clipboard API
 * needs a secure context, which you don't get over plain http on a home network.
 */
async function copyText(text) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the old way
    }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

/** Hand the photos to the iOS share sheet so they can go straight into Claude. */
async function sharePhotos(images) {
  if (!navigator.canShare || !navigator.share) return false;
  const files = await Promise.all(
    images.map(async (image, index) => {
      const blob = await (await fetch(image.dataUrl)).blob();
      return new File([blob], `plant-${index + 1}.jpg`, { type: 'image/jpeg' });
    }),
  );
  if (!navigator.canShare({ files })) return false;
  try {
    await navigator.share({ files });
    return true;
  } catch {
    return false; // the user backed out of the share sheet
  }
}

/** Headers for the paid routes: the access code keeps strangers off your credit. */
function apiHeaders() {
  const headers = { 'content-type': 'application/json' };
  if (state.settings.accessCode) headers['x-garden-access-code'] = state.settings.accessCode;
  return headers;
}

/** True when the server wants a code and this device hasn't got one saved. */
const needsAccessCode = () => state.accessCodeRequired && !state.settings.accessCode;

function toast(message, kind = '') {
  toastEl.textContent = message;
  toastEl.className = `toast ${kind}`.trim();
  toastEl.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    toastEl.hidden = true;
  }, kind === 'error' ? 6000 : 3000);
}

const displayName = (plant) => plant.nickname || plant.profile?.commonName || 'Unnamed plant';

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function relativeDays(days) {
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

async function refreshPlants() {
  const all = await plants.all();
  state.plants = all.sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
  updateTodoBadge();
}

function updateTodoBadge() {
  const month = new Date().getMonth() + 1;
  let count = 0;
  for (const plant of state.plants) {
    count += tasksForMonth(plant, month, state.settings.hemisphere).length;
    const water = wateringStatus(plant, { hemisphere: state.settings.hemisphere });
    if (water?.overdue) count += 1;
  }
  todoBadge.textContent = String(count);
  todoBadge.hidden = count === 0;
}

/* ------------------------------------------------------------------ router */

const routes = [
  [/^\/library$/, renderLibrary],
  [/^\/todo$/, renderTodo],
  [/^\/add$/, renderAdd],
  [/^\/plant\/(.+)$/, renderPlant],
  [/^\/settings$/, renderSettings],
];

function currentRoute() {
  return location.hash.replace(/^#/, '') || '/library';
}

async function route() {
  const path = currentRoute();
  for (const [pattern, handler] of routes) {
    const match = path.match(pattern);
    if (match) {
      await handler(match[1]);
      document.querySelectorAll('.tab-bar a').forEach((link) => {
        link.classList.toggle('active', link.getAttribute('href') === `#${path}`);
      });
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = '#/library';
}

window.addEventListener('hashchange', route);

/* ----------------------------------------------------------------- library */

function plantCard(plant) {
  const profile = plant.profile ?? {};
  const photo = plant.photos?.[0];
  const water = wateringStatus(plant, { hemisphere: state.settings.hemisphere });
  const tasks = tasksForMonth(plant, new Date().getMonth() + 1, state.settings.hemisphere);
  const flags = [];
  if (water?.overdue) flags.push('<span class="pill alert">💧 thirsty</span>');
  if (tasks.length) flags.push(`<span class="pill">${tasks[0].icon} ${esc(tasks[0].kind)}</span>`);

  return `
    <a class="plant-card" href="#/plant/${esc(plant.id)}">
      ${photo ? `<img class="thumb" src="${esc(photo)}" alt="" loading="lazy" />` : '<div class="thumb-fallback" aria-hidden="true">🌱</div>'}
      <div class="body">
        <div class="name">${esc(displayName(plant))}</div>
        <div class="latin">${esc(profile.scientificName ?? '')}</div>
        ${flags.length ? `<div class="flags">${flags.join('')}</div>` : ''}
      </div>
    </a>`;
}

async function renderLibrary() {
  const needle = state.search.trim().toLowerCase();
  const matches = state.plants.filter((plant) => {
    if (!needle) return true;
    const haystack = [
      plant.nickname,
      plant.where,
      plant.profile?.commonName,
      plant.profile?.scientificName,
      plant.profile?.family,
      plant.profile?.plantType,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });

  view.innerHTML = `
    <div class="library-head">
      <input type="search" id="search" placeholder="Search your library" value="${esc(state.search)}" aria-label="Search your library" />
    </div>
    ${
      state.plants.length === 0
        ? `<div class="empty">
             <span class="big" aria-hidden="true">🌱</span>
             <h2>Nothing planted yet</h2>
             <p>Take a photo of a plant and I'll work out what it is and how to look after it.</p>
             <a class="button button-primary" href="#/add">Add your first plant</a>
           </div>`
        : matches.length === 0
          ? `<div class="empty"><p>No plants match “${esc(state.search)}”.</p></div>`
          : `<div class="plant-grid">${matches.map(plantCard).join('')}</div>
             <p class="muted small center" style="margin-top:16px">${matches.length} of ${state.plants.length} plants</p>`
    }`;

  const search = document.getElementById('search');
  if (search) {
    search.addEventListener('input', (event) => {
      state.search = event.target.value;
      renderLibrary();
    });
  }
}

/* -------------------------------------------------------------------- todo */

async function renderTodo() {
  const month = state.todoMonth ?? new Date().getMonth() + 1;
  state.todoMonth = month;
  const hemisphere = state.settings.hemisphere;

  const thirsty = state.plants
    .map((plant) => ({ plant, water: wateringStatus(plant, { hemisphere }) }))
    .filter((row) => row.water?.overdue);

  const never = state.plants.filter((plant) => {
    const water = wateringStatus(plant, { hemisphere });
    return water && !water.dormant && water.lastWatered === null;
  });

  const jobs = [];
  for (const plant of state.plants) {
    for (const task of tasksForMonth(plant, month, hemisphere)) {
      jobs.push({ plant, task });
    }
  }
  const order = { prune: 0, feed: 1, plant: 2, propagate: 3 };
  jobs.sort((a, b) => (order[a.task.kind] ?? 9) - (order[b.task.kind] ?? 9));

  const season = seasonFor(month, hemisphere);

  view.innerHTML = `
    <h1>Jobs for ${monthLabel(month)}</h1>
    <div class="month-switch">
      <button id="prev-month" aria-label="Previous month">‹</button>
      <select id="month-select" aria-label="Month">
        ${MONTH_NAMES.map((name, index) => `<option value="${index + 1}" ${index + 1 === month ? 'selected' : ''}>${name}</option>`).join('')}
      </select>
      <button id="next-month" aria-label="Next month">›</button>
    </div>
    <p class="muted small">${esc(season.charAt(0).toUpperCase() + season.slice(1))} in the ${hemisphere === 'south' ? 'southern' : 'northern'} hemisphere.</p>

    ${
      thirsty.length
        ? `<h2>💧 Needs watering</h2>
           ${thirsty
             .map(
               ({ plant, water }) => `
             <div class="task">
               <div class="icon" aria-hidden="true">💧</div>
               <div>
                 <div class="title">${esc(displayName(plant))}</div>
                 <div class="who">Last watered ${esc(relativeDays(water.daysSince))} — about every ${water.interval} days at this time of year</div>
                 <div class="button-row" style="margin-top:8px">
                   <button data-water="${esc(plant.id)}">Mark watered</button>
                   <a class="button" href="#/plant/${esc(plant.id)}">Open</a>
                 </div>
               </div>
             </div>`,
             )
             .join('')}`
        : ''
    }

    ${
      never.length
        ? `<p class="muted small">${never.length} plant${never.length === 1 ? ' has' : 's have'} no watering logged yet — tap “Watered” on a plant to start the clock.</p>`
        : ''
    }

    <h2 style="margin-top:18px">🗓️ This month's calendar jobs</h2>
    ${
      jobs.length === 0
        ? `<div class="empty"><p>${state.plants.length === 0 ? 'Add a plant and its jobs will appear here.' : `Nothing scheduled for ${monthLabel(month)}. A quiet month.`}</p></div>`
        : jobs
            .map(
              ({ plant, task }) => `
        <div class="task">
          <div class="icon" aria-hidden="true">${task.icon}</div>
          <div>
            <div class="title">${esc(task.title)}</div>
            <div class="who"><a href="#/plant/${esc(plant.id)}">${esc(displayName(plant))}</a>${plant.where ? ` · ${esc(plant.where)}` : ''}</div>
            ${task.detail ? `<div class="detail">${esc(task.detail)}</div>` : ''}
            ${task.caution ? `<div class="callout"><strong>Careful</strong>${esc(task.caution)}</div>` : ''}
          </div>
        </div>`,
            )
            .join('')
    }`;

  const select = document.getElementById('month-select');
  select.addEventListener('change', (event) => {
    state.todoMonth = Number(event.target.value);
    renderTodo();
  });
  document.getElementById('prev-month').addEventListener('click', () => {
    state.todoMonth = ((month + 10) % 12) + 1;
    renderTodo();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    state.todoMonth = (month % 12) + 1;
    renderTodo();
  });
  view.querySelectorAll('[data-water]').forEach((button) => {
    button.addEventListener('click', async () => {
      await addLogEntry(button.dataset.water, 'watered');
      toast('Watered — nice one.');
      await refreshPlants();
      renderTodo();
    });
  });
}

/* --------------------------------------------------------------- add plant */

async function renderAdd() {
  const draft = state.draft;

  view.innerHTML = `
    <h1>Add a plant</h1>

    <div class="card">
      <h2>📷 The photo</h2>
      <p class="muted small">One clear photo of the leaves is usually enough. A flower, the bark, or a wider shot of the whole plant helps a lot.</p>
      <label for="photo-input" class="dropzone" style="display:block; cursor:pointer">
        <span class="big" aria-hidden="true">📷</span>
        Take a photo or choose from your library
      </label>
      <input type="file" id="photo-input" accept="image/*" multiple hidden />
      <div class="previews" id="previews">
        ${draft.images
          .map(
            (image, index) => `
          <figure>
            <img src="${esc(image.dataUrl)}" alt="Photo ${index + 1}" />
            <button data-remove="${index}" aria-label="Remove photo ${index + 1}">✕</button>
          </figure>`,
          )
          .join('')}
      </div>

      <label for="notes">Anything you already know (optional)</label>
      <textarea id="notes" placeholder="Where it's growing, how big it is, when it flowers, what the leaves smell like…">${esc(draft.notes)}</textarea>
    </div>

    ${
      state.identificationAvailable
        ? `<div class="card">
      <h2>⚡ Identify automatically</h2>
      <p class="muted small">Sends the photo straight to Claude and fills everything in. Costs a few pence of API credit.</p>
      ${draft.error ? `<div class="callout danger"><strong>That didn't work</strong>${esc(draft.error)}</div>` : ''}
      ${
        needsAccessCode()
          ? `<div class="callout"><strong>Access code needed</strong>This is the paid route, so it's locked. Enter your code once in <a href="#/settings">Settings</a> and it's remembered on this device.</div>`
          : ''
      }
      ${
        draft.busy
          ? `<div class="working"><span class="spinner"></span> Looking closely at your photo and writing the care notes… this takes a few moments.</div>`
          : `<button class="primary button-block" id="identify" ${draft.images.length === 0 || needsAccessCode() ? 'disabled' : ''}>Identify and add</button>`
      }
    </div>`
        : ''
    }

    <div class="card">
      <h2>💬 Use the Claude app</h2>
      <p class="muted small">Free with your Claude subscription. Takes about half a minute.</p>
      <ol class="steps">
        <li>
          <strong>Copy the prompt.</strong>
          <div class="button-row" style="margin-top:6px">
            <button id="copy-prompt">📋 Copy the prompt</button>
            ${draft.images.length ? '<button id="share-photo">📤 Send photo to Claude</button>' : ''}
          </div>
          ${
            draft.showPromptText
              ? `<p class="small muted" style="margin-top:8px">Your browser wouldn't let me use the clipboard — select all of this and copy it by hand:</p>
                 <textarea id="prompt-text" rows="6" readonly>${esc(buildPromptForDraft())}</textarea>`
              : ''
          }
        </li>
        <li><strong>Open the Claude app</strong>, paste the prompt, and attach the photo${draft.images.length > 1 ? 's' : ''}.</li>
        <li><strong>Copy the whole reply</strong> and paste it back here.</li>
      </ol>

      <label for="paste">Claude's reply</label>
      <textarea id="paste" placeholder="Paste the JSON here…">${esc(draft.paste)}</textarea>
      ${draft.pasteError ? `<div class="callout danger"><strong>Couldn't read that</strong>${esc(draft.pasteError)}</div>` : ''}
      <div class="button-row" style="margin-top:10px">
        <button class="primary button-block" id="save-pasted" ${draft.paste.trim() ? '' : 'disabled'}>Add to library</button>
      </div>
    </div>

    <div class="card">
      <h2>📖 From the built-in library</h2>
      <p class="muted small">${BUILT_IN_PLANTS.length} common garden plants with full care notes, no connection needed.</p>
      <input type="search" id="builtin-search" placeholder="Search built-in plants" aria-label="Search built-in plants" />
      <div class="result-list" id="builtin-results" style="margin-top:10px"></div>
    </div>`;

  const input = document.getElementById('photo-input');
  if (input) {
    input.addEventListener('change', async (event) => {
      const files = [...event.target.files];
      event.target.value = '';
      for (const file of files.slice(0, 4 - draft.images.length)) {
        try {
          draft.images.push(await fileToImage(file));
        } catch {
          toast("Couldn't read that image.", 'error');
        }
      }
      draft.error = '';
      renderAdd();
    });
  }

  view.querySelectorAll('[data-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      draft.images.splice(Number(button.dataset.remove), 1);
      renderAdd();
    });
  });

  const notes = document.getElementById('notes');
  if (notes) notes.addEventListener('input', (event) => (draft.notes = event.target.value));

  const identify = document.getElementById('identify');
  if (identify) identify.addEventListener('click', identifyDraft);

  document.getElementById('copy-prompt')?.addEventListener('click', async () => {
    const copied = await copyText(buildPromptForDraft());
    if (copied) {
      toast('Prompt copied. Now paste it into the Claude app.');
    } else {
      draft.showPromptText = true;
      renderAdd();
    }
  });

  document.getElementById('share-photo')?.addEventListener('click', async () => {
    const shared = await sharePhotos(draft.images);
    if (!shared) {
      toast('Sharing is not available here — press and hold the photo above to save it, then attach it in Claude.', 'error');
    }
  });

  document.getElementById('paste')?.addEventListener('input', (event) => {
    draft.paste = event.target.value;
    const saveButton = document.getElementById('save-pasted');
    if (saveButton) saveButton.disabled = draft.paste.trim() === '';
  });

  document.getElementById('save-pasted')?.addEventListener('click', savePastedDraft);

  const builtinSearch = document.getElementById('builtin-search');
  const results = document.getElementById('builtin-results');
  const drawBuiltIn = () => {
    const found = findBuiltIn(builtinSearch.value);
    results.innerHTML = found.length
      ? found
          .map(
            (plant, index) =>
              `<button data-builtin="${index}"><span>${esc(plant.commonName)}<br /><span class="latin">${esc(plant.scientificName)}</span></span></button>`,
          )
          .join('')
      : '<p class="muted small">No match. Try a photo instead.</p>';
    results.querySelectorAll('[data-builtin]').forEach((button) => {
      button.addEventListener('click', async () => {
        const profile = found[Number(button.dataset.builtin)];
        const id = await savePlant({ profile: { ...profile, confidence: 'high', isPlant: true }, photos: [], source: 'built-in' });
        toast(`${profile.commonName} added to your library.`);
        location.hash = `#/plant/${id}`;
      });
    });
  };
  builtinSearch.addEventListener('input', drawBuiltIn);
  drawBuiltIn();
}

function buildPromptForDraft() {
  return buildPasteablePrompt({
    hasPhotos: state.draft.images.length > 0,
    notes: state.draft.notes,
    context: { hemisphere: state.settings.hemisphere, location: state.settings.location },
  });
}

async function savePastedDraft() {
  const draft = state.draft;
  draft.pasteError = '';

  let profile;
  try {
    profile = parsePastedProfile(draft.paste);
  } catch (error) {
    draft.pasteError = error.message;
    renderAdd();
    return;
  }

  if (profile.isPlant === false) {
    draft.pasteError = `Claude couldn't see a plant in that photo. ${profile.identificationNotes ?? ''}`.trim();
    renderAdd();
    return;
  }

  const id = await savePlant({
    profile,
    photos: draft.images.map((image) => image.dataUrl),
    source: 'claude-app',
    notes: draft.notes,
  });

  state.draft = emptyDraft();
  toast(`${profile.commonName} added to your library.`);
  location.hash = `#/plant/${id}`;
}

async function fileToImage(file) {
  // Downscale before upload: the model doesn't need 12 megapixels, and this keeps
  // the request (and the copy we store in IndexedDB) a sensible size.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const maxEdge = 1400;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg' };
}

async function identifyDraft() {
  const draft = state.draft;
  draft.busy = true;
  draft.error = '';
  renderAdd();

  try {
    const response = await fetch('api/identify', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        images: draft.images.map((image) => ({ data: image.base64, mediaType: image.mediaType })),
        notes: draft.notes,
        context: { hemisphere: state.settings.hemisphere, location: state.settings.location },
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'Something went wrong.');

    const profile = payload.profile;
    if (profile.isPlant === false) {
      draft.busy = false;
      draft.error = `I can't see a plant in that photo. ${profile.identificationNotes ?? ''}`.trim();
      renderAdd();
      return;
    }

    const id = await savePlant({
      profile,
      photos: draft.images.map((image) => image.dataUrl),
      source: 'claude',
      notes: draft.notes,
    });

    state.draft = emptyDraft();
    toast(`${profile.commonName} added to your library.`);
    location.hash = `#/plant/${id}`;
  } catch (error) {
    draft.busy = false;
    draft.error = error.message;
    renderAdd();
  }
}

async function savePlant({ profile, photos, source, notes = '' }) {
  const record = {
    id: newId(),
    addedAt: new Date().toISOString(),
    nickname: '',
    where: '',
    notes,
    photos,
    source,
    profile,
    log: [],
  };
  await plants.put(record);
  await refreshPlants();
  return record.id;
}

async function addLogEntry(plantId, kind, text = '') {
  const plant = await plants.get(plantId);
  if (!plant) return;
  plant.log = plant.log ?? [];
  plant.log.push({ id: newId(), date: new Date().toISOString(), kind, text });
  await plants.put(plant);
}

/* ------------------------------------------------------------ plant detail */

function factList(rows) {
  const kept = rows.filter(([, value]) => value && String(value).trim());
  if (kept.length === 0) return '';
  return `<dl class="facts">${kept.map(([term, value]) => `<dt>${esc(term)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>`;
}

function section(title, icon, body, { open = false } = {}) {
  if (!body || !body.trim()) return '';
  return `<details class="section" ${open ? 'open' : ''}>
    <summary><span aria-hidden="true">${icon}</span>${esc(title)}</summary>
    <div class="section-body">${body}</div>
  </details>`;
}

function calendarStrip(profile, hemisphere) {
  const marks = yearAtAGlance(profile, hemisphere);
  const nowMonth = new Date().getMonth() + 1;
  const cells = marks
    .map((kinds, index) => {
      const unique = [...new Set(kinds)];
      return `<div class="cell ${index + 1 === nowMonth ? 'now' : ''}">
        <span>${MONTH_NAMES[index].slice(0, 3)}</span>
        ${unique.map((kind) => `<span class="dot ${kind}" title="${kind}"></span>`).join('')}
      </div>`;
    })
    .join('');
  return `
    <div class="calendar">${cells}</div>
    <div class="legend">
      <span><i class="dot prune"></i>prune</span>
      <span><i class="dot feed"></i>feed</span>
      <span><i class="dot plant"></i>plant</span>
      <span><i class="dot propagate"></i>propagate</span>
    </div>`;
}

async function renderPlant(id) {
  const plant = await plants.get(id);
  if (!plant) {
    view.innerHTML = '<div class="empty"><p>That plant is no longer in your library.</p><a class="button" href="#/library">Back to the library</a></div>';
    return;
  }
  const profile = plant.profile ?? {};
  const hemisphere = state.settings.hemisphere;
  const nowMonth = new Date().getMonth() + 1;
  const water = wateringStatus(plant, { hemisphere });
  const todayTasks = tasksForMonth(plant, nowMonth, hemisphere);
  const seasonal = seasonalNote(profile, nowMonth, hemisphere);

  const pills = [];
  if (profile.plantType) pills.push(`<span class="pill">${esc(profile.plantType)}</span>`);
  if (profile.evergreen && profile.evergreen !== 'unknown') pills.push(`<span class="pill">${esc(profile.evergreen)}</span>`);
  if (profile.light?.exposure) pills.push(`<span class="pill">☀️ ${esc(profile.light.exposure)}</span>`);
  if (profile.hardiness?.usdaZones) pills.push(`<span class="pill">❄️ zones ${esc(profile.hardiness.usdaZones)}</span>`);
  if (profile.confidence && profile.confidence !== 'high') {
    pills.push(`<span class="pill warn">${esc(profile.confidence)} confidence</span>`);
  }
  const petsUnsafe = profile.toxicity?.toPets && profile.toxicity.toPets !== 'safe' && profile.toxicity.toPets !== 'unknown';
  if (petsUnsafe) pills.push(`<span class="pill alert">⚠️ ${esc(profile.toxicity.toPets)} to pets</span>`);

  view.innerHTML = `
    ${plant.photos?.[0] ? `<div class="hero"><img src="${esc(plant.photos[0])}" alt="${esc(displayName(plant))}" /></div>` : ''}

    <h1>${esc(displayName(plant))}</h1>
    <p class="muted" style="font-style:italic; margin-top:-6px">${esc(profile.scientificName ?? '')}${profile.family ? ` · ${esc(profile.family)}` : ''}</p>
    <div class="pill-row">${pills.join('')}</div>

    ${plant.photos?.length > 1 ? `<div class="photo-strip">${plant.photos.slice(1).map((photo) => `<img src="${esc(photo)}" alt="" />`).join('')}</div>` : ''}

    ${profile.summary ? `<div class="card">${paras(profile.summary)}</div>` : ''}

    <div class="card">
      <h2>Right now</h2>
      ${
        water && water.interval > 0
          ? `<p class="${water.overdue ? '' : 'muted'}">💧 ${
              water.lastWatered
                ? `Watered ${esc(relativeDays(water.daysSince))}. ${water.overdue ? '<strong>Due a drink.</strong>' : `Next in about ${water.dueInDays} day${water.dueInDays === 1 ? '' : 's'}.`}`
                : `Water roughly every ${water.interval} days at this time of year.`
            }</p>`
          : water
            ? '<p class="muted">💧 Dormant — little or no watering needed just now.</p>'
            : ''
      }
      ${
        todayTasks.length
          ? todayTasks
              .map(
                (task) =>
                  `<p><strong>${task.icon} ${esc(task.title)}</strong><br /><span class="small">${esc(task.detail ?? '')}</span></p>`,
              )
              .join('')
          : `<p class="muted small">No calendar jobs due in ${monthLabel(nowMonth)}.</p>`
      }
      ${seasonal.text ? `<p class="small"><strong>${esc(seasonal.season)}:</strong> ${esc(seasonal.text)}</p>` : ''}
      <div class="button-row" style="margin-top:10px">
        <button data-log="watered">💧 Watered</button>
        <button data-log="fed">🧪 Fed</button>
        <button data-log="pruned">✂️ Pruned</button>
        <button data-log="note">📝 Note</button>
      </div>
    </div>

    <div class="card">
      <h2>The year at a glance</h2>
      ${calendarStrip(profile, hemisphere)}
    </div>

    ${section(
      'Pruning',
      '✂️',
      [
        factList([
          ['When', monthsLabel(profile.pruning?.months, hemisphere)],
          ['How much', profile.pruning?.howMuch],
          ['Tools', profile.pruning?.tools],
        ]),
        profile.pruning?.why ? `<p class="muted small">${esc(profile.pruning.why)}</p>` : '',
        paras(profile.pruning?.howTo),
        profile.pruning?.cautions ? `<div class="callout"><strong>Don't get this wrong</strong>${esc(profile.pruning.cautions)}</div>` : '',
        profile.pruning?.deadheading ? `<p><strong>Deadheading.</strong> ${esc(profile.pruning.deadheading)}</p>` : '',
      ].join(''),
      { open: true },
    )}

    ${section(
      'Feeding',
      '🧪',
      [
        factList([
          ['When', monthsLabel(profile.feeding?.months, hemisphere)],
          ['How often', profile.feeding?.howOften],
          ['What', profile.feeding?.what],
          ['NPK', profile.feeding?.npk],
        ]),
        paras(profile.feeding?.howToApply),
        profile.feeding?.cautions ? `<div class="callout"><strong>Careful</strong>${esc(profile.feeding.cautions)}</div>` : '',
      ].join(''),
      { open: true },
    )}

    ${section(
      'Watering',
      '💧',
      [
        factList([
          ['Growing season', profile.watering?.intervalDaysGrowing ? `about every ${profile.watering.intervalDaysGrowing} days` : ''],
          ['Dormant', profile.watering?.intervalDaysDormant ? `about every ${profile.watering.intervalDaysDormant} days` : 'little or none'],
          ['How much', profile.watering?.howMuch],
        ]),
        profile.watering?.signsOfThirst ? `<p><strong>Too dry:</strong> ${esc(profile.watering.signsOfThirst)}</p>` : '',
        profile.watering?.signsOfOverwatering ? `<p><strong>Too wet:</strong> ${esc(profile.watering.signsOfOverwatering)}</p>` : '',
      ].join(''),
    )}

    ${section(
      'Where it likes to be',
      '📍',
      [
        factList([
          ['Light', profile.light?.exposure],
          ['Soil', profile.soil?.type],
          ['pH', profile.soil?.ph],
          ['Drainage', profile.soil?.drainage],
          ['Hardiness', [profile.hardiness?.usdaZones && `USDA ${profile.hardiness.usdaZones}`, profile.hardiness?.rhsRating, profile.hardiness?.minTempC].filter(Boolean).join(' · ')],
          [
            'Size',
            profile.matureSize?.height
              ? `${profile.matureSize.height} tall${profile.matureSize.spread ? `, ${profile.matureSize.spread} wide` : ''}`
              : '',
          ],
        ]),
        profile.light?.notes ? `<p>${esc(profile.light.notes)}</p>` : '',
        profile.soil?.notes ? `<p>${esc(profile.soil.notes)}</p>` : '',
        profile.hardiness?.notes ? `<p>${esc(profile.hardiness.notes)}</p>` : '',
      ].join(''),
    )}

    ${section(
      'Planting and repotting',
      '🌱',
      [
        factList([
          ['Best months', monthsLabel(profile.planting?.bestMonths, hemisphere)],
          ['Spacing', profile.planting?.spacing],
          ['Depth', profile.planting?.depth],
        ]),
        paras(profile.planting?.howTo),
        profile.planting?.containerAdvice ? `<p><strong>In a pot.</strong> ${esc(profile.planting.containerAdvice)}</p>` : '',
        profile.planting?.repotting ? `<p><strong>Repotting.</strong> ${esc(profile.planting.repotting)}</p>` : '',
      ].join(''),
    )}

    ${section(
      'Making more of it',
      '🪴',
      (profile.propagation ?? [])
        .map(
          (method) => `
        <h3>${esc(method.method)} <span class="pill">${esc(method.difficulty)}</span></h3>
        <p class="muted small">${esc(monthsLabel(method.months, hemisphere))}</p>
        ${paras(method.howTo)}`,
        )
        .join(''),
    )}

    ${section(
      'What can go wrong',
      '🐛',
      (profile.problems ?? [])
        .map(
          (problem) => `
        <h3>${esc(problem.name)} <span class="pill">${esc(problem.kind)}</span></h3>
        <p><strong>Signs:</strong> ${esc(problem.signs)}</p>
        <p><strong>What to do:</strong> ${esc(problem.whatToDo)}</p>
        <p class="muted small"><strong>Prevention:</strong> ${esc(problem.prevention)}</p>`,
        )
        .join(''),
    )}

    ${section(
      'Season by season',
      '🍂',
      ['spring', 'summer', 'autumn', 'winter']
        .filter((season) => profile.seasonalCare?.[season])
        .map((season) => `<h3>${season[0].toUpperCase()}${season.slice(1)}</h3>${paras(profile.seasonalCare[season])}`)
        .join(''),
    )}

    ${section(
      'Safety and good neighbours',
      '⚠️',
      [
        factList([
          ['To people', profile.toxicity?.toPeople],
          ['To pets', profile.toxicity?.toPets],
        ]),
        profile.toxicity?.notes ? `<p>${esc(profile.toxicity.notes)}</p>` : '',
        (profile.companions ?? []).length
          ? `<h3>Grows well with</h3><ul class="tips">${profile.companions.map((companion) => `<li><strong>${esc(companion.name)}</strong> — ${esc(companion.why)}</li>`).join('')}</ul>`
          : '',
      ].join(''),
    )}

    ${section(
      "A gardener's tips",
      '💡',
      (profile.quickTips ?? []).length ? `<ul class="tips">${profile.quickTips.map((tip) => `<li>${esc(tip)}</li>`).join('')}</ul>` : '',
      { open: true },
    )}

    ${section(
      'How it was identified',
      '🔍',
      [
        factList([
          ['Confidence', profile.confidence],
          ['Added', formatDate(plant.addedAt)],
          [
            'Source',
            { claude: 'From your photo', 'claude-app': 'From your photo, via the Claude app', 'built-in': 'Built-in library' }[
              plant.source
            ] ?? 'Added by hand',
          ],
        ]),
        paras(profile.identificationNotes),
        (profile.alternatives ?? []).length
          ? `<h3>Could also be</h3><ul class="tips">${profile.alternatives.map((alt) => `<li><strong>${esc(alt.name)}</strong> — ${esc(alt.howToTellApart)}</li>`).join('')}</ul>`
          : '',
      ].join(''),
    )}

    ${section(
      'Your notes and history',
      '📓',
      `
      <label for="nickname">Name it something</label>
      <input type="text" id="nickname" value="${esc(plant.nickname)}" placeholder="${esc(profile.commonName ?? 'My plant')}" />
      <label for="where">Where it lives</label>
      <input type="text" id="where" value="${esc(plant.where)}" placeholder="Back border, west wall, kitchen windowsill…" />
      <label for="plant-notes">Notes</label>
      <textarea id="plant-notes" placeholder="Anything you want to remember about this one.">${esc(plant.notes ?? '')}</textarea>
      <div class="button-row" style="margin-top:10px"><button id="save-notes">Save</button></div>
      ${
        (plant.log ?? []).length
          ? `<h3 style="margin-top:16px">History</h3>${[...plant.log]
              .reverse()
              .map(
                (entry) =>
                  `<div class="log-entry"><span class="when">${esc(formatDate(entry.date))}</span><span>${esc(entry.kind)}${entry.text ? ` — ${esc(entry.text)}` : ''}</span></div>`,
              )
              .join('')}`
          : ''
      }`,
    )}

    <div class="card">
      <h2>Ask about this plant</h2>
      <textarea id="question" placeholder="Its leaves are going yellow from the bottom — what's happening?"></textarea>
      <div class="button-row" style="margin-top:10px">
        ${state.identificationAvailable ? '<button id="ask" class="primary">Ask</button>' : ''}
        <button id="copy-question">📋 Copy for the Claude app</button>
      </div>
      <p class="muted small" style="margin-top:8px">“Copy for the Claude app” puts the question and this plant's care notes on your clipboard, so you can paste them into Claude and read the answer there — free with your subscription.</p>
      <div id="answer" class="answer"></div>
    </div>

    <div class="button-row" style="margin: 18px 0 8px">
      <a class="button" href="#/library">← Library</a>
      <button class="button-danger" id="delete-plant">Remove from library</button>
    </div>`;

  view.querySelectorAll('[data-log]').forEach((button) => {
    button.addEventListener('click', async () => {
      const kind = button.dataset.log;
      let text = '';
      if (kind === 'note') {
        text = prompt('What happened?') ?? '';
        if (!text.trim()) return;
      }
      await addLogEntry(plant.id, kind, text);
      await refreshPlants();
      toast(kind === 'note' ? 'Noted.' : `Logged: ${kind}.`);
      renderPlant(plant.id);
    });
  });

  document.getElementById('save-notes')?.addEventListener('click', async () => {
    const fresh = await plants.get(plant.id);
    fresh.nickname = document.getElementById('nickname').value.trim();
    fresh.where = document.getElementById('where').value.trim();
    fresh.notes = document.getElementById('plant-notes').value;
    await plants.put(fresh);
    await refreshPlants();
    toast('Saved.');
    renderPlant(plant.id);
  });

  document.getElementById('delete-plant')?.addEventListener('click', async () => {
    if (!confirm(`Remove ${displayName(plant)} from your library? This can't be undone.`)) return;
    await plants.remove(plant.id);
    await refreshPlants();
    toast('Removed.');
    location.hash = '#/library';
  });

  document.getElementById('copy-question')?.addEventListener('click', async () => {
    const question = document.getElementById('question').value.trim();
    if (!question) {
      toast('Type your question first.', 'error');
      return;
    }
    const text = [
      "Here are my plant's care notes, from my garden app:",
      '',
      JSON.stringify(profile, null, 2),
      '',
      plant.where ? `It's growing: ${plant.where}.` : '',
      state.settings.location ? `I garden in: ${state.settings.location}.` : '',
      '',
      `My question: ${question}`,
      '',
      'Answer in a few short paragraphs of practical advice. If it depends on something you cannot see, tell me what to check.',
    ]
      .filter((line) => line !== undefined)
      .join('\n');
    const copied = await copyText(text);
    toast(copied ? 'Copied — paste it into the Claude app.' : "Couldn't reach the clipboard.", copied ? '' : 'error');
  });

  const ask = document.getElementById('ask');
  ask?.addEventListener('click', async () => {
    const question = document.getElementById('question').value.trim();
    if (!question) return;
    const answer = document.getElementById('answer');
    ask.disabled = true;
    answer.innerHTML = '<div class="working"><span class="spinner"></span> Thinking…</div>';
    try {
      const response = await fetch('api/ask', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          question,
          plant: { profile, nickname: plant.nickname, where: plant.where, notes: plant.notes, log: plant.log },
          context: { hemisphere, location: state.settings.location },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Something went wrong.');
      answer.innerHTML = paras(payload.answer);
    } catch (error) {
      answer.innerHTML = `<div class="callout danger"><strong>Couldn't answer</strong>${esc(error.message)}</div>`;
    } finally {
      ask.disabled = false;
    }
  });
}

/* ---------------------------------------------------------------- settings */

async function renderSettings() {
  view.innerHTML = `
    <h1>Settings</h1>

    <div class="card">
      <h2>Your garden</h2>
      <label for="hemisphere">Hemisphere</label>
      <select id="hemisphere">
        <option value="north" ${state.settings.hemisphere === 'north' ? 'selected' : ''}>Northern</option>
        <option value="south" ${state.settings.hemisphere === 'south' ? 'selected' : ''}>Southern</option>
      </select>
      <p class="muted small">Care months are written for the northern hemisphere and shifted by six months for southern gardens.</p>

      <label for="location">Where you garden (optional)</label>
      <input type="text" id="location" value="${esc(state.settings.location)}" placeholder="Devon, UK · USDA zone 8b · Melbourne" />
      <p class="muted small">Passed along when identifying a plant, so the advice suits your climate.</p>
      ${
        state.accessCodeRequired
          ? `<label for="access-code">Access code</label>
             <input type="text" id="access-code" value="${esc(state.settings.accessCode)}" placeholder="The code you set on the server" autocomplete="off" autocapitalize="none" spellcheck="false" />
             <p class="muted small">Automatic identification is locked so that nobody who stumbles on the address can spend your API credit. Enter the code once per device.</p>`
          : ''
      }
      <div class="button-row" style="margin-top:10px"><button id="save-settings" class="primary">Save</button></div>
    </div>

    <div class="card">
      <h2>Your data</h2>
      <p class="muted small">Everything — plants, photos, notes — is stored in this browser only. Nothing is uploaded except the photo you ask to identify. Back it up before clearing your browser data or switching device.</p>
      <div class="button-row">
        <button id="export">Download backup</button>
        <label class="button" for="import-file" style="margin:0">Restore backup</label>
        <input type="file" id="import-file" accept="application/json" hidden />
      </div>
      <p class="muted small" style="margin-top:12px">${state.plants.length} plant${state.plants.length === 1 ? '' : 's'} stored.</p>
    </div>

    <div class="card">
      <h2>Connection</h2>
      <dl class="facts">
        <dt>Address</dt><dd>${esc(location.host || 'local file')}${
          /github\.io$/i.test(location.host) ? ' — the free paste-only copy' : ''
        }</dd>
        <dt>Server</dt><dd>${state.serverStatus.reachable ? '✅ reachable' : '⚠️ not reachable — this address serves the app only'}</dd>
        <dt>Identification</dt><dd>${state.identificationAvailable ? '✅ on' : '⚠️ off — no API key on the server'}</dd>
        <dt>Access code</dt><dd>${
          state.accessCodeRequired
            ? state.settings.accessCode
              ? '✅ required, and set on this device'
              : '⚠️ required, but not set on this device'
            : 'not required'
        }</dd>
        ${state.serverStatus.model ? `<dt>Model</dt><dd>${esc(state.serverStatus.model)}</dd>` : ''}
      </dl>
      <p class="muted small">Checked when the app started. Pull down to reload the page if you have just changed something on the server.</p>
    </div>

    <div class="card">
      <h2>Photo identification</h2>
      <p>${
        state.identificationAvailable
          ? '✅ Switched on. Photos are sent to Claude via this app’s own server; your API key stays on the server.'
          : '⚠️ Off. Set <code>ANTHROPIC_API_KEY</code> on the server and restart it to identify plants from photos. The Claude app route and the built-in library work either way.'
      }</p>
      ${
        state.identificationAvailable && !state.accessCodeRequired
          ? '<div class="callout"><strong>No access code set</strong>Anyone who knows this address can spend your API credit. Set <code>ACCESS_CODE</code> on the server if this is deployed anywhere public.</div>'
          : ''
      }
    </div>

    <p class="muted small center">Care notes are a well-informed starting point, not gospel. Your own garden always has the final say — and check twice before eating anything.</p>`;

  document.getElementById('save-settings').addEventListener('click', async () => {
    state.settings.hemisphere = document.getElementById('hemisphere').value;
    state.settings.location = document.getElementById('location').value.trim();
    await settings.set('hemisphere', state.settings.hemisphere);
    await settings.set('location', state.settings.location);

    const codeField = document.getElementById('access-code');
    if (codeField) {
      state.settings.accessCode = codeField.value.trim();
      await settings.set('accessCode', state.settings.accessCode);
    }

    updateTodoBadge();
    toast('Saved.');
    renderSettings();
  });

  document.getElementById('export').addEventListener('click', async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `garden-library-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('import-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      const added = await importAll(JSON.parse(await file.text()));
      await refreshPlants();
      toast(`Restored ${added} plant${added === 1 ? '' : 's'}.`);
      renderSettings();
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

/* -------------------------------------------------------------------- boot */

async function boot() {
  const stored = await settings.all();
  state.settings = { hemisphere: 'north', location: '', accessCode: '', ...stored };

  try {
    const response = await fetch('api/status');
    if (response.ok) {
      const status = await response.json();
      state.identificationAvailable = Boolean(status.identificationAvailable);
      state.accessCodeRequired = Boolean(status.accessCodeRequired);
      state.serverStatus = {
        checked: true,
        reachable: true,
        model: status.model ?? '',
      };
    } else {
      state.serverStatus = { checked: true, reachable: false, model: '' };
    }
  } catch {
    // Offline: the built-in library and everything already saved still work.
    state.identificationAvailable = false;
    state.serverStatus = { checked: true, reachable: false, model: '' };
  }

  await refreshPlants();
  await route();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot().catch((error) => {
  console.error(error);
  view.innerHTML = `<div class="empty"><p>Something went wrong starting up: ${esc(error.message)}</p></div>`;
});
