(() => {
  const config = window.IMC_GAME_WORLD || {};
  const gameWorldId = String(config.id || config.gameWorldId || '').trim().toUpperCase() || null;

  const CORE_RESOURCES = Object.freeze([
    'game_world_codex',
    'game_world_club_mapping',
    'competition_codex',
    'country_codex',
    'national_team_codex',
    'club_codex',
    'manager_codex',
    'manager_assignments',
    'player_codex',
    'player_data',
    'rating_history'
  ]);

  const SITE_RESOURCES = Object.freeze([
    'results',
    'schedule',
    'match_report',
    'transfers',
    'sm_player_stats'
  ]);

  const RESOURCES = Object.freeze([...CORE_RESOURCES, ...SITE_RESOURCES]);
  const RESOURCE_SET = new Set(RESOURCES);
  const ALLOWED_PARAMS = new Set([
    'game_world_id',
    'club_id',
    'manager_id',
    'player_id',
    'limit',
    'offset',
    'search'
  ]);

  async function minisiteRead(resource, params = {}) {
    const normalizedResource = String(resource || '').trim().toLowerCase();
    if (!RESOURCE_SET.has(normalizedResource)) {
      throw new Error(`IMC minisite resource non consentita: ${normalizedResource || '(vuota)'}`);
    }

    if (!params || typeof params !== 'object' || Array.isArray(params)) {
      throw new Error('IMC minisite params non validi');
    }

    const payload = {
      channel: 'MINISITE',
      action: 'minisite_read',
      resource: normalizedResource
    };

    for (const [key, value] of Object.entries(params)) {
      if (!ALLOWED_PARAMS.has(key)) {
        throw new Error(`IMC minisite parametro non consentito: ${key}`);
      }
      if (value !== undefined) payload[key] = value;
    }

    if (!Object.prototype.hasOwnProperty.call(payload, 'game_world_id') && gameWorldId) {
      payload.game_world_id = gameWorldId;
    }

    const response = await fetch('/imc-universal-gateway/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(`IMC minisite risposta Gateway non valida (${response.status})`);
    }

    if (!response.ok || !data?.ok) {
      const error = data?.error || data?.message || `HTTP ${response.status}`;
      throw new Error(`IMC minisite Gateway: ${error}`);
    }

    return data;
  }

  window.IMC_MINISITE_DATA = Object.freeze({
    read: minisiteRead,
    resources: RESOURCES,
    coreResources: CORE_RESOURCES,
    siteResources: SITE_RESOURCES,
    gameWorldId
  });

  const root = document.getElementById('app');
  if (!root) return;

  const worldName = config.name || config.gameWorldId || config.id || 'Game word';
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const current = pathParts.length > 1 ? pathParts[1].toLowerCase() : '';

  const modules = [
    ['competitions', 'COMPETITIONS'],
    ['results', 'RESULTS'],
    ['calendar', 'CALENDAR'],
    ['team-hub', 'TEAM HUB'],
    ['managers', 'MANAGERS'],
    ['trophy-room', 'TROPHY ROOM'],
    ['codex', 'CODEX'],
    ['transfers', 'TRANSFERS']
  ];

  const known = new Map(modules);
  document.title = worldName;

  function renderHome() {
    const shell = document.createElement('div');
    shell.className = 'gw-shell';

    const header = document.createElement('header');
    header.className = 'gw-header';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'gw-eyebrow';
    eyebrow.textContent = 'ITALIAN MASTERS CLUB';
    const title = document.createElement('h1');
    title.textContent = worldName;
    header.append(eyebrow, title);

    const grid = document.createElement('nav');
    grid.className = 'gw-grid';
    grid.setAttribute('aria-label', 'Game World');

    modules.forEach(([slug, label]) => {
      const card = document.createElement('a');
      card.className = `gw-card gw-card--${slug}`;
      card.href = `./${slug}/`;
      const text = document.createElement('span');
      text.className = 'gw-card__label';
      text.textContent = label;
      const arrow = document.createElement('span');
      arrow.className = 'gw-card__arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '›';
      card.append(text, arrow);
      grid.append(card);
    });

    shell.append(header, grid);
    root.replaceChildren(shell);
  }

  function renderPlaceholder(slug) {
    const shell = document.createElement('div');
    shell.className = 'gw-shell gw-shell--page';
    const back = document.createElement('a');
    back.className = 'gw-back';
    back.href = '../';
    back.textContent = '‹';
    back.setAttribute('aria-label', 'Torna alla home');

    const page = document.createElement('main');
    page.className = 'gw-page';
    const world = document.createElement('span');
    world.className = 'gw-eyebrow';
    world.textContent = worldName;
    const title = document.createElement('h1');
    title.textContent = known.get(slug) || '';
    page.append(world, title);
    shell.append(back, page);
    root.replaceChildren(shell);
  }

  if (!current || !known.has(current)) renderHome();
  else renderPlaceholder(current);
})();
