const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'seena-0.3.32',
  'com.seena.webos', 'trailer-youtube.html'), 'utf8');

function playerFixture() {
  const elements = {};
  const handlers = {};
  const yt = { played: 0, paused: 0, at: 25, duration: 120, seeked: [], options: null, state: 1 };
  const document = {
    activeElement: null,
    head: { appendChild(node) { assert.equal(node.src, 'https://www.youtube.com/iframe_api'); } },
    getElementById(id) {
      if (!elements[id]) {
        elements[id] = {
          id, hidden: id === 'quality-help', value: '0',
          style: {}, textContent: '', tagName: id === 'seek' ? 'INPUT' : 'BUTTON',
          listeners: {},
          setAttribute() {},
          addEventListener(type, listener) { this.listeners[type] = listener; },
          focus() { document.activeElement = this; }
        };
      }
      return elements[id];
    },
    addEventListener(type, listener) { handlers[type] = listener; },
    createElement(name) { return { tagName: name }; }
  };
  const frameWindow = {
    addEventListener(type, listener) { handlers['window:' + type] = listener; }
  };
  frameWindow.parent = frameWindow;
  const YT = {
    PlayerState: { PLAYING: 1, PAUSED: 2 },
    Player: function Player(name, options) {
      assert.equal(name, 'player');
      yt.options = options;
      return {
        getCurrentTime: () => yt.at,
        getDuration: () => yt.duration,
        getPlayerState: () => yt.state,
        seekTo(value) { yt.at = value; yt.seeked.push(value); },
        playVideo() { yt.played += 1; yt.state = 1; },
        pauseVideo() { yt.paused += 1; yt.state = 2; },
        destroy() {}
      };
    }
  };
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script, 'YouTube player script exists');
  const sandbox = {
    document, window: frameWindow, location: { search: '?id=Abc123XYZ_0',
      origin: 'http://127.0.0.1:8787' },
    URLSearchParams, YT, setInterval() { return 1; }, clearInterval() {}
  };
  vm.runInNewContext(script[1], sandbox, { filename: 'trailer-youtube.html' });
  frameWindow.onYouTubeIframeAPIReady();
  yt.options.events.onReady({ target: { playVideo() { yt.played += 1; } } });
  function key(code) {
    handlers.keydown({ keyCode: code, preventDefault() {} });
  }
  function click(id) { elements[id].listeners.click(); }
  return { elements, document, yt, key, click };
}

test('Seena trailer provides visible remote controls and retains native YouTube settings', () => {
  for (const id of ['back', 'rewind', 'toggle', 'forward', 'seek', 'quality', 'quality-help']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /controls: 1/);
  assert.doesNotMatch(html, /\.setPlaybackQuality\s*\(/);
  const f = playerFixture();
  assert.equal(f.yt.options.playerVars.controls, 1);
  assert.equal(f.yt.options.playerVars.origin, 'http://127.0.0.1:8787');
  assert.equal(f.document.activeElement.id, 'toggle');
  assert.equal(f.yt.played, 1);
});

test('LG remote seeks in both directions, toggles pause and plays again', () => {
  const f = playerFixture();
  f.key(39);
  assert.equal(f.yt.at, 35);
  f.key(37);
  assert.equal(f.yt.at, 25);
  f.key(19);
  assert.equal(f.yt.paused, 1);
  f.key(415);
  assert.equal(f.yt.played, 2);
  f.click('forward');
  assert.equal(f.yt.at, 35);
  f.elements.seek.value = '500';
  f.elements.seek.listeners.change();
  assert.equal(f.yt.at, 60);
});

test('quality button explains genuine YouTube menu without fake resolution toggles', () => {
  const f = playerFixture();
  f.click('quality');
  assert.equal(f.elements['quality-help'].hidden, false);
  assert.equal(f.document.activeElement.id, 'quality-close');
  f.key(461);
  assert.equal(f.elements['quality-help'].hidden, true);
  assert.equal(f.document.activeElement.id, 'quality');
  assert.match(html, /выбирает YouTube автоматически/);
});
