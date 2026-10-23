const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const model = require('../seena-0.3.32/com.seena.webos/model.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'seena-0.3.32',
  'com.seena.webos', 'trailer-youtube.html'), 'utf8');

test('Russian Seena trailer is preferred even if primary trailer is English', () => {
  const results = model.trailerCandidates({
    trailer: { site: 'YouTube', key: 'Abc123XYZ_0', lang: 'en',
      name: 'Official Trailer', type: 'Trailer' },
    videos: { results: [
      { site: 'YouTube', key: 'Abc123XYZ_1', iso_639_1: 'ru',
        name: 'Дублированный трейлер', type: 'Trailer' },
      { site: 'YouTube', key: 'Abc123XYZ_0', iso_639_1: 'en',
        name: 'Official Trailer', type: 'Trailer' },
      { site: 'YouTube', key: 'Abc123XYZ_2', iso_639_1: 'ru',
        name: 'Русский клип', type: 'Clip' }
    ] }
  }, {});
  assert.deepEqual(results.map(x => x.videoId), ['Abc123XYZ_1', 'Abc123XYZ_0']);
  assert.equal(results[0].lang, 'ru');
});

test('Trailers with unknown language are not falsely marked Russian', () => {
  const results = model.trailerCandidates({ videos: { results: [
    { site: 'YouTube', key: 'Abc123XYZ_0', name: 'Дюна — официальный трейлер',
      type: 'Trailer' },
    { site: 'YouTube', key: 'Abc123XYZ_1', name: 'Russian dubbed official trailer',
      type: 'Trailer' },
    { site: 'Vimeo', key: 'Abc123XYZ_2', lang: 'ru', type: 'Trailer' },
    { site: 'YouTube', key: '../unsafe', lang: 'ru', type: 'Trailer' }
  ] } });
  assert.deepEqual(results.map(x => x.lang), ['ru', '']);
  assert.equal(results.length, 2);
});

test('Player menu can load a different language trailer through the official IFrame API', () => {
  const children = [];
  const elements = {};
  const handlers = {};
  let loaded = '';
  const doc = {
    activeElement: null,
    head: { appendChild() {} },
    addEventListener(type, fn) { handlers[type] = fn; },
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(), className: '', textContent: '',
        listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; },
        focus() { doc.activeElement = this; }
      };
    },
    getElementById(id) {
      if (!elements[id]) {
        elements[id] = {
          id, className: '', textContent: '', value: '0',
          style: {}, hidden: id === 'language-menu' || id === 'quality-help',
          tagName: id === 'seek' ? 'INPUT' : 'BUTTON', listeners: {},
          setAttribute() {},
          addEventListener(type, fn) { this.listeners[type] = fn; },
          focus() { doc.activeElement = this; },
          appendChild(child) { children.push(child); },
          removeChild(child) { children.splice(children.indexOf(child), 1); },
          querySelector(q) { return q === '.selected'
            ? children.find(x => x.className.indexOf('selected') !== -1) : children[0]; },
          querySelectorAll() { return children; },
          get firstChild() { return children[0] || null; }
        };
      }
      return elements[id];
    }
  };
  const win = { addEventListener(type, fn) { handlers['window:' + type] = fn; } };
  win.parent = win;
  const YT = {
    PlayerState: { PLAYING: 1 },
    Player: function (_id, options) {
      assert.equal(options.playerVars.hl, 'ru');
      assert.equal(options.playerVars.cc_lang_pref, 'ru');
      return {
        getCurrentTime: () => 0, getDuration: () => 100,
        getPlayerState: () => 1, playVideo() {},
        pauseVideo() {}, seekTo() {}, loadVideoById(id) { loaded = id; },
        destroy() {}
      };
    }
  };
  const clips = [
    { id: 'Abc123XYZ_0', lang: 'en', title: 'Original Trailer' },
    { id: 'Abc123XYZ_1', lang: 'ru', title: 'Дубляж' }
  ];
  const query = '?id=Abc123XYZ_0&clips=' + encodeURIComponent(JSON.stringify(clips));
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script);
  vm.runInNewContext(script[1], { window: win, document: doc, YT,
    location: { search: query, origin: 'http://127.0.0.1:8787' },
    URLSearchParams, setInterval() { return 1; }, clearInterval() {} });
  win.onYouTubeIframeAPIReady();
  elements.language.listeners.click();
  assert.equal(elements['language-menu'].hidden, false);
  assert.equal(children.length, 2);
  assert.match(children[1].textContent, /Русский/);
  children[1].listeners.click();
  assert.equal(loaded, 'Abc123XYZ_1');
  assert.equal(elements['language-menu'].hidden, true);
});

test('User-initiated Russian search is wired without inventing audio tracks', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'seena-0.3.32',
    'com.seena.webos', 'app.js'), 'utf8');
  assert.match(app, /function searchRussianTrailer\(\)/);
  assert.match(app, /'\/video\/search\?q='/);
  assert.match(app, /'seena-youtube-trailer-control', action: 'add-clip'/);
  assert.match(html, /id="language-search"/);
  assert.doesNotMatch(html, /\.setAudioTrack\s*\(/);
});
