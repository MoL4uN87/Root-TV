(function () {
  'use strict';
  var model = window.SeenaModel;
  var history = window.SeenaHistory;
  var state = {
    view: 'catalog', catalog: 'all_movies', catalogs: {}, items: [], offset: 0,
    hasMore: false, loading: false, detail: null, detailItem: null, detailTrigger: null, sources: [], season: null,
    torrentsLoaded: false, personTrigger: null, playerSource: null, osdTimer: null, historyPending: null,
    searchItems: [], searchQuery: '', searchSort: 'popular', searchFilters: { genre: '', country: '', years: '', rating: 0 }, searchEnriching: false,
    kzLoaded: false, kzLoadedAt: 0, kzLoading: false, kzLoggedIn: false, kzPage: 0, kzLastPage: 0, kzItems: [], kzDetail: null, kzDetailTrigger: null,
    kzSearchPage: 0, kzSearchLastPage: 0, kzSearchQuery: '', kzSearchItems: [], kzSearchTrigger: null, kzSearchLoading: false,
    kzFilters: { category: '0', year: '0', country: '0', format: '0', period: '0', sort: '0', genre: '' },
    sportLoadedAt: 0, sportItems: [], sportNetworkActive: false, sportNetworkTimer: null,
    sportNetworkStart: null, sportNetworkRestore: null, webPlayerTrigger: null
  };
  var $ = function (id) { return document.getElementById(id); };
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  var toastTimer;

  function toast(message) {
    var el = $('toast'); el.textContent = message; el.classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.remove('visible'); }, 4500);
  }
  function safeImage(url) { return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : ''; }
  function setImage(img, url) {
    url = safeImage(url); if (!url) return; img.src = url;
    img.onerror = function () {
      if (img.src.indexOf('image.tmdb.org') !== -1) { img.onerror = null; img.src = img.src.replace('image.tmdb.org', 'imagetmdb.com'); }
    };
  }
  function showBase(view) {
    var leavingSport = state.view === 'sport' && view !== 'sport';
    state.view = view;
    $('catalog-view').hidden = view !== 'catalog'; $('search-view').hidden = view !== 'search'; $('kinozal-view').hidden = view !== 'kinozal'; $('history-view').hidden = view !== 'history';
    $('tv-view').hidden = view !== 'tv'; $('sport-view').hidden = view !== 'sport';
    $('history-open').classList.toggle('active', view === 'history');
    $('tv-open').classList.toggle('active', view === 'tv'); $('sport-open').classList.toggle('active', view === 'sport');
    $('detail-view').hidden = true; $('kinozal-detail-view').hidden = true; $('person-view').hidden = true; $('player-view').hidden = true; closeWebPlayer();
    if (leavingSport) restoreSportNetwork().catch(function () {});
    window.scrollTo(0, 0);
  }
  function makeButton(label, className, action) {
    var b = document.createElement('button'); b.type = 'button'; b.className = className + ' focusable';
    b.textContent = label; b.addEventListener('click', action); return b;
  }
  function formatRuntime(minutes) {
    minutes = Number(minutes) || 0; if (!minutes) return '';
    if (minutes < 60) return minutes + ' мин';
    return Math.floor(minutes / 60) + ' ч ' + (minutes % 60 ? (minutes % 60) + ' мин' : '');
  }
  function formatVotes(value) {
    value = Number(value) || 0; if (!value) return '';
    if (value >= 1000000) return (value / 1000000).toFixed(1) + ' млн';
    if (value >= 1000) return Math.round(value / 1000) + ' тыс.'; return String(value);
  }
  function formatTime(seconds) {
    seconds = Number(seconds) || 0; if (seconds < 0) seconds = 0;
    var h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.floor(seconds % 60);
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(s).padStart(2, '0');
  }
  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  function favoriteKey(id) { return 'seena.webos.favorite.' + id; }
  function isFavorite(id) { return localStorage.getItem(favoriteKey(id)) === '1'; }
  function updateFavoriteButton() {
    if (!state.detailItem) return; var active = isFavorite(state.detailItem.id);
    $('favorite-toggle').textContent = active ? '♥ В избранном' : '♡ В избранное';
    $('favorite-toggle').classList.toggle('favorite-active', active);
  }
  function toggleFavorite() {
    if (!state.detailItem) return; var key = favoriteKey(state.detailItem.id);
    if (isFavorite(state.detailItem.id)) localStorage.removeItem(key); else localStorage.setItem(key, '1');
    updateFavoriteButton(); toast(isFavorite(state.detailItem.id) ? 'Добавлено в избранное' : 'Удалено из избранного');
  }

  function renderNav() {
    var nav = $('catalog-nav'); clear(nav);
    Object.keys(state.catalogs).forEach(function (name) {
      nav.appendChild(makeButton(state.catalogs[name], 'nav-item' + (name === state.catalog ? ' active' : ''), function () {
        showBase('catalog'); loadCatalog(name, false);
      }));
    });
  }
  function renderCard(item, role) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'poster-card focusable';
    var img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; if (safeImage(item.poster)) setImage(img, item.poster);
    var copy = document.createElement('div'); copy.className = 'poster-copy';
    var title = document.createElement('strong'); title.textContent = item.title;
    var meta = document.createElement('small'); var rating = item.rating ? '★ ' + Number(item.rating).toFixed(1) : '';
    meta.textContent = [item.year, item.mediaType === 'tv' ? 'Сериал' : 'Фильм', rating].filter(Boolean).join(' · ');
    copy.append(title, meta);
    if (role) { var rr = document.createElement('span'); rr.className = 'poster-role'; rr.textContent = role; copy.appendChild(rr); }
    b.append(img, copy); b.addEventListener('click', function () { openDetail(item, b); }); return b;
  }
  function renderHero(item) {
    var hero = $('hero'); clear(hero); hero.style.backgroundImage = safeImage(item && item.backdrop) ? 'url("' + item.backdrop.replace(/"/g, '%22') + '")' : '';
    if (!item) return; var wrap = document.createElement('div'); wrap.className = 'hero-inner';
    var title = document.createElement('h2'); title.textContent = item.title; var summary = document.createElement('p'); summary.textContent = item.overview;
    wrap.append(title, summary, makeButton('Подробнее', 'primary', function () { openDetail(item); })); hero.appendChild(wrap);
  }
  async function fetchJson(url, options) {
    var response = await fetch(url, options || { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('HTTP ' + response.status); return response.json();
  }
  async function loadCatalog(name, append) {
    if (state.loading) return; state.loading = true; var offset = append ? state.offset : 0;
    if (!append) { state.catalog = name; state.items = []; clear($('catalog-grid')); $('section-title').textContent = state.catalogs[name] || name; $('section-count').textContent = 'Загрузка…'; renderNav(); }
    $('load-more').hidden = true;
    try {
      var result = await fetchJson(model.catalogUrl(name, offset)); var items = model.catalogItems(result);
      state.items = append ? state.items.concat(items) : items; state.offset = result.next_offset || result.nextOffset || offset + items.length; state.hasMore = Boolean(result.has_more || result.hasMore);
      items.forEach(function (item) { $('catalog-grid').appendChild(renderCard(item)); });
      var count = result.count_available || result.countAvailable || result.count; $('section-count').textContent = count ? Number(count).toLocaleString('ru-RU') + ' доступно' : '';
      $('load-more').hidden = !state.hasMore; if (!append) renderHero(items[0]);
    } catch (error) { $('section-count').textContent = 'Не удалось загрузить каталог'; toast('Каталог недоступен: ' + error.message); }
    finally { state.loading = false; }
  }
  function searchSortLabel(mode) { return mode === 'rating' ? 'Рейтинговые' : mode === 'new' ? 'Новинки' : 'Популярные'; }
  var fallbackGenres = [
    {id:28,name:'боевик'},{id:12,name:'приключения'},{id:16,name:'мультфильм'},{id:35,name:'комедия'},
    {id:80,name:'криминал'},{id:99,name:'документальный'},{id:18,name:'драма'},{id:10751,name:'семейный'},
    {id:14,name:'фэнтези'},{id:36,name:'история'},{id:27,name:'ужасы'},{id:10402,name:'музыка'},
    {id:9648,name:'детектив'},{id:10749,name:'мелодрама'},{id:878,name:'фантастика'},{id:10770,name:'телевизионный фильм'},
    {id:53,name:'триллер'},{id:10752,name:'военный'},{id:37,name:'вестерн'}
  ];
  var countryChoices = [
    {label:'США',value:'US'},{label:'Россия',value:'RU'},{label:'Великобритания',value:'GB'},{label:'Германия',value:'DE'},
    {label:'Франция',value:'FR'},{label:'Италия',value:'IT'},{label:'Испания',value:'ES'},{label:'Канада',value:'CA'},
    {label:'Австралия',value:'AU'},{label:'Япония',value:'JP'},{label:'Южная Корея',value:'KR'},{label:'Китай',value:'CN'},
    {label:'Индия',value:'IN'},{label:'Мексика',value:'MX'},{label:'Бразилия',value:'BR'},{label:'Швеция',value:'SE'},
    {label:'Норвегия',value:'NO'},{label:'Дания',value:'DK'},{label:'Финляндия',value:'FI'},{label:'Польша',value:'PL'},
    {label:'Нидерланды',value:'NL'},{label:'Бельгия',value:'BE'},{label:'Турция',value:'TR'},{label:'Украина',value:'UA'},
    {label:'Казахстан',value:'KZ'},{label:'Аргентина',value:'AR'},{label:'Ирландия',value:'IE'},{label:'Новая Зеландия',value:'NZ'}
  ];
  state.filterGenres = fallbackGenres.slice();
  state.searchTotal = 0; state.searchOffset = 0; state.searchHasMore = false; state.searchMode = 'catalog';

  function genreNameById(id) {
    var found = state.filterGenres.find(function (g) { return String(g.id) === String(id); });
    return found ? found.name : String(id || '');
  }
  function countryNameByCode(code) {
    var found = countryChoices.find(function (c) { return c.value === code; }); return found ? found.label : String(code || '');
  }
  function yearLabel(range) { return range === 'older' ? 'до 2000' : String(range || ''); }
  function filterSummary() {
    var f = state.searchFilters, parts = [];
    if (f.genre) parts.push(genreNameById(f.genre)); if (f.country) parts.push(countryNameByCode(f.country));
    if (f.years) parts.push(yearLabel(f.years)); if (f.rating) parts.push('★ ' + f.rating + '+');
    $('filter-summary').textContent = parts.length ? parts.join(' · ') : 'Без фильтров';
    $('sort-open').textContent = 'Сортировка: ' + searchSortLabel(state.searchSort);
  }
  function buildChoiceRow(id, values, current, setter, allLabel) {
    var row = $(id); clear(row);
    var all = makeButton(allLabel || 'Любой', 'choice-button' + (!current ? ' active' : ''), function () { setter(''); buildFilterChoices(); var a = $(id).querySelector('.choice-button.active'); if (a) a.focus(); }); row.appendChild(all);
    values.forEach(function (value) {
      var actual = value.value !== undefined ? value.value : value, label = value.label || value.name || value;
      var b = makeButton(label, 'choice-button' + (String(current) === String(actual) ? ' active' : ''), function () { setter(actual); buildFilterChoices(); var a = $(id).querySelector('.choice-button.active'); if (a) a.focus(); }); row.appendChild(b);
    });
  }
  function buildFilterChoices() {
    var f = state.searchFilters;
    buildChoiceRow('filter-genres', state.filterGenres.map(function (g) { return {label:g.name.charAt(0).toUpperCase()+g.name.slice(1),value:g.id}; }), f.genre, function (v) { f.genre = v; }, 'Все');
    buildChoiceRow('filter-countries', countryChoices, f.country, function (v) { f.country = v; }, 'Все');
    buildChoiceRow('filter-years', [
      {label:'2026',value:'2026'},{label:'2025',value:'2025'},{label:'2024',value:'2024'},
      {label:'2020–2026',value:'2020-2026'},{label:'2010–2019',value:'2010-2019'},
      {label:'2000–2009',value:'2000-2009'},{label:'До 2000',value:'older'}
    ], f.years, function (v) { f.years = v; }, 'Любые');
    buildChoiceRow('filter-ratings', [{label:'6+',value:6},{label:'7+',value:7},{label:'8+',value:8},{label:'9+',value:9}], f.rating, function (v) { f.rating = Number(v) || 0; }, 'Любой');
  }
  async function loadFilterMetadata() {
    try {
      var result = await fetchJson(model.catalogMetadataUrl());
      if (result && result.genres && Array.isArray(result.genres.movie) && result.genres.movie.length) state.filterGenres = result.genres.movie;
    } catch (_) {}
    buildFilterChoices();
  }
  function openFilterDialog() {
    $('filter-dialog').hidden = false; buildFilterChoices();
    var first = $('filter-genres').querySelector('button'); if (first) first.focus();
  }
  function closeFilterDialog() { $('filter-dialog').hidden = true; $('filter-open').focus(); }
  function resetFilters() { state.searchFilters = { genre: '', country: '', years: '', rating: 0 }; buildFilterChoices(); filterSummary(); }
  function openSortDialog() {
    $('sort-dialog').hidden = false;
    Array.from(document.querySelectorAll('.sort-option')).forEach(function (b) { b.classList.toggle('active', b.dataset.sort === state.searchSort); });
    var active = $('sort-dialog').querySelector('.sort-option.active') || $('sort-dialog').querySelector('.sort-option'); if (active) active.focus();
  }
  function closeSortDialog() { $('sort-dialog').hidden = true; $('sort-open').focus(); }
  function renderDiscoveryItems(items, append, focusFirst) {
    var grid = $('search-grid'); if (!append) clear(grid);
    items.forEach(function (item) { grid.appendChild(renderCard(item)); }); filterSummary();
    var shown = state.searchItems.length, total = state.searchTotal || shown;
    $('search-message').textContent = total ? 'Показано: ' + shown + ' из ' + Number(total).toLocaleString('ru-RU') : 'Ничего не найдено';
    $('search-load-more').hidden = !state.searchHasMore;
    if (focusFirst && items.length) { var first = grid.querySelector('button'); if (first) first.focus(); }
  }
  async function loadDiscovery(append, focusFirst) {
    if (state.loading) return; state.loading = true; state.searchMode = 'catalog'; showBase('search');
    var offset = append ? state.searchOffset : 0;
    if (!append) { state.searchItems = []; state.searchTotal = 0; clear($('search-grid')); $('search-message').textContent = 'Загрузка подборки…'; $('search-load-more').hidden = true; }
    filterSummary();
    try {
      var result = await fetchJson(model.filteredCatalogUrl('all_movies', offset, state.searchFilters, state.searchSort));
      var items = model.catalogItems(result);
      state.searchItems = append ? state.searchItems.concat(items) : items;
      state.searchTotal = Number(result.count_available || result.countAvailable || result.count || state.searchItems.length) || state.searchItems.length;
      state.searchOffset = result.next_offset || result.nextOffset || offset + items.length;
      state.searchHasMore = Boolean(result.has_more || result.hasMore || (items.length && state.searchItems.length < state.searchTotal));
      renderDiscoveryItems(items, append, focusFirst);
    } catch (error) { if (!append) state.searchItems = []; $('search-message').textContent = 'Подборка недоступна'; toast(error.message); }
    finally { state.loading = false; }
  }
  async function applyFilters() { $('search-input').value = ''; state.searchQuery = ''; closeFilterDialog(); await loadDiscovery(false, true); }
  async function chooseSort(mode) { $('search-input').value = ''; state.searchQuery = ''; state.searchSort = mode; closeSortDialog(); await loadDiscovery(false, true); }

  async function search(query) {
    query = query.trim();
    if (!query) { await loadDiscovery(false, true); return; }
    showBase('search'); state.searchMode = 'text'; state.searchQuery = query; $('search-message').textContent = 'Поиск…'; clear($('search-grid')); $('search-load-more').hidden = true; filterSummary();
    try {
      var result = await fetchJson(model.searchUrl(query)); var items = model.catalogItems(result);
      state.searchItems = items; state.searchTotal = items.length; state.searchHasMore = false;
      // Текстовый поиск остаётся отдельным режимом. Серверные фильтры применяются при выборе «Применить».
      clear($('search-grid')); items.forEach(function (item) { $('search-grid').appendChild(renderCard(item)); });
      $('search-message').textContent = items.length ? 'Найдено по названию: ' + items.length : 'Ничего не найдено';
      if (items.length) { var first = $('search-grid').querySelector('button'); if (first) first.focus(); }
    } catch (error) { state.searchItems = []; $('search-message').textContent = 'Поиск недоступен'; toast(error.message); }
  }

  var KZ_CATEGORIES = [
    ['0','Избранные раздачи'],['1','Избранные фильмы'],['101','Комедии'],['102','Фантастика, фэнтези'],['103','Ужас, мистика'],['104','Боевик, военный'],['105','Триллер, детектив'],['106','Драма, мелодрама'],['107','Наше кино'],['108','Детский, семейный'],['110','Приключения'],['111','Исторический'],['112','Документальный'],['113','Классика, театр, опера, балет'],['115','Концерты'],['116','Спорт'],['2','Избранные мультфильмы'],['21','Мультфильмы · русские'],['22','Мультфильмы · зарубежные'],['23','Аниме'],['3','Избранные сериалы'],['31','Сериалы · русские'],['32','Сериалы · зарубежные'],['4','Топ музыки'],['41','Музыка · русская'],['42','Музыка · зарубежная'],['44','Музыка · сборники'],['43','Музыка · классическая'],['5','Библиотека'],['6','Аудиокниги'],['7','Игры'],['8','Программы']
  ];
  var KZ_YEARS = [['0','Все годы'],['14','2024–2026'],['13','2021–2023'],['11','2018–2020'],['10','2015–2017'],['1','2012–2014'],['2','2009–2011'],['3','2006–2008'],['4','2001–2005'],['5','1996–2000'],['6','1992–1995'],['7','1982–1991'],['8','1972–1981'],['9','1951–1971']];
  var KZ_COUNTRIES = [['0','Все страны'],['1','Россия'],['2','США'],['3','СССР'],['4','Франция'],['5','Германия'],['6','Италия'],['7','Великобритания']];
  var KZ_FORMATS = [['0','Все форматы'],['2','HD'],['5','4K'],['4','3D'],['3','LossLess']];
  var KZ_PERIODS = [['0','За всё время'],['1','За неделю'],['2','За месяц'],['3','За 3 месяца'],['6','За полгода']];
  var KZ_SORTS = [['0','По сидам'],['1','По пирам'],['2','По комментариям']];

  function choiceLabel(rows, value) { var found = rows.find(function (x) { return String(x[0]) === String(value); }); return found ? found[1] : String(value); }
  var KZ_HELPER = 'http://127.0.0.1:8787';
  async function cacheRequest(path, options) {
    var response = await fetch(KZ_HELPER + path, options || { cache: 'no-store' });
    var result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Не удалось изменить кэш');
    return result;
  }
  async function sportNetworkRequest(action) {
    var response = await fetch(KZ_HELPER + '/sports/network/' + action, { method: 'POST', cache: 'no-store' });
    var result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Не удалось переключить сеть для спорта');
    return result;
  }
  function stopSportNetworkHeartbeat() {
    if (state.sportNetworkTimer !== null) { clearInterval(state.sportNetworkTimer); state.sportNetworkTimer = null; }
  }
  function startSportNetwork() {
    if (state.sportNetworkActive) return Promise.resolve();
    if (state.sportNetworkStart) return state.sportNetworkStart;
    state.sportNetworkStart = sportNetworkRequest('start').then(function () {
      state.sportNetworkActive = true; state.sportNetworkStart = null;
      if (state.view !== 'sport') return restoreSportNetwork();
      stopSportNetworkHeartbeat();
      state.sportNetworkTimer = setInterval(function () {
        sportNetworkRequest('keepalive').catch(function () {});
      }, 20000);
    }, function (error) { state.sportNetworkStart = null; throw error; });
    return state.sportNetworkStart;
  }
  function restoreSportNetwork() {
    stopSportNetworkHeartbeat();
    if (state.sportNetworkRestore) return state.sportNetworkRestore;
    if (state.sportNetworkStart) return state.sportNetworkStart.then(restoreSportNetwork, function () {});
    if (!state.sportNetworkActive) return Promise.resolve();
    state.sportNetworkActive = false;
    state.sportNetworkRestore = sportNetworkRequest('stop').then(function () {
      state.sportNetworkRestore = null;
    }, function (error) {
      state.sportNetworkRestore = null; toast(error.message); throw error;
    });
    return state.sportNetworkRestore;
  }
  function openWebPlayer(url, title, trigger) {
    state.webPlayerTrigger = trigger || null; $('web-player-title').textContent = title || 'Онлайн-трансляция';
    $('web-player-frame').src = url; $('web-player-view').hidden = false; $('web-player-back').focus();
  }
  function closeWebPlayer() {
    if (!$('web-player-view') || $('web-player-view').hidden) return;
    $('web-player-view').hidden = true; $('web-player-frame').src = 'about:blank';
    var trigger = state.webPlayerTrigger; state.webPlayerTrigger = null;
    if (trigger && document.body.contains(trigger)) trigger.focus();
  }
  function formatBroadcastTime(value) {
    var date = new Date(value); if (!value || Number.isNaN(date.getTime())) return '';
    return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  }
  function renderSportCard(item) {
    var button = document.createElement('button'); button.type = 'button'; button.className = 'service-card service-card-sport focusable';
    if (safeImage(item.image)) { var image = document.createElement('img'); image.alt = ''; setImage(image, item.image); button.appendChild(image); }
    if (item.live) { var live = document.createElement('b'); live.className = 'sport-live'; live.textContent = 'ПРЯМОЙ ЭФИР'; button.appendChild(live); }
    var title = document.createElement('strong'); title.textContent = item.title;
    var copy = document.createElement('span'); copy.textContent = [item.channel, item.subtitle, formatBroadcastTime(item.startAt)].filter(Boolean).join(' · ');
    var hint = document.createElement('small'); hint.textContent = 'Смотреть в Seena →'; button.append(title, copy, hint);
    button.addEventListener('click', function () { openSportBroadcast(item, button); }); return button;
  }
  async function loadSports() {
    if (state.sportItems.length && Date.now() - state.sportLoadedAt < 5 * 60 * 1000) return;
    var date = new Date(), key = String(date.getFullYear()) + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
    $('sport-service-status').textContent = 'Загружаем бесплатные трансляции Матч ТВ…'; clear($('sport-grid'));
    try {
      var response = await fetchJson(KZ_HELPER + '/sports/broadcasts?date=' + key);
      state.sportItems = model.matchBroadcastItems(response); state.sportLoadedAt = Date.now();
      state.sportItems.forEach(function (item) { $('sport-grid').appendChild(renderSportCard(item)); });
      $('sport-service-status').textContent = state.sportItems.length ? 'Сначала показаны трансляции, которые идут сейчас.' : 'Сегодня бесплатных трансляций не найдено.';
      var first = $('sport-grid').querySelector('button'); if (first) first.focus();
    } catch (error) { $('sport-service-status').textContent = 'Не удалось загрузить спорт: ' + error.message; }
  }
  async function openSports() {
    showBase('sport'); if (!state.sportItems.length) $('sport-service-status').textContent = 'Переключаем сеть для доступной трансляции…';
    try { await startSportNetwork(); await loadSports(); }
    catch (error) { $('sport-service-status').textContent = error.message; toast(error.message); }
  }
  async function openSportBroadcast(item, button) {
    button.disabled = true; $('sport-service-status').textContent = 'Открываем трансляцию…';
    try {
      var response = await fetchJson(KZ_HELPER + '/sports/media?id=' + encodeURIComponent(item.id));
      var url = model.matchPlayerUrl(response); if (!url) throw new Error('Официальный плеер недоступен');
      openWebPlayer(url, item.title, button);
    } catch (error) { $('sport-service-status').textContent = error.message; toast(error.message); }
    finally { button.disabled = false; }
  }
  function updateCacheStatus(status) {
    var kinds = status.kinds || {}, pages = Number(kinds.page) || 0, torrents = Number(kinds.torrent) || 0, people = Number(kinds.person) || 0;
    $('cache-usage').textContent = 'Занято: ' + (status.usedBytes / 1048576).toFixed(2) + ' МБ · страницы: ' + pages + ' · торренты: ' + torrents + ' · актёры: ' + people;
    Array.from(document.querySelectorAll('.cache-size')).forEach(function (button) {
      var selected = Number(button.dataset.cacheMb) === status.limitMb;
      button.classList.toggle('active', selected); button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }
  async function openCacheSettings() {
    $('cache-dialog').hidden = false; $('cache-status').textContent = '';
    $('cache-usage').textContent = 'Загружаем сведения о кэше…'; $('cache-clear').focus();
    try { updateCacheStatus(await cacheRequest('/cache/status')); }
    catch (error) { $('cache-usage').textContent = 'Кэш недоступен'; $('cache-status').textContent = error.message; }
  }
  function closeCacheSettings() { $('cache-dialog').hidden = true; $('cache-open').focus(); }
  async function setCacheLimit(limitMb, button) {
    button.disabled = true; $('cache-status').textContent = 'Сохраняем размер кэша…';
    try {
      var status = await cacheRequest('/cache/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limitMb: limitMb }) });
      updateCacheStatus(status); $('cache-status').textContent = limitMb ? 'Размер кэша сохранён.' : 'Кэш выключен и очищен.';
    } catch (error) { $('cache-status').textContent = error.message; }
    finally { button.disabled = false; button.focus(); }
  }
  async function clearSeenaCache() {
    var button = $('cache-clear'); button.disabled = true; $('cache-status').textContent = 'Очищаем кэш…';
    try {
      updateCacheStatus(await cacheRequest('/cache/clear', { method: 'POST' }));
      state.kzLoaded = false; state.kzLoadedAt = 0; state.kzSearchItems = [];
      $('cache-status').textContent = 'Кэш очищен. Страницы Кинозала и карточки актёров загрузятся заново.';
    } catch (error) { $('cache-status').textContent = error.message; }
    finally { button.disabled = false; button.focus(); }
  }
  async function personResults(person) {
    var path = '/cache/person?id=' + encodeURIComponent(person.id), response, cached;
    try {
      response = await fetch(KZ_HELPER + path, { cache: 'no-store' });
      if (response.ok) {
        cached = await response.json();
        if (cached && cached.info && cached.credits) return [cached.info, cached.credits];
      }
    } catch (_) {}
    var results = await Promise.all([fetchJson(model.personUrl(person.id)), fetchJson(model.personCreditsUrl(person.id, 80, 0))]);
    try {
      await fetch(KZ_HELPER + path, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ info: results[0], credits: results[1] }) });
    } catch (_) {}
    return results;
  }
  function kinozalSettings() { return { base: 'https://kinozal.guru' }; }
  async function seedKinozalConfig() {
    localStorage.removeItem('seena.kinozal.user');
    localStorage.removeItem('seena.kinozal.pass');
    localStorage.removeItem('seena.kinozal.base');
  }
  function updateKinozalAuth(text, ok) { var el = $('kinozal-auth-status'); el.textContent = text; el.className = 'server-status ' + (ok === true ? 'kinozal-auth-ok' : ok === false ? 'kinozal-auth-bad' : ''); }
  function decode1251(buffer) { try { return new TextDecoder('windows-1251').decode(buffer); } catch (e) { return new TextDecoder('utf-8').decode(buffer); } }
  async function kinozalResponseText(response) { return decode1251(await response.arrayBuffer()); }
  function isKinozalLoginPage(html) { return /<title>\s*Вход\s*::\s*Кинозал/i.test(html); }
  async function kinozalHelperFetch(url) {
    for (var attempt = 0; attempt < 4; attempt += 1) {
      var response;
      try { response = await fetch(url, { cache: 'no-store' }); }
      catch (e) {
        if (attempt < 3) { await sleep(4000); continue; }
        throw new Error('Локальный helper недоступен');
      }
      if (response.status !== 503 || attempt === 3) return response;
      var error = null;
      try { error = await response.clone().json(); } catch (e) {}
      if (!error || error.error !== 'cloudflare_challenge') return response;
      await sleep(1000 * (attempt + 1));
    }
  }
  async function kinozalLogin(force) {
    if (state.kzLoggedIn && !force) return true;
    updateKinozalAuth('Кинозал: проверка helper…', null);
    var r = await kinozalHelperFetch(KZ_HELPER + '/kinozal/cookies/status');
    if (!r.ok) throw new Error('Локальный helper недоступен');
    var status = await r.json();
    if (!status.present) { updateKinozalAuth('Кинозал: нужны cookies', false); throw new Error('Загрузите cookies Kinozal на TV'); }
    state.kzLoggedIn = true; updateKinozalAuth('Кинозал: helper готов', true); return true;
  }
  async function kinozalGet(path, binary) {
    var parsed = new URL(path, kinozalSettings().base);
    var route = parsed.pathname === '/top.php' ? '/kinozal/top' : parsed.pathname === '/browse.php' ? '/kinozal/search' :
      parsed.pathname === '/details.php' ? '/kinozal/details' : parsed.pathname === '/download.php' ? '/kinozal/torrent' : '';
    if (!route || !/^(kinozal\.guru|kinozal\.jumpingcrab\.com)$/i.test(parsed.hostname)) throw new Error('Неизвестный адрес Kinozal');
    var r = await kinozalHelperFetch(KZ_HELPER + route + parsed.search);
    if (!r.ok) {
      var err = null; try { err = await r.json(); } catch (e) {}
      state.kzLoggedIn = false;
      throw new Error(err && err.message ? err.message : 'Kinozal helper HTTP ' + r.status);
    }
    if (binary) {
      var buf = await r.arrayBuffer();
      if (buf.byteLength < 20) throw new Error('Кинозал вернул пустой torrent');
      return buf;
    }
    var html = await kinozalResponseText(r);
    if (isKinozalLoginPage(html)) throw new Error('Кинозал требует повторный вход');
    state.kzLoggedIn = true; updateKinozalAuth('Кинозал: helper готов', true); return html;
  }
  function kzDoc(html) { return new DOMParser().parseFromString(html, 'text/html'); }
  function kzAbs(url, base) { try { var absolute = new URL(url, base || kinozalSettings().base); return /^(kinozal\.guru|kinozal\.jumpingcrab\.com)$/i.test(absolute.hostname) ? KZ_HELPER + '/kinozal/image?url=' + encodeURIComponent(absolute.href) : absolute.href; } catch (e) { return url || ''; } }
  function kzIdFromHref(href) { var m = String(href || '').match(/[?&]id=(\d+)/); return m ? m[1] : ''; }
  function kzClean(text) { return String(text || '').replace(/\s+/g, ' ').trim(); }
  function parseKinozalTop(html) {
    var doc = kzDoc(html), rows = Array.from(doc.querySelectorAll('.stable a[href*="details.php?id="]')), out = [];
    rows.forEach(function (a) {
      var id = kzIdFromHref(a.getAttribute('href')); if (!id) return; var full = kzClean(a.getAttribute('title') || a.textContent); var img = a.querySelector('img');
      var parts = full.split(/\s+\/\s+/), yearMatch = full.match(/\b(?:19|20)\d{2}(?:-(?:19|20)\d{2})?\b/); var format = parts.length > 1 ? parts[parts.length - 1] : '';
      out.push({ id: id, title: parts[0] || full || ('Раздача ' + id), fullTitle: full, year: yearMatch ? yearMatch[0] : '', format: format, poster: img ? kzAbs(img.getAttribute('src'), kinozalSettings().base) : '', mediaType: /сезон|серии/i.test(full) ? 'tv' : 'movie' });
    });
    var pages = [0]; Array.from(doc.querySelectorAll('.paginator a[href*="page="]')).forEach(function (a) { var m = a.getAttribute('href').match(/[?&]page=(\d+)/); if (m) pages.push(Number(m[1])); });
    return { items: out, lastPage: Math.max.apply(Math, pages) };
  }
  function renderKinozalCard(item) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'poster-card kinozal-card focusable';
    var img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; if (safeImage(item.poster)) setImage(img, item.poster);
    var copy = document.createElement('div'); copy.className = 'poster-copy'; var title = document.createElement('strong'); title.textContent = item.title;
    var meta = document.createElement('small'); meta.textContent = [item.year, item.mediaType === 'tv' ? 'Сериал' : 'Фильм'].filter(Boolean).join(' · ');
    var fmt = document.createElement('span'); fmt.className = 'kz-format'; fmt.textContent = item.format || '';
    copy.append(title, meta, fmt); b.append(img, copy); b.addEventListener('click', function () { openKinozalDetail(item, b); }); return b;
  }
  function renderHistory() {
    var items = history.read(localStorage), grid = $('history-grid'); clear(grid);
    $('history-count').textContent = items.length ? items.length + ' в истории' : '';
    $('history-message').hidden = items.length > 0;
    items.forEach(function (item, index) {
      var entry = document.createElement('div'); entry.className = 'history-entry';
      var card = item.source === 'kinozal' ? renderKinozalCard(item) : renderCard(item);
      var meta = card.querySelector('.poster-copy small');
      if (meta) meta.textContent = (item.source === 'kinozal' ? 'Кинозал · ' : '') + new Date(item.watchedAt).toLocaleDateString('ru-RU');
      var remove = makeButton('Удалить', 'history-remove', function () {
        try { history.remove(localStorage, item.source, item.id); renderHistory();
          var buttons = $('history-grid').querySelectorAll('.history-remove');
          if (buttons.length) buttons[Math.min(index, buttons.length - 1)].focus(); else $('history-open').focus();
        } catch (_) { toast('Не удалось удалить запись из истории'); }
      });
      remove.setAttribute('aria-label', 'Удалить из истории: ' + item.title);
      entry.append(card, remove); grid.appendChild(entry);
    });
  }
  function showHistory() {
    showBase('history'); renderHistory();
    var first = $('history-grid').querySelector('.poster-card'); if (first) first.focus(); else $('history-open').focus();
  }
  function kinozalTopPath(page) {
    var f = state.kzFilters; return '/top.php?t=' + encodeURIComponent(f.category) + '&d=' + encodeURIComponent(f.year) + '&f=' + encodeURIComponent(f.format) + '&c=0&k=' + encodeURIComponent(f.country) + '&j=' + encodeURIComponent(f.genre || '') + '&s=' + encodeURIComponent(f.sort) + '&w=' + encodeURIComponent(f.period) + '&page=' + (Number(page) || 0);
  }
  function updateKinozalSummary() {
    var f = state.kzFilters, parts = [choiceLabel(KZ_CATEGORIES,f.category), choiceLabel(KZ_YEARS,f.year), choiceLabel(KZ_FORMATS,f.format)];
    if (f.country !== '0') parts.push(choiceLabel(KZ_COUNTRIES,f.country)); if (f.period !== '0') parts.push(choiceLabel(KZ_PERIODS,f.period)); if (f.sort !== '0') parts.push(choiceLabel(KZ_SORTS,f.sort)); if (f.genre) parts.push(f.genre);
    $('kinozal-filter-summary').textContent = parts.join(' · ');
  }
  async function loadKinozal(append) {
    if (state.kzLoading) return; state.kzLoading = true; showBase('kinozal'); var page = append ? state.kzPage + 1 : 0;
    if (!append) { state.kzLoaded = false; state.kzItems = []; state.kzPage = 0; state.kzLastPage = 0; clear($('kinozal-grid')); $('kinozal-message').textContent = 'Загрузка топа…'; $('kinozal-more').hidden = true; }
    try {
      if (!state.kzLoggedIn) await kinozalLogin(false); var html = await kinozalGet(kinozalTopPath(page), false); var parsed = parseKinozalTop(html);
      parsed.items.forEach(function (item) { $('kinozal-grid').appendChild(renderKinozalCard(item)); }); state.kzItems = append ? state.kzItems.concat(parsed.items) : parsed.items; state.kzPage = page; state.kzLastPage = parsed.lastPage; state.kzLoaded = true; if (!append) state.kzLoadedAt = Date.now();
      $('kinozal-message').textContent = parsed.items.length ? 'Популярные раздачи Кинозала. Выберите карточку.' : 'Раздачи по выбранным фильтрам не найдены.'; $('kinozal-page-info').textContent = 'Страница ' + (page + 1) + (parsed.lastPage ? ' из ' + (parsed.lastPage + 1) : ''); $('kinozal-more').hidden = !parsed.items.length || page >= parsed.lastPage; updateKinozalSummary();
      if (!append) { var first = $('kinozal-grid').querySelector('button'); if (first) first.focus(); }
    } catch (e) { $('kinozal-message').textContent = 'Кинозал недоступен: ' + e.message; updateKinozalAuth('Кинозал: ошибка', false); toast(e.message); }
    finally { state.kzLoading = false; }
  }
  function buildKinozalChoiceRow(id, rows, key) {
    var host = $(id); clear(host); rows.forEach(function (row) { var b = makeButton(row[1], 'choice-button' + (String(state.kzFilters[key]) === String(row[0]) ? ' active' : ''), function () { state.kzFilters[key] = String(row[0]); buildKinozalFilters(); }); host.appendChild(b); });
  }
  function buildKinozalFilters() { buildKinozalChoiceRow('kinozal-filter-category', KZ_CATEGORIES, 'category'); buildKinozalChoiceRow('kinozal-filter-year', KZ_YEARS, 'year'); buildKinozalChoiceRow('kinozal-filter-country', KZ_COUNTRIES, 'country'); buildKinozalChoiceRow('kinozal-filter-format', KZ_FORMATS, 'format'); buildKinozalChoiceRow('kinozal-filter-period', KZ_PERIODS, 'period'); buildKinozalChoiceRow('kinozal-filter-sort', KZ_SORTS, 'sort'); $('kinozal-filter-genre').value = state.kzFilters.genre || ''; }
  function openKinozalFilter() { buildKinozalFilters(); $('kinozal-filter-dialog').hidden = false; var b = $('kinozal-filter-category').querySelector('button.active') || $('kinozal-filter-category').querySelector('button'); if (b) b.focus(); }
  function closeKinozalFilter() { $('kinozal-filter-dialog').hidden = true; $('kinozal-filter-open').focus(); }
  function resetKinozalFilter() { state.kzFilters = { category: '0', year: '0', country: '0', format: '0', period: '0', sort: '0', genre: '' }; buildKinozalFilters(); }
  async function applyKinozalFilter() { state.kzFilters.genre = $('kinozal-filter-genre').value.trim(); closeKinozalFilter(); await loadKinozal(false); }
  var kinozalKeyboardTarget = null, kinozalKeyboardTimer = null, kinozalSystemKeyboardVisible = false;
  var kinozalKeyboardLanguage = 'en', kinozalKeyboardShift = false, kinozalKeyboardSymbols = false;
  function keyboardHost() { return kinozalKeyboardTarget === $('search-input') ? $('search-keyboard') : $('kinozal-account-keyboard'); }
  function hideKinozalKeyboard() { $('kinozal-account-keyboard').hidden = true; $('search-keyboard').hidden = true; clearTimeout(kinozalKeyboardTimer); }
  function kinozalKeyboardWrite(value, erase) {
    if (!kinozalKeyboardTarget) return;
    kinozalKeyboardTarget.value = erase ? kinozalKeyboardTarget.value.slice(0, -1) : kinozalKeyboardTarget.value + value;
  }
  function renderKinozalKeyboard() {
    var board = keyboardHost(); clear(board);
    var rows = kinozalKeyboardSymbols ? ['1234567890', '!@#$%^&*()', '-_=+[]{}', ';:,.?/\\|'] :
      kinozalKeyboardLanguage === 'ru' ? ['1234567890', 'йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбю'] :
      ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
    function row() { var el = document.createElement('div'); el.className = 'kinozal-key-row'; board.appendChild(el); return el; }
    rows.forEach(function (letters) {
      var host = row();
      Array.from(letters).forEach(function (letter) {
        var shown = kinozalKeyboardShift ? letter.toUpperCase() : letter;
        host.appendChild(makeButton(shown, 'kinozal-key', function () { kinozalKeyboardWrite(shown, false); }));
      });
    });
    var controls = row();
    controls.appendChild(makeButton('⇧', 'kinozal-key', function () { kinozalKeyboardShift = !kinozalKeyboardShift; renderKinozalKeyboard(); }));
    controls.appendChild(makeButton(kinozalKeyboardLanguage === 'ru' ? 'ABC' : 'АБВ', 'kinozal-key wide', function () { kinozalKeyboardLanguage = kinozalKeyboardLanguage === 'ru' ? 'en' : 'ru'; kinozalKeyboardSymbols = false; renderKinozalKeyboard(); }));
    controls.appendChild(makeButton(kinozalKeyboardSymbols ? 'Буквы' : 'Символы', 'kinozal-key wide', function () { kinozalKeyboardSymbols = !kinozalKeyboardSymbols; renderKinozalKeyboard(); }));
    controls.appendChild(makeButton('Пробел', 'kinozal-key wide', function () { kinozalKeyboardWrite(' ', false); }));
    controls.appendChild(makeButton('⌫', 'kinozal-key', function () { kinozalKeyboardWrite('', true); }));
    controls.appendChild(makeButton('Готово', 'kinozal-key wide', function () {
      if (kinozalKeyboardTarget === $('search-input')) { var query = kinozalKeyboardTarget.value; hideKinozalKeyboard(); search(query); return; }
      var next = kinozalKeyboardTarget === $('kinozal-account-user') ? $('kinozal-account-pass') : $('kinozal-account-login');
      hideKinozalKeyboard();
      if (next === $('kinozal-account-pass')) activateKinozalInput(next); else next.focus();
    }));
    if (!board.hidden) { var first = board.querySelector('button'); if (first) first.focus(); }
  }
  function showKinozalKeyboard(input) {
    kinozalKeyboardTarget = input;
    renderKinozalKeyboard();
    keyboardHost().hidden = false;
    var first = keyboardHost().querySelector('button'); if (first) first.focus();
  }
  function scheduleKinozalKeyboard(input) {
    kinozalKeyboardTarget = input;
    clearTimeout(kinozalKeyboardTimer);
    kinozalKeyboardTimer = setTimeout(function () {
      var visible = input === $('search-input') ? state.view === 'search' && !$('search-view').hidden : !$('kinozal-account-dialog').hidden;
      if (visible && document.activeElement === input && !kinozalSystemKeyboardVisible)
        showKinozalKeyboard(input);
    }, 700);
  }
  function activateKinozalInput(input) { input.blur(); input.focus(); input.click(); scheduleKinozalKeyboard(input); }
  function openKinozalAccount() {
    $('kinozal-account-status').textContent = '';
    $('kinozal-account-dialog').hidden = false;
    setTimeout(function () { if (!$('kinozal-account-dialog').hidden) activateKinozalInput($('kinozal-account-user')); }, 80);
  }
  function closeKinozalAccount() { hideKinozalKeyboard(); $('kinozal-account-pass').value = ''; $('kinozal-account-dialog').hidden = true; $('kinozal-account-open').focus(); }
  function toggleKinozalRemember() {
    var button = $('kinozal-account-remember'), enabled = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    button.textContent = 'Запомнить пароль: ' + (enabled ? 'да' : 'нет');
  }
  async function loginKinozalAccount() {
    var username = $('kinozal-account-user').value.trim(), password = $('kinozal-account-pass').value;
    if (!username || !password) { $('kinozal-account-status').textContent = 'Введите логин и пароль Кинозала.'; return; }
    var button = $('kinozal-account-login'); button.disabled = true;
    $('kinozal-account-status').textContent = 'Вход в Kinozal…';
    try {
      var response = await fetch(KZ_HELPER + '/kinozal/session/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password, remember: $('kinozal-account-remember').getAttribute('aria-pressed') === 'true' }) });
      var result = await response.json();
      $('kinozal-account-pass').value = '';
      if (!response.ok) throw new Error(result.message || 'Не удалось войти в Kinozal');
      state.kzLoggedIn = true;
      closeKinozalAccount();
      await loadKinozal(false);
      if (state.kzLoaded) updateKinozalAuth('Кинозал: вход выполнен', true);
    } catch (e) { $('kinozal-account-pass').value = ''; $('kinozal-account-status').textContent = e.message; toast(e.message); }
    finally { button.disabled = false; }
  }
  async function refreshKinozalSession() {
    var button = $('kinozal-session-refresh');
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = 'Проверка…';
    updateKinozalAuth('Кинозал: проверка адресов…', null);
    try {
      var response = await fetch(KZ_HELPER + '/kinozal/session/refresh', { cache: 'no-store' });
      var result = await response.json();
      if (!response.ok && (result.error === 'kinozal_rate_limited' || result.error === 'torrent_session_unavailable')) {
        await loadKinozal(false);
        if (state.kzLoaded) {
          $('kinozal-message').textContent = 'Top доступен. ' + result.message;
          updateKinozalAuth('Кинозал: torrent недоступен', false);
          toast(result.message);
          return;
        }
      }
      if (!response.ok) throw new Error(result.message || 'Не удалось восстановить доступ к Кинозалу');
      state.kzLoggedIn = true;
      await loadKinozal(false);
      if (state.kzLoaded) updateKinozalAuth('Кинозал: вход активен', true);
    } catch (e) {
      $('kinozal-message').textContent = 'Кинозал недоступен: ' + e.message;
      updateKinozalAuth('Кинозал: ошибка', false);
      toast(e.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Обновить сессию';
    }
  }
  async function refreshKinozalContent() {
    var button = $('kinozal-content-refresh'); if (button.disabled) return;
    button.disabled = true; button.textContent = 'Обновление…';
    try {
      var response = await fetch(KZ_HELPER + '/cache/pages/clear', { method: 'POST', cache: 'no-store' });
      if (!response.ok) throw new Error('Не удалось очистить страницы');
      state.kzLoaded = false; state.kzLoadedAt = 0; await loadKinozal(false);
      if (state.kzLoaded) toast('Top Кинозала обновлён');
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; button.textContent = 'Обновить Top'; }
  }
  function saveKinozalAccount() { closeKinozalAccount(); }
  async function testKinozalAccount() { $('kinozal-account-status').textContent = 'Проверка входа…'; try { var response = await fetch(KZ_HELPER + '/kinozal/session/refresh', { cache: 'no-store' }); var result = await response.json(); if (!response.ok) throw new Error(result.message || 'Kinozal недоступен'); $('kinozal-account-status').textContent = 'Вход активен. Torrent загрузится при выборе раздачи.'; } catch (e) { $('kinozal-account-status').textContent = e.message; } }
  function kinozalSearchQuality(full) {
    var text = kzClean(full), out = [];
    function add(value) { if (value && out.indexOf(value) < 0) out.push(value); }
    var resolution = text.match(/\b(2160p|1080p|1080i|720p|576p|480p)\b/i); if (resolution) add(resolution[1].toUpperCase());
    if (/\b4K\b/i.test(text) && !/2160p/i.test(text)) add('4K');
    var source = text.match(/\b(WEB-DLRip|WEB-DL|WEBRip|Blu-Ray Remux|BDRemux|BDRip|HDRip|DVDRip|HDTVRip|HDTV|SATRip|TVRip)\b/i); if (source) add(source[1]);
    ['HEVC','AVC','HDR10+','HDR10','HDR','Dolby Vision','DV'].forEach(function (tag) { if (text.toLowerCase().indexOf(tag.toLowerCase()) >= 0) add(tag); });
    return out.join(' · ');
  }
  function parseKinozalSearch(html) {
    var doc = kzDoc(html), out = [];
    Array.from(doc.querySelectorAll('table.t_peer tr')).forEach(function (tr) {
      var a = tr.querySelector('td.nam a[href*="details.php?id="], a[href*="details.php?id="]'); if (!a) return;
      var id = kzIdFromHref(a.getAttribute('href')); if (!id) return; var tds = tr.querySelectorAll('td'); var full = kzClean(a.textContent);
      var cat = ''; var icon = tr.querySelector('img[onclick*="cat("], img[src*="/pic/cat/"]'); if (icon) { var cm = String(icon.getAttribute('onclick') || icon.getAttribute('src') || '').match(/(?:cat\(|\/cat\/)(\d+)/); if (cm) cat = cm[1]; }
      var year = (full.match(/\b(?:19|20)\d{2}(?:-(?:19|20)\d{2})?\b/) || [''])[0];
      out.push({ id:id, title:full, fullTitle:full, year:year, quality:kinozalSearchQuality(full), size:tds[3]?kzClean(tds[3].textContent):'', seeds:tds[4]?Number(kzClean(tds[4].textContent))||0:0, peers:tds[5]?Number(kzClean(tds[5].textContent))||0:0, uploaded:tds[6]?kzClean(tds[6].textContent):'', category:cat });
    });
    var pages=[0]; Array.from(doc.querySelectorAll('.paginator a[href*="page="]')).forEach(function(a){var m=String(a.getAttribute('href')||'').match(/[?&]page=(\d+)/);if(m)pages.push(Number(m[1]));});
    return {items:out,lastPage:Math.max.apply(Math,pages)};
  }
  function kinozalSearchPath(query, page) {
    var category = state.detailItem && state.detailItem.mediaType === 'tv' ? '1001' : '1002';
    return '/browse.php?s=' + encodeURIComponent(query) + '&g=0&c=' + category + '&v=0&d=0&w=0&t=1&f=0&page=' + (Number(page) || 0);
  }
  function normalKinozalContext() {
    var item = state.detailItem || {}, detail = state.detail || {};
    return { title:item.title || detail.title || '', poster:model.imageUrl(detail.poster_url || detail.posterUrl || item.poster || '', 'w500') || item.poster || '', mediaType:item.mediaType || detail.media_type || 'movie' };
  }
  function renderKinozalSearchRelease(release) {
    var b=makeButton('', 'torrent-button kinozal-search-release', function(){playKinozalSearchTorrent(release);});
    var strong=document.createElement('strong'); strong.textContent=release.title; var small=document.createElement('small');
    small.textContent=[release.quality,release.size,release.seeds||release.peers?'Сиды: '+release.seeds:'',release.peers?'Пиры: '+release.peers:'',release.uploaded].filter(Boolean).join(' · '); b.append(strong,small); return b;
  }
  async function loadKinozalSearch(append) {
    if (state.kzSearchLoading || !state.kzSearchQuery) return; state.kzSearchLoading=true; var page=append?state.kzSearchPage+1:0;
    if(!append){clear($('kinozal-search-list'));state.kzSearchItems=[];state.kzSearchPage=0;state.kzSearchLastPage=0;$('kinozal-search-more').hidden=true;$('kinozal-search-status').textContent='Ищем раздачи по названию…';}
    try {
      if(!state.kzLoggedIn) await kinozalLogin(false); var html=await kinozalGet(kinozalSearchPath(state.kzSearchQuery,page),false); var parsed=parseKinozalSearch(html);
      parsed.items.forEach(function(x){$('kinozal-search-list').appendChild(renderKinozalSearchRelease(x));}); state.kzSearchItems=append?state.kzSearchItems.concat(parsed.items):parsed.items;state.kzSearchPage=page;state.kzSearchLastPage=parsed.lastPage;
      $('kinozal-search-status').textContent=state.kzSearchItems.length?'Найдено раздач: '+state.kzSearchItems.length+'. Сортировка — по сидам. Выберите качество.':'По этому названию раздачи не найдены.'; $('kinozal-search-more').hidden=!parsed.items.length||page>=parsed.lastPage;
      if(!append){var first=$('kinozal-search-list').querySelector('button');if(first)first.focus();else $('kinozal-search-cancel').focus();}
    } catch(e){$('kinozal-search-status').textContent='Кинозал: '+e.message;toast(e.message);} finally {state.kzSearchLoading=false;}
  }
  async function openKinozalSearch() {
    if(!state.detailItem){return;} state.kzSearchTrigger=$('detail-kinozal'); state.kzSearchQuery=kzClean(state.detailItem.title); if(!state.kzSearchQuery){toast('Не удалось определить название');return;}
    $('kinozal-search-query').textContent='Поиск: «'+state.kzSearchQuery+'»'; $('kinozal-search-dialog').hidden=false; await loadKinozalSearch(false);
  }
  function closeKinozalSearch(){ $('kinozal-search-dialog').hidden=true; if(state.kzSearchTrigger&&document.body.contains(state.kzSearchTrigger))state.kzSearchTrigger.focus(); }
  async function playKinozalSearchTorrent(release) {
    if(!(await checkTorrServer(true))){toast('TorrServer не запущен');return;} $('kinozal-search-status').textContent='Скачиваем выбранный .torrent и передаём TorrServer…';
    try { var st=await uploadKinozalTorrent(release,normalKinozalContext()),files=(st.file_stats||[]).filter(function(f){return isVideoFile(f.path);}); if(!files.length)files=st.file_stats||[]; if(!files.length)throw new Error('В раздаче не найдено файлов');
      if(files.length===1){$('kinozal-search-dialog').hidden=true;playTorrentFile(st.hash,files[0]);return;} var list=$('kinozal-search-list');clear(list);$('kinozal-search-more').hidden=true;$('kinozal-search-status').textContent='Выберите файл или серию:';
      files.forEach(function(file){var b=makeButton(file.path,'torrent-button',function(){$('kinozal-search-dialog').hidden=true;playTorrentFile(st.hash,file);});var sm=document.createElement('small');sm.textContent=file.length?(file.length/1073741824).toFixed(2)+' ГБ':'';b.appendChild(sm);list.appendChild(b);});var first=list.querySelector('button');if(first)first.focus();
    } catch(e){$('kinozal-search-status').textContent='Ошибка: '+e.message;toast(e.message);}
  }

  function parseField(html, label) { var esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); var m = html.match(new RegExp('<b>\\s*' + esc + '\\s*</b>\\s*([\\s\\S]*?)(?:<br\\s*\\/?\\s*>|</h2>|</div>)','i')); if (!m) return ''; var d = kzDoc('<div>' + m[1] + '</div>'); return kzClean(d.body.textContent); }
  function parseKinozalDetail(html, fallback) {
    var doc = kzDoc(html), h1 = doc.querySelector('h1 a[href*="details.php?id="]'), title = kzClean(h1 ? h1.textContent : fallback.fullTitle || fallback.title), id = fallback.id; var poster = doc.querySelector('.mn1_menu img.p200, .mn1_menu li.img img, meta[property="og:image"]');
    var posterUrl = poster ? (poster.tagName === 'META' ? poster.getAttribute('content') : poster.getAttribute('src')) : fallback.poster; var info = null; Array.from(doc.querySelectorAll('.mn1_content .bx1.justify')).some(function (el) { if (/Год выпуска:/i.test(el.textContent) && /Жанр:/i.test(el.textContent)) { info = el; return true; } return false; });
    var infoHtml = info ? info.innerHTML : ''; var overview = ''; Array.from(doc.querySelectorAll('.mn1_content .bx1.justify p')).some(function (p) { if (/О фильме:/i.test(p.textContent)) { overview = kzClean(p.textContent.replace(/^\s*О фильме:\s*/i,'')); return true; } return false; });
    var tech = doc.querySelector('#tabs'), techHtml = tech ? tech.innerHTML : ''; var sidebarText = kzClean(Array.from(doc.querySelectorAll('.mn1_menu li')).map(function (li) { return li.textContent; }).join(' | '));
    function rx(re) { var m=sidebarText.match(re); return m ? m[1] : ''; }
    var variants = [{ id:id, title:title, size: parseField(infoHtml,'Размер:') || rx(/Вес\s*([0-9.,]+\s*(?:ГБ|МБ))/i), seeds: Number(rx(/Раздают\s*(\d+)/i)) || 0, peers:Number(rx(/Скачивают\s*(\d+)/i)) || 0, format: parseField(techHtml,'Качество:'), current:true }];
    Array.from(doc.querySelectorAll('table.tables3 tr.first')).forEach(function (tr) { var a=tr.querySelector('a[href*="details.php?id="]'); if(!a)return; var tds=tr.querySelectorAll('td'); var rid=kzIdFromHref(a.getAttribute('href')); if(!rid||rid===id)return; var full=kzClean(a.textContent); var p=full.split(/\s+\/\s+/); variants.push({id:rid,title:full,size:tds[2]?kzClean(tds[2].textContent):'',seeds:tds[3]?Number(kzClean(tds[3].textContent))||0:0,peers:tds[4]?Number(kzClean(tds[4].textContent))||0:0,format:p.length?p[p.length-1]:'',current:false}); });
    var year = parseField(infoHtml,'Год выпуска:') || (title.match(/\b(?:19|20)\d{2}(?:-(?:19|20)\d{2})?\b/)||[''])[0];
    return { id:id, title:title, poster:kzAbs(posterUrl,kinozalSettings().base), year:year, genres:parseField(infoHtml,'Жанр:'), country:parseField(infoHtml,'Выпущено:'), director:parseField(infoHtml,'Режиссер:'), cast:parseField(infoHtml,'В ролях:'), overview:overview||'Описание отсутствует', quality:parseField(techHtml,'Качество:'), video:parseField(techHtml,'Видео:'), audio:parseField(techHtml,'Аудио:'), size:parseField(techHtml,'Размер:'), duration:parseField(techHtml,'Продолжительность:'), language:parseField(techHtml,'Язык:'), imdb:rx(/IMDb\s*([0-9.]+)/i), kp:rx(/Кинопоиск\s*([0-9.]+)/i), variants:variants, mediaType:/сезон|серии/i.test(title)?'tv':'movie' };
  }
  async function loadKinozalCast(detail) {
    var section = $('kinozal-credits-section'), list = $('kinozal-cast-list'), note = $('kinozal-cast-note');
    section.hidden = false; clear(list); note.textContent = 'Подбираем карточки актёров…';
    try {
      var queries = model.kinozalSearchQueries(detail.title); if (!queries.length) throw new Error('Название не найдено');
      var candidates = [], seen = {}, match = null;
      for (var q = 0; q < queries.length; q += 1) {
        var searchResult = await fetchJson(model.searchUrl(queries[q]));
        var queryMatch = model.bestCatalogMatchAny(searchResult, queries, detail.year, detail.mediaType);
        if (!match && queryMatch) match = queryMatch;
        model.catalogItems(searchResult).slice(0, 8).forEach(function (item) { if (!seen[item.id]) { seen[item.id] = true; candidates.push(item); } });
      }
      if (match && !seen[match.id]) candidates.unshift(match);
      if (!candidates.length) throw new Error('Фильм не найден в каталоге');
      var actorNames = model.kinozalActorNames(detail.cast), inspect = actorNames.length ? candidates.slice(0, 8) : [match || candidates[0]];
      var details = await Promise.all(inspect.map(function (item) { return fetchJson(model.detailUrl(item.id)).catch(function () { return null; }); }));
      details = details.filter(Boolean);
      var catalogDetail = model.bestDetailByCast(details, actorNames) || details[0];
      if (!catalogDetail) throw new Error('Карточка каталога недоступна');
      if ($('kinozal-detail-view').hidden || state.kzDetail !== detail) return;
      var cast = model.castItems(catalogDetail).slice(0, 24);
      appendCastCards(cast, list);
      note.textContent = cast.length ? 'Выберите актёра, чтобы открыть его карточку и фильмографию.' : 'Карточки актёров для этой раздачи не найдены.';
    } catch (_) {
      if (!$('kinozal-detail-view').hidden && state.kzDetail === detail) note.textContent = 'Карточки актёров для этой раздачи не найдены.';
    }
  }
  async function openKinozalDetail(item, trigger) {
    state.kzDetailTrigger = trigger || null; state.kzDetail = null; $('kinozal-detail-view').hidden = false; $('kinozal-detail-title').textContent = item.fullTitle || item.title; $('kinozal-detail-meta').textContent = item.year || ''; $('kinozal-detail-genres').textContent = ''; $('kinozal-detail-overview').textContent = 'Загрузка карточки…'; $('kinozal-tech').textContent = ''; $('kinozal-release-info').textContent = ''; clear($('kinozal-detail-badges')); clear($('kinozal-cast-list')); $('kinozal-credits-section').hidden = true; $('kinozal-cast-note').textContent = ''; if (safeImage(item.poster)) setImage($('kinozal-detail-poster'), item.poster); else $('kinozal-detail-poster').removeAttribute('src'); $('kinozal-detail-back').focus();
    try { var html = await kinozalGet('/details.php?id=' + encodeURIComponent(item.id), false); var d = parseKinozalDetail(html,item); state.kzDetail=d; $('kinozal-detail-title').textContent=d.title; $('kinozal-detail-meta').textContent=[d.year,d.country,d.duration].filter(Boolean).join(' · '); $('kinozal-detail-genres').textContent=d.genres; $('kinozal-detail-overview').textContent=d.overview; if(safeImage(d.poster))setImage($('kinozal-detail-poster'),d.poster); clear($('kinozal-detail-badges')); function kb(t,k){if(!t)return;var x=document.createElement('span');x.className='detail-badge '+(k||'');x.textContent=t;$('kinozal-detail-badges').appendChild(x);} if(d.kp)kb('КП '+d.kp,'rating'); if(d.imdb)kb('IMDb '+d.imdb,'imdb'); if(d.quality)kb(d.quality,''); $('kinozal-tech').textContent=[d.quality&&('Качество: '+d.quality),d.video&&('Видео: '+d.video),d.audio&&('Аудио: '+d.audio),d.language&&('Язык: '+d.language),d.size&&('Размер: '+d.size),d.duration&&('Продолжительность: '+d.duration)].filter(Boolean).join('\n'); $('kinozal-release-info').textContent=[d.director&&('Режиссёр: '+d.director),d.cast&&('В ролях: '+d.cast)].filter(Boolean).join('\n'); loadKinozalCast(d); }
    catch(e){$('kinozal-detail-overview').textContent='Не удалось загрузить карточку: '+e.message;toast(e.message);}
  }
  function closeKinozalDetail() { $('kinozal-detail-view').hidden = true; if (state.view === 'history') { renderHistory(); var h = $('history-grid').querySelector('.poster-card'); if (h) h.focus(); else $('history-open').focus(); return; } if (state.kzDetailTrigger && document.body.contains(state.kzDetailTrigger)) state.kzDetailTrigger.focus(); else { var f=$('kinozal-grid').querySelector('button'); if(f)f.focus(); } }
  function openKinozalTorrents() {
    if(!state.kzDetail){toast('Карточка ещё загружается');return;} var list=$('kinozal-torrent-list');clear(list);$('kinozal-torrent-status').textContent='Выберите качество/раздачу. Чем больше сидов, тем стабильнее старт.'; $('kinozal-torrent-dialog').hidden=false;
    state.kzDetail.variants.forEach(function(v){var b=makeButton('', 'torrent-button', function(){playKinozalTorrent(v);});var strong=document.createElement('strong');strong.textContent=v.current?'Текущая: '+v.title:v.title;var small=document.createElement('small');small.textContent=[v.format,v.size,v.seeds?'Сиды: '+v.seeds:'',v.peers?'Пиры: '+v.peers:''].filter(Boolean).join(' · ');b.append(strong,small);list.appendChild(b);}); var first=list.querySelector('button');if(first)first.focus();
  }
  function closeKinozalTorrents(){ $('kinozal-torrent-dialog').hidden=true; $('kinozal-watch').focus(); }
  async function uploadKinozalTorrent(release, context) {
    var ctx=context||state.kzDetail||{}, url='/download.php?id=' + encodeURIComponent(release.id); var buf=await kinozalGet(url,true); var blob=new Blob([buf],{type:'application/x-bittorrent'}); var fd=new FormData(); fd.append('file',blob,'kinozal-'+release.id+'.torrent'); fd.append('title',release.title||ctx.title||'Kinozal'); fd.append('poster',ctx.poster||''); fd.append('category',ctx.mediaType==='tv'?'tv':'movie');
    var srv=serverSettings(), headers={},auth=serverAuthHeader(srv);if(auth)headers.Authorization=auth; var r=await fetch(srv.url+'/torrent/upload',{method:'POST',headers:headers,body:fd});if(!r.ok)throw new Error('TorrServer HTTP '+r.status);var st=await r.json();if(Array.isArray(st))st=st[0];if(!st||!st.hash)throw new Error('TorrServer не принял .torrent');
    for(var i=0;i<40&&(!st.file_stats||!st.file_stats.length);i+=1){await sleep(650);var q=await serverFetch('/torrents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'get',hash:st.hash})});if(q.ok)st=await q.json();} return st;
  }
  async function playKinozalTorrent(release) {
    if(!(await checkTorrServer(true))){toast('TorrServer не запущен');return;} $('kinozal-torrent-status').textContent='Скачиваем .torrent с Кинозала и передаём TorrServer…';
    try { var st=await uploadKinozalTorrent(release),files=(st.file_stats||[]).filter(function(f){return isVideoFile(f.path);});if(!files.length)files=st.file_stats||[];if(!files.length)throw new Error('В раздаче не найдено файлов'); if(files.length===1){$('kinozal-torrent-dialog').hidden=true;playTorrentFile(st.hash,files[0]);return;} var list=$('kinozal-torrent-list');clear(list);$('kinozal-torrent-status').textContent='Выберите файл или серию:';files.forEach(function(file){var b=makeButton(file.path,'torrent-button',function(){$('kinozal-torrent-dialog').hidden=true;playTorrentFile(st.hash,file);});var sm=document.createElement('small');sm.textContent=file.length?(file.length/1073741824).toFixed(2)+' ГБ':'';b.appendChild(sm);list.appendChild(b);});var first=list.querySelector('button');if(first)first.focus(); }
    catch(e){$('kinozal-torrent-status').textContent='Ошибка: '+e.message;toast(e.message);}
  }

  function setBadge(text, kind) { if (!text) return; var badge = document.createElement('span'); badge.className = 'detail-badge' + (kind ? ' ' + kind : ''); badge.textContent = text; $('detail-badges').appendChild(badge); }
  function renderFacts(detail, item) {
    var facts = model.detailFacts(detail, item); clear($('detail-badges'));
    if (facts.voteAverage) setBadge('★ ' + facts.voteAverage.toFixed(1), 'rating'); if (facts.imdbRating) setBadge('IMDb ' + facts.imdbRating.toFixed(1), 'imdb'); if (facts.ageRating) setBadge(String(facts.ageRating), 'age');
    var meta = []; if (facts.year) meta.push(facts.year); meta.push(facts.mediaType === 'tv' ? 'Сериал' : 'Фильм'); if (facts.runtime) meta.push(formatRuntime(facts.runtime)); if (facts.countries.length) meta.push(facts.countries.join(', ')); if (facts.voteCount) meta.push(formatVotes(facts.voteCount) + ' оценок');
    $('detail-meta').textContent = meta.join(' · '); $('detail-genres').textContent = facts.genres.length ? facts.genres.join(' • ') : '';
  }
  function appendCastCards(cast, list) {
    cast.forEach(function (person) {
      var card = document.createElement('button'); card.type = 'button'; card.className = 'cast-card focusable';
      var img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; if (safeImage(person.photo)) setImage(img, person.photo);
      var copy = document.createElement('div'); var strong = document.createElement('strong'); strong.textContent = person.name; var small = document.createElement('small'); small.textContent = person.role;
      copy.append(strong, small); card.append(img, copy); card.addEventListener('click', function () { openPerson(person, card); }); list.appendChild(card);
    });
  }
  function renderCast(detail) {
    var cast = model.castItems(detail).slice(0, 24); var list = $('cast-list'); clear(list); $('credits-section').hidden = !cast.length;
    appendCastCards(cast, list);
  }
  function renderSimilar(detail) { var items = model.similarItems(detail).slice(0, 14); var grid = $('similar-grid'); clear(grid); $('similar-section').hidden = !items.length; items.forEach(function (item) { grid.appendChild(renderCard(item)); }); }

  async function openPerson(person, trigger) {
    state.personTrigger = trigger || null; $('person-view').hidden = false; $('person-name').textContent = person.name; $('person-original-name').textContent = ''; $('person-count').textContent = 'Загрузка…'; $('person-note').textContent = ''; clear($('person-credits'));
    if (safeImage(person.photo)) setImage($('person-photo'), person.photo); else $('person-photo').removeAttribute('src'); $('person-photo').alt = person.name; $('person-back').focus();
    try {
      var results = await personResults(person);
      if ($('person-view').hidden) return; var info = model.personInfo(results[0], person); var credits = model.personCreditItems(results[1]);
      $('person-name').textContent = info.name; $('person-original-name').textContent = info.originalName && info.originalName !== info.name ? info.originalName : '';
      if (safeImage(info.photo)) setImage($('person-photo'), info.photo); $('person-count').textContent = 'Работ в каталоге: ' + (results[1].total || credits.length);
      credits.forEach(function (item) { $('person-credits').appendChild(renderCard(item, item.character || item.roles.join(', '))); });
      $('person-note').textContent = credits.length ? 'Выберите фильм или сериал, чтобы открыть карточку.' : 'Фильмография в API не найдена.';
    } catch (error) { $('person-count').textContent = ''; $('person-note').textContent = 'Не удалось загрузить актёра: ' + error.message; toast('Актёр: ' + error.message); }
  }
  function closePerson() { $('person-view').hidden = true; if (state.personTrigger && document.body.contains(state.personTrigger)) state.personTrigger.focus(); else $('detail-back').focus(); }

  async function openDetail(item, trigger) {
    state.detailTrigger = trigger || null; state.detailItem = item; state.detail = null; state.sources = []; state.torrentsLoaded = false; $('person-view').hidden = true; $('detail-view').hidden = false; $('torrent-section').hidden = true; clear($('torrent-list'));
    $('detail-title').textContent = item.title; $('detail-meta').textContent = [item.year, item.mediaType === 'tv' ? 'Сериал' : 'Фильм'].filter(Boolean).join(' · '); $('detail-genres').textContent = ''; $('detail-overview').textContent = item.overview || 'Описание отсутствует';
    if (safeImage(item.poster)) setImage($('detail-poster'), item.poster); else $('detail-poster').removeAttribute('src'); $('detail-poster').alt = item.title; $('detail-backdrop').style.backgroundImage = safeImage(item.backdrop) ? 'url("' + item.backdrop.replace(/"/g, '%22') + '")' : '';
    clear($('detail-badges')); clear($('season-tabs')); clear($('source-list')); clear($('cast-list')); clear($('similar-grid')); $('credits-section').hidden = true; $('similar-section').hidden = true; $('source-note').textContent = 'Загружаем карточку и источники…'; updateFavoriteButton(); $('detail-back').focus();
    try {
      var detail = await fetchJson(model.detailUrl(item.id)); if (state.detailItem !== item || $('detail-view').hidden) return; state.detail = detail; state.sources = model.directSources(detail); $('detail-overview').textContent = detail.overview || item.overview || 'Описание отсутствует';
      var poster = model.imageUrl(detail.poster_url || detail.posterUrl || '', 'w500'), backdrop = model.imageUrl(detail.backdrop_url || detail.backdropUrl || '', 'w1280'); if (safeImage(poster)) setImage($('detail-poster'), poster); if (safeImage(backdrop)) $('detail-backdrop').style.backgroundImage = 'url("' + backdrop.replace(/"/g, '%22') + '")';
      renderFacts(detail, item); renderCast(detail); renderSimilar(detail);
      var seasons = Array.from(new Set(state.sources.map(function (x) { return x.season; }).filter(function (x) { return x != null; }))); state.season = seasons.length ? seasons[0] : null;
      seasons.forEach(function (number) { var b = makeButton('Сезон ' + number, 'season-tab' + (number === state.season ? ' active' : ''), function () { state.season = number; renderSources(); }); b.dataset.season = number; $('season-tabs').appendChild(b); }); renderSources();
    } catch (error) { $('source-note').textContent = 'Не удалось загрузить карточку: ' + error.message; toast('Ошибка карточки: ' + error.message); }
  }
  function visibleSources() { if (state.season == null) return state.sources.filter(function (x) { return x.season == null; }); return state.sources.filter(function (x) { return x.season === state.season; }); }
  function renderSources() {
    var list = $('source-list'); clear(list); Array.from($('season-tabs').children).forEach(function (b) { b.classList.toggle('active', Number(b.dataset.season) === state.season); }); var sources = visibleSources();
    sources.forEach(function (source) {
      var b = makeButton(source.label, 'source-button', function () { playSource(source); });
      var small = document.createElement('small');
      var format = source.type.indexOf('mpegurl') !== -1 ? 'HLS' : (source.type.indexOf('mp4') !== -1 ? 'MP4' : 'Видео');
      small.textContent = ['Качество: ' + (source.quality || 'авто'), source.provider, format].filter(Boolean).join(' · ');
      b.appendChild(small); list.appendChild(b);
    });
    $('source-note').textContent = sources.length ? 'Выберите озвучку и качество, затем нажмите OK.' : 'Прямых видеопотоков нет. Проверьте «Торренты».';
  }
  function chooseSource() {
    var sources = visibleSources(); if (!sources.length && state.sources.length) { state.season = state.sources[0].season; renderSources(); sources = visibleSources(); }
    if (!sources.length) { toast('Прямой поток не найден. Попробуйте «Торренты».'); return; }
    $('sources-section').scrollIntoView({ block: 'start' });
    var first = $('source-list').querySelector('button'); if (first) first.focus();
    toast(sources.length > 1 ? 'Выберите озвучку и качество' : 'Подтвердите источник кнопкой OK');
  }

  function serverSettings() { return { url: (localStorage.getItem('seena.torrserver.url') || 'http://127.0.0.1:8090').replace(/\/$/, ''), user: localStorage.getItem('seena.torrserver.user') || '', pass: localStorage.getItem('seena.torrserver.pass') || '' }; }
  function serverAuthHeader(s) { return s.user ? 'Basic ' + btoa(unescape(encodeURIComponent(s.user + ':' + s.pass))) : ''; }
  function serverFetch(path, options) {
    var s = serverSettings(), opts = options || {}; opts.headers = opts.headers || {}; opts.headers.Accept = opts.headers.Accept || 'application/json'; var auth = serverAuthHeader(s); if (auth) opts.headers.Authorization = auth;
    return fetch(s.url + path, opts);
  }
  async function checkTorrServer(updateUi) {
    var el = $('torrserver-status'); if (updateUi && el) { el.textContent = 'TorrServer: проверка…'; el.className = 'server-status'; }
    try {
      var r = await serverFetch('/echo');
      if (r.status === 401 || r.status === 403) { if (updateUi && el) { el.textContent = 'TorrServer: доступен · нужна авторизация'; el.className = 'server-status auth'; } return false; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var version = (await r.text()).trim(); if (updateUi && el) { el.textContent = 'TorrServer: онлайн' + (version ? ' · ' + version : ''); el.className = 'server-status ok'; } return true;
    }
    catch (e) { if (updateUi && el) { el.textContent = 'TorrServer: нет соединения'; el.className = 'server-status bad'; } return false; }
  }
  function serverMediaUrl(path) {
    var s = serverSettings(); if (!s.user) return s.url + path;
    var match = s.url.match(/^(https?:\/\/)(.*)$/i); if (!match) return s.url + path;
    return match[1] + encodeURIComponent(s.user) + ':' + encodeURIComponent(s.pass) + '@' + match[2] + path;
  }
  async function addTorrentToServer(torrent) {
    if (!torrent.link) throw new Error('В ответе Seena нет magnet/link');
    var payload = { action: 'add', link: torrent.link, title: state.detailItem ? state.detailItem.title : torrent.name, category: state.detailItem && state.detailItem.mediaType === 'tv' ? 'tv' : 'movie', poster: state.detailItem ? state.detailItem.poster : '', save_to_db: false };
    var r = await serverFetch('/torrents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (!r.ok) throw new Error('TorrServer HTTP ' + r.status); var st = await r.json();
    if (!st.hash) throw new Error('TorrServer не вернул hash');
    for (var i = 0; i < 30 && (!st.file_stats || !st.file_stats.length); i += 1) { await sleep(700); r = await serverFetch('/torrents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get', hash: st.hash }) }); if (r.ok) st = await r.json(); }
    return st;
  }
  function isVideoFile(path) { return /\.(mkv|mp4|m4v|avi|mov|ts|m2ts|webm|mpg|mpeg|vob)$/i.test(path || ''); }
  async function playTorrent(torrent) {
    if (!(await checkTorrServer(true))) { toast('TorrServer не запущен. Откройте настройки/приложение TorrServer.'); openServerDialog(); return; }
    $('torrent-note').textContent = 'TorrServer получает метаданные торрента…';
    try {
      var st = await addTorrentToServer(torrent); var files = (st.file_stats || []).filter(function (f) { return isVideoFile(f.path); }); if (!files.length) files = st.file_stats || [];
      if (!files.length) throw new Error('В торренте не найдено файлов');
      if (files.length === 1) { playTorrentFile(st.hash, files[0]); return; }
      clear($('torrent-list')); $('torrent-note').textContent = 'Выберите файл/серию из торрента:';
      files.forEach(function (file) { var b = makeButton(file.path, 'torrent-button', function () { playTorrentFile(st.hash, file); }); var small = document.createElement('small'); small.textContent = file.length ? (file.length / 1073741824).toFixed(2) + ' ГБ' : ''; b.appendChild(small); $('torrent-list').appendChild(b); });
      var first = $('torrent-list').querySelector('button'); if (first) first.focus();
    } catch (error) { $('torrent-note').textContent = 'TorrServer: ' + error.message; toast(error.message); }
  }
  function playTorrentFile(hash, file) { playSource({ label: 'TorrServer · ' + file.path.split('/').pop(), url: serverMediaUrl('/play/' + encodeURIComponent(hash) + '/' + encodeURIComponent(file.id)), type: '', torrent: true }); }
  function torrentLabel(torrent) { return [torrent.quality, torrent.voice, torrent.size ? String(torrent.size) : '', torrent.seeders ? 'S:' + torrent.seeders : ''].filter(Boolean).join(' · '); }
  async function openTorrents() {
    if (!state.detailItem) return; $('torrent-section').hidden = false; $('torrent-note').textContent = 'Загружаем торренты…'; $('torrent-section').scrollIntoView({ block: 'start' }); checkTorrServer(true);
    if (state.torrentsLoaded) { var ex = $('torrent-list').querySelector('button'); if (ex) ex.focus(); return; } clear($('torrent-list'));
    try { var response = await fetchJson(model.torrentsUrl(state.detailItem.id)); var torrents = model.torrentItems(response); state.torrentsLoaded = true;
      torrents.forEach(function (torrent) { var b = makeButton(torrent.name, 'torrent-button', function () { playTorrent(torrent); }); var small = document.createElement('small'); small.textContent = torrentLabel(torrent); b.appendChild(small); $('torrent-list').appendChild(b); });
      $('torrent-note').textContent = torrents.length ? 'Выберите торрент — Seena передаст magnet/link локальному TorrServer.' : 'Для этого материала торренты не найдены.'; var first = $('torrent-list').querySelector('button'); if (first) first.focus();
    } catch (error) { $('torrent-note').textContent = 'Не удалось загрузить торренты: ' + error.message; toast('Торренты недоступны: ' + error.message); }
  }
  function closeTorrents() { $('torrent-section').hidden = true; $('torrents-open').focus(); }
  function openServerDialog() { var s = serverSettings(); $('server-url').value = s.url; $('server-user').value = s.user; $('server-pass').value = s.pass; $('server-dialog-status').textContent = ''; $('server-dialog').hidden = false; $('server-url').focus(); }
  function closeServerDialog() { $('server-dialog').hidden = true; if (!$('torrent-section').hidden) $('torrserver-settings').focus(); }
  async function testServerDialog() { $('server-dialog-status').textContent = 'Проверка…'; var url = $('server-url').value.replace(/\/$/, ''), user = $('server-user').value, pass = $('server-pass').value; try { var headers = {}; if (user) headers.Authorization = 'Basic ' + btoa(unescape(encodeURIComponent(user + ':' + pass))); var r = await fetch(url + '/echo', { headers: headers }); if (r.status === 401 || r.status === 403) { $('server-dialog-status').textContent = 'Сервер найден, но логин или пароль неверны (HTTP ' + r.status + ').'; return; } if (!r.ok) throw new Error('HTTP ' + r.status); $('server-dialog-status').textContent = 'Подключение успешно: ' + (await r.text()).trim(); } catch (e) { $('server-dialog-status').textContent = 'Нет соединения: ' + e.message; } }
  function saveServerDialog() { localStorage.setItem('seena.torrserver.url', $('server-url').value.replace(/\/$/, '')); localStorage.setItem('seena.torrserver.user', $('server-user').value); localStorage.setItem('seena.torrserver.pass', $('server-pass').value); closeServerDialog(); checkTorrServer(true); toast('Настройки TorrServer сохранены'); }

  function showOsd(focus) {
    $('player-top').classList.add('visible');
    $('player-osd').classList.add('visible');
    clearTimeout(state.osdTimer);
    if (focus) $('player-playpause').focus();
    state.osdTimer = setTimeout(function () {
      if (!$('track-menu').hidden || $('player').paused || $('player-status').textContent) return;
      hideOsd();
    }, 5000);
  }
  function hideOsd() {
    clearTimeout(state.osdTimer);
    $('player-top').classList.remove('visible');
    $('player-osd').classList.remove('visible');
    $('player').focus();
  }
  function toggleOsd() {
    if ($('player-osd').classList.contains('visible')) hideOsd();
    else showOsd(false);
  }
  function updatePlayButton() { $('player-playpause').textContent = $('player').paused ? '▶ Пуск' : 'Ⅱ Пауза'; }
  function seekBy(seconds) { var v = $('player'); if (!Number.isFinite(v.duration)) return; v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + seconds)); updateProgress(); showOsd(false); }
  function seekToPointer(event) { var v = $('player'); if (!Number.isFinite(v.duration) || v.duration <= 0) return; var bar = $('player-progress'), rect = bar.getBoundingClientRect(); if (!rect.width) return; var ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)); v.currentTime = ratio * v.duration; updateProgress(); showOsd(false); }
  function stopPlayer() { var v = $('player'); state.historyPending = null; clearTimeout(state.osdTimer); v.pause(); v.removeAttribute('src'); v.load(); $('player-view').hidden = true; $('track-menu').hidden = true; if (!$('detail-view').hidden) $('play-now').focus(); else if (!$('kinozal-detail-view').hidden) $('kinozal-watch').focus(); }
  function currentHistoryItem() {
    var kinozal = !$('kinozal-detail-view').hidden, item = kinozal ? state.kzDetail : state.detailItem;
    if (!item) return null;
    return { source: kinozal ? 'kinozal' : 'catalog', id: item.id, title: item.title,
      fullTitle: item.fullTitle || '', poster: item.poster || '', year: item.year || '',
      mediaType: item.mediaType, format: item.format || '', overview: item.overview || '', watchedAt: Date.now() };
  }
  function playSource(source) {
    state.playerSource = source; state.historyPending = currentHistoryItem(); var video = $('player'); $('player-view').hidden = false; var playTitle = state.historyPending ? state.historyPending.title : 'Видео'; $('player-title').textContent = playTitle + ' · ' + source.label; $('player-status').textContent = 'Подключение…';
    video.pause(); video.removeAttribute('src'); while (video.firstChild) video.removeChild(video.firstChild); video.load(); video.src = source.url; video.load(); var promise = video.play(); if (promise && promise.catch) promise.catch(function () { $('player-status').textContent = 'Не удалось запустить поток. Попробуйте другой источник.'; }); showOsd(true); updatePlayButton();
  }
  function openTrackMenu(kind) {
    var video = $('player'), list = $('track-menu-list'); clear(list); $('track-menu').hidden = false; $('track-menu-title').textContent = kind === 'audio' ? 'Аудиодорожки' : 'Субтитры';
    if (kind === 'audio') {
      var tracks = video.audioTracks; if (!tracks || !tracks.length) { var p = document.createElement('p'); p.className = 'muted'; p.textContent = 'Плеер не сообщил доступные аудиодорожки.'; list.appendChild(p); }
      else Array.prototype.forEach.call(tracks, function (track, index) { var b = makeButton((track.label || track.language || 'Дорожка ' + (index + 1)), 'track-option' + (track.enabled ? ' active' : ''), function () { Array.prototype.forEach.call(tracks, function (x, i) { x.enabled = i === index; }); openTrackMenu('audio'); }); list.appendChild(b); });
    } else {
      var texts = video.textTracks; var off = makeButton('Выкл.', 'track-option' + ((!texts || !Array.prototype.some.call(texts, function (t) { return t.mode === 'showing'; })) ? ' active' : ''), function () { if (texts) Array.prototype.forEach.call(texts, function (t) { t.mode = 'disabled'; }); openTrackMenu('subs'); }); list.appendChild(off);
      if (!texts || !texts.length) { var pp = document.createElement('p'); pp.className = 'muted'; pp.textContent = 'В потоке нет WebVTT/textTracks, доступных webOS.'; list.appendChild(pp); }
      else Array.prototype.forEach.call(texts, function (track, index) { var b2 = makeButton(track.label || track.language || 'Субтитры ' + (index + 1), 'track-option' + (track.mode === 'showing' ? ' active' : ''), function () { Array.prototype.forEach.call(texts, function (x, i) { x.mode = i === index ? 'showing' : 'disabled'; }); openTrackMenu('subs'); }); list.appendChild(b2); });
    }
    var first = list.querySelector('button'); if (first) first.focus(); clearTimeout(state.osdTimer); $('player-top').classList.add('visible'); $('player-osd').classList.add('visible');
  }
  function closeTrackMenu() { $('track-menu').hidden = true; $('player-playpause').focus(); showOsd(false); }
  function updateProgress() {
    var v = $('player'), finite = Number.isFinite(v.duration) && v.duration > 0, percent = finite ? Math.max(0, Math.min(100, v.currentTime / v.duration * 100)) : 0, buffered = 0, bufferAhead = 0;
    $('player-current').textContent = formatTime(v.currentTime); $('player-duration').textContent = finite ? formatTime(v.duration) : '--:--'; $('player-progress-fill').style.width = percent + '%'; $('player-progress-thumb').style.left = percent + '%'; $('player-progress').setAttribute('aria-valuenow', String(Math.round(percent)));
    if (finite && v.buffered && v.buffered.length) { try { var end = 0; for (var i = 0; i < v.buffered.length; i += 1) { if (v.buffered.start(i) <= v.currentTime + 1 && v.buffered.end(i) >= v.currentTime) { end = v.buffered.end(i); break; } if (v.buffered.end(i) > end) end = v.buffered.end(i); } buffered = Math.max(0, Math.min(100, end / v.duration * 100)); bufferAhead = Math.max(0, end - v.currentTime); } catch (e) { buffered = 0; bufferAhead = 0; } }
    $('player-progress-buffer').style.width = buffered + '%'; $('player-buffer-info').textContent = 'Буфер +' + formatTime(bufferAhead);
  }
  function setBuffering(active, text) { var el = $('player-buffer-info'); el.classList.toggle('buffering', active); if (active) { $('player-status').textContent = text || 'Буферизация…'; el.textContent = 'Буферизация…'; showOsd(false); } else if ($('player-status').textContent === 'Буферизация…' || $('player-status').textContent === 'Ожидание данных…') { $('player-status').textContent = ''; updateProgress(); showOsd(false); } }

  function openExitDialog() {
    $('exit-dialog').hidden = false;
    $('exit-cancel').focus();
  }
  function closeExitDialog() {
    $('exit-dialog').hidden = true;
    var target = document.querySelector('.nav-item.active') || $('search-open');
    if (target) target.focus();
  }
  function exitApp() {
    window.close();
  }

  function back() {
    if (!$('web-player-view').hidden) { closeWebPlayer(); return; }
    if (!$('exit-dialog').hidden) { closeExitDialog(); return; }
    if (!$('cache-dialog').hidden) { closeCacheSettings(); return; }
    if (!$('filter-dialog').hidden) { closeFilterDialog(); return; }
    if (!$('sort-dialog').hidden) { closeSortDialog(); return; }
    if (!$('server-dialog').hidden) { closeServerDialog(); return; }
    if (!$('kinozal-filter-dialog').hidden) { closeKinozalFilter(); return; }
    if (!$('search-keyboard').hidden) { hideKinozalKeyboard(); $('search-input').focus(); return; }
    if (!$('kinozal-account-keyboard').hidden) { hideKinozalKeyboard(); $('kinozal-account-remember').focus(); return; }
    if (!$('kinozal-account-dialog').hidden) { closeKinozalAccount(); return; }
    if (!$('kinozal-search-dialog').hidden) { closeKinozalSearch(); return; }
    if (!$('kinozal-torrent-dialog').hidden) { closeKinozalTorrents(); return; }
    if (!$('player-view').hidden) { if (!$('track-menu').hidden) closeTrackMenu(); else stopPlayer(); return; }
    if (!$('person-view').hidden) { closePerson(); return; }
    if (!$('kinozal-detail-view').hidden) { closeKinozalDetail(); return; }
    if (!$('detail-view').hidden) { $('detail-view').hidden = true; state.detailItem = null; if (state.view === 'history') { renderHistory(); var watched = $('history-grid').querySelector('.poster-card'); if (watched) watched.focus(); else $('history-open').focus(); return; } var base = state.view === 'search' ? $('search-grid') : $('catalog-grid'); var first = base.querySelector('button'); if (first) first.focus(); return; }
    if (state.view === 'search') { showBase('catalog'); $('search-open').focus(); return; }
    if (state.view === 'kinozal') { showBase('catalog'); var kback = document.querySelector('.nav-item.active') || $('kinozal-open'); if (kback) kback.focus(); return; }
    if (state.view === 'history') { showBase('catalog'); $('history-open').focus(); return; }
    if (state.view === 'tv') { showBase('catalog'); $('tv-open').focus(); return; }
    if (state.view === 'sport') { showBase('catalog'); $('sport-open').focus(); return; }
    openExitDialog();
  }
  function centerTopMenuItem(item) {
    var menu = $('top-menu'), box = menu.getBoundingClientRect(), target = item.getBoundingClientRect();
    menu.scrollLeft += target.left - box.left - (box.width - target.width) / 2;
  }
  function moveTopMenu(direction) {
    var menu = $('top-menu'), items = Array.from(menu.querySelectorAll('.focusable')).filter(function (item) { return item.getBoundingClientRect().width > 0; });
    var index = items.indexOf(document.activeElement); if (index < 0) return false;
    var next = model.horizontalNavigationIndex(index, direction, items.length);
    if (next === index) return true;
    items[next].focus(); centerTopMenuItem(items[next]); return true;
  }
  function moveFocus(direction) {
    var scope = !$('web-player-view').hidden ? $('web-player-view') : !$('exit-dialog').hidden ? $('exit-dialog') : !$('cache-dialog').hidden ? $('cache-dialog') : !$('filter-dialog').hidden ? $('filter-dialog') : !$('sort-dialog').hidden ? $('sort-dialog') : !$('server-dialog').hidden ? $('server-dialog') : !$('kinozal-filter-dialog').hidden ? $('kinozal-filter-dialog') : !$('search-keyboard').hidden ? $('search-keyboard') : !$('kinozal-account-keyboard').hidden ? $('kinozal-account-keyboard') : !$('kinozal-account-dialog').hidden ? $('kinozal-account-dialog') : !$('kinozal-search-dialog').hidden ? $('kinozal-search-dialog') : !$('kinozal-torrent-dialog').hidden ? $('kinozal-torrent-dialog') : !$('player-view').hidden ? $('player-view') : !$('person-view').hidden ? $('person-view') : !$('kinozal-detail-view').hidden ? $('kinozal-detail-view') : !$('detail-view').hidden ? $('detail-view') : state.view === 'search' ? $('search-view') : state.view === 'kinozal' ? $('kinozal-view') : state.view === 'history' ? $('history-view') : state.view === 'tv' ? $('tv-view') : state.view === 'sport' ? $('sport-view') : document;
    var elements = Array.from(scope.querySelectorAll('.focusable')).filter(function (el) { return !el.hidden && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0; }); if (!elements.length) return;
    var current = document.activeElement; if (elements.indexOf(current) < 0) { elements[0].focus(); return; } var a = current.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2, best = null, score = Infinity;
    elements.forEach(function (el) { if (el === current) return; var r = el.getBoundingClientRect(), dx = r.left + r.width / 2 - ax, dy = r.top + r.height / 2 - ay; var primary = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy; if (primary <= 5) return; var secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx); var value = primary + secondary * 2.5; if (value < score) { score = value; best = el; } });
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  }
  function wheelCards(event) {
    if (!$('player-view').hidden || !$('detail-view').hidden || !$('kinozal-detail-view').hidden ||
        !$('person-view').hidden || document.activeElement.tagName === 'INPUT' ||
        Array.from(document.querySelectorAll('.dialog-backdrop')).some(function (dialog) { return !dialog.hidden; })) return;
    var grid = state.view === 'catalog' ? $('catalog-grid') : state.view === 'search' ? $('search-grid') :
      state.view === 'kinozal' ? $('kinozal-grid') : state.view === 'history' ? $('history-grid') : null;
    if (!grid) return;
    var cards = Array.from(grid.querySelectorAll('.poster-card'));
    if (!cards.length) return;
    var delta = event.deltaY || -event.wheelDelta;
    if (!delta) return;
    event.preventDefault();
    var current = document.activeElement, chosen = null;
    if (cards.indexOf(current) < 0) chosen = delta > 0 ? cards[0] : cards[cards.length - 1];
    else {
      var rect = current.getBoundingClientRect(), cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2, score = Infinity;
      cards.forEach(function (card) {
        if (card === current) return;
        var next = card.getBoundingClientRect(), dx = Math.abs(next.left + next.width / 2 - cx);
        var dy = (next.top + next.height / 2 - cy) * (delta > 0 ? 1 : -1);
        if (dy <= 5) return;
        var value = dy + dx * 2.5;
        if (value < score) { score = value; chosen = card; }
      });
    }
    if (chosen) { chosen.focus(); chosen.scrollIntoView({ block: 'center', inline: 'nearest' }); }
  }
  document.addEventListener('wheel', wheelCards, { passive: false });

  document.addEventListener('keydown', function (event) {
    var key = event.keyCode; if (key === 461 || key === 27 || key === 8 && document.activeElement.tagName !== 'INPUT') { event.preventDefault(); back(); return; }
    if (!$('player-view').hidden) {
      var video = $('player'); showOsd(false);
      if (!$('track-menu').hidden) { var td = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' }; if (td[key]) { event.preventDefault(); moveFocus(td[key]); return; } if (key === 13 && document.activeElement.tagName === 'BUTTON') { event.preventDefault(); document.activeElement.click(); return; } }
      if (key === 415) { event.preventDefault(); video.play(); return; } if (key === 19) { event.preventDefault(); video.pause(); return; } if (key === 413) { event.preventDefault(); stopPlayer(); return; }
      if (key === 412) { event.preventDefault(); seekBy(-30); return; } if (key === 417) { event.preventDefault(); seekBy(30); return; }
      if ((key === 37 || key === 39) && document.activeElement === $('player-progress')) { event.preventDefault(); seekBy(key === 37 ? -10 : 10); return; }
      if ((key === 37 || key === 39) && (document.activeElement === video || document.activeElement === document.body || !$('player-osd').classList.contains('visible'))) { event.preventDefault(); seekBy(key === 37 ? -10 : 10); return; }
      if (key === 13 && document.activeElement.tagName === 'BUTTON') { event.preventDefault(); document.activeElement.click(); return; }
      if (key === 13 || key === 32) { event.preventDefault(); if (video.paused) video.play(); else video.pause(); return; }
      var pd = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' }; if (pd[key]) { event.preventDefault(); moveFocus(pd[key]); return; }
    }
    if (document.activeElement.tagName === 'INPUT') return;
    if ((key === 37 || key === 39) && $('top-menu').contains(document.activeElement)) { event.preventDefault(); moveTopMenu(key === 37 ? 'left' : 'right'); return; }
    var dirs = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' }; if (dirs[key]) { event.preventDefault(); moveFocus(dirs[key]); } else if (key === 13 && document.activeElement.tagName === 'BUTTON') { event.preventDefault(); document.activeElement.click(); }
  });

  $('history-open').addEventListener('click', showHistory); $('search-open').addEventListener('click', function () { showBase('search'); if (!state.searchItems.length || state.searchMode !== 'catalog') loadDiscovery(false, false); else $('search-input').focus(); }); $('search-form').addEventListener('submit', function (event) { event.preventDefault(); search($('search-input').value); }); $('filter-open').addEventListener('click', openFilterDialog); $('sort-open').addEventListener('click', openSortDialog); $('filter-apply').addEventListener('click', applyFilters); $('filter-reset').addEventListener('click', resetFilters); $('filter-cancel').addEventListener('click', closeFilterDialog); $('sort-cancel').addEventListener('click', closeSortDialog); Array.from(document.querySelectorAll('.sort-option')).forEach(function (b) { b.addEventListener('click', function () { chooseSort(b.dataset.sort); }); }); $('search-load-more').addEventListener('click', function () { loadDiscovery(true, false); }); $('load-more').addEventListener('click', function () { loadCatalog(state.catalog, true); });
  $('tv-open').addEventListener('click', function () { showBase('tv'); var first = $('tv-view').querySelector('.service-card'); if (first) first.focus(); });
  $('sport-open').addEventListener('click', openSports);
  Array.from(document.querySelectorAll('[data-tv-url]')).forEach(function (button) { button.addEventListener('click', function () { var url = model.inAppTvUrl(button.dataset.tvUrl); if (!url) { toast('Адрес канала недоступен'); return; } openWebPlayer(url, button.querySelector('strong').textContent, button); }); });
  $('kinozal-open').addEventListener('click', async function () { showBase('kinozal'); try { await restoreSportNetwork(); } catch (_) { return; } if (!state.kzLoaded || Date.now() - state.kzLoadedAt >= 24 * 60 * 60 * 1000) loadKinozal(false); else { var first = $('kinozal-grid').querySelector('button'); if (first) first.focus(); } }); $('kinozal-more').addEventListener('click', function () { loadKinozal(true); }); $('kinozal-filter-open').addEventListener('click', openKinozalFilter); $('kinozal-content-refresh').addEventListener('click', refreshKinozalContent); $('kinozal-filter-apply').addEventListener('click', applyKinozalFilter); $('kinozal-filter-reset').addEventListener('click', resetKinozalFilter); $('kinozal-filter-cancel').addEventListener('click', closeKinozalFilter); $('kinozal-account-open').addEventListener('click', openKinozalAccount); $('kinozal-session-refresh').addEventListener('click', refreshKinozalSession); $('kinozal-account-remember').addEventListener('click', toggleKinozalRemember); $('kinozal-account-login').addEventListener('click', loginKinozalAccount); $('kinozal-account-test').addEventListener('click', testKinozalAccount); $('kinozal-account-save').addEventListener('click', saveKinozalAccount); $('kinozal-account-cancel').addEventListener('click', closeKinozalAccount); $('kinozal-detail-back').addEventListener('click', closeKinozalDetail); $('kinozal-watch').addEventListener('click', openKinozalTorrents); $('kinozal-torrent-cancel').addEventListener('click', closeKinozalTorrents);
  $('cache-open').addEventListener('click', openCacheSettings); $('cache-close').addEventListener('click', closeCacheSettings); $('cache-clear').addEventListener('click', clearSeenaCache);
  Array.from(document.querySelectorAll('.cache-size')).forEach(function (button) { button.addEventListener('click', function () { setCacheLimit(Number(button.dataset.cacheMb), button); }); });
  ['kinozal-account-user', 'kinozal-account-pass'].forEach(function (id) {
    $(id).addEventListener('focus', function () { scheduleKinozalKeyboard(this); });
    $(id).addEventListener('click', function () { scheduleKinozalKeyboard(this); });
    $(id).addEventListener('input', function () { clearTimeout(kinozalKeyboardTimer); });
    $(id).addEventListener('keydown', function (event) {
      if (event.keyCode === 13) { event.preventDefault(); event.stopPropagation(); activateKinozalInput(this); }
    });
  });
  $('search-input').addEventListener('focus', function () { scheduleKinozalKeyboard(this); });
  $('search-input').addEventListener('click', function () { scheduleKinozalKeyboard(this); });
  $('search-input').addEventListener('input', function () { clearTimeout(kinozalKeyboardTimer); });
  $('top-menu').addEventListener('focusin', function (event) { if (event.target.classList.contains('focusable')) centerTopMenuItem(event.target); });
  document.addEventListener('keyboardStateChange', function (event) {
    kinozalSystemKeyboardVisible = Boolean(event.detail && event.detail.visibility);
    if (kinozalSystemKeyboardVisible) hideKinozalKeyboard();
  });
  $('web-player-back').addEventListener('click', closeWebPlayer);
  $('detail-back').addEventListener('click', back); $('person-back').addEventListener('click', closePerson); $('player-back').addEventListener('click', back); $('play-now').addEventListener('click', chooseSource); $('torrents-open').addEventListener('click', openTorrents); $('detail-kinozal').addEventListener('click', openKinozalSearch); $('kinozal-search-more').addEventListener('click', function(){loadKinozalSearch(true);}); $('kinozal-search-cancel').addEventListener('click', closeKinozalSearch); $('torrent-close').addEventListener('click', closeTorrents); $('favorite-toggle').addEventListener('click', toggleFavorite);
  $('torrserver-settings').addEventListener('click', openServerDialog); $('server-cancel').addEventListener('click', closeServerDialog); $('server-test').addEventListener('click', testServerDialog); $('server-save').addEventListener('click', saveServerDialog);
  $('exit-cancel').addEventListener('click', closeExitDialog); $('exit-confirm').addEventListener('click', exitApp);
  $('player-rewind').addEventListener('click', function () { seekBy(-10); }); $('player-forward').addEventListener('click', function () { seekBy(30); }); $('player-stop').addEventListener('click', stopPlayer); $('player-playpause').addEventListener('click', function () { var v = $('player'); if (v.paused) v.play(); else v.pause(); }); $('player-audio').addEventListener('click', function () { openTrackMenu('audio'); }); $('player-subs').addEventListener('click', function () { openTrackMenu('subs'); }); $('track-menu-close').addEventListener('click', closeTrackMenu); $('player-progress').addEventListener('click', seekToPointer); $('player').addEventListener('click', toggleOsd); $('player-view').addEventListener('mousemove', function () { showOsd(false); });
  $('player').addEventListener('playing', function () { if (state.historyPending) { try { history.record(localStorage, state.historyPending); } catch (_) { toast('Не удалось сохранить историю просмотров'); } state.historyPending = null; } $('player-status').textContent = ''; setBuffering(false); updatePlayButton(); updateProgress(); showOsd(false); }); $('player').addEventListener('canplay', function () { setBuffering(false); updateProgress(); }); $('player').addEventListener('waiting', function () { setBuffering(true, 'Буферизация…'); }); $('player').addEventListener('stalled', function () { setBuffering(true, 'Ожидание данных…'); }); $('player').addEventListener('progress', updateProgress); $('player').addEventListener('pause', function () { updatePlayButton(); showOsd(false); }); $('player').addEventListener('timeupdate', updateProgress); $('player').addEventListener('durationchange', updateProgress); $('player').addEventListener('loadedmetadata', function () { updateProgress(); showOsd(false); }); $('player').addEventListener('error', function () { $('player-status').textContent = 'Ошибка воспроизведения. Формат/кодек или сервер может не поддерживаться ТВ.'; showOsd(false); });

  seedKinozalConfig();
  loadFilterMetadata();
  fetchJson(model.BASE + 'catalogs').then(function (result) { state.catalogs = result.catalogs || { all_movies: 'Фильмы', all_tv: 'Сериалы' }; renderNav(); loadCatalog(state.catalog, false); }).catch(function () { state.catalogs = { all_movies: 'Фильмы', all_tv: 'Сериалы' }; renderNav(); loadCatalog(state.catalog, false); });
}());
