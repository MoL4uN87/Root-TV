const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appSource = fs.readFileSync(
  path.join(__dirname, '..', 'seena-0.3.32', 'com.seena.webos', 'app.js'),
  'utf8'
);
const handlerSource = appSource.match(
  /document\.addEventListener\('keydown', function \(event\) \{[\s\S]*?\n  \}\);/
);
assert.ok(handlerSource, 'The webOS keydown handler must be found');

function press(keyCode, focused = 'video') {
  const calls = { toggle: 0, show: 0, play: 0, pause: 0, stop: 0, click: 0, prevent: 0 };
  const video = {
    tagName: 'VIDEO',
    paused: false,
    play() { calls.play++; },
    pause() { calls.pause++; }
  };
  const button = { tagName: 'BUTTON', click() { calls.click++; } };
  const elements = {
    'player-view': { hidden: false },
    'track-menu': { hidden: true },
    'player': video,
    'player-osd': { classList: { contains: () => true } },
    'top-menu': { contains: () => false }
  };
  let onKeydown;
  const document = {
    body: { tagName: 'BODY' },
    activeElement: focused === 'button' ? button : video,
    addEventListener(type, callback) {
      assert.equal(type, 'keydown');
      onKeydown = callback;
    }
  };
  vm.runInNewContext(handlerSource[0], {
    document,
    $: id => elements[id],
    showOsd: () => calls.show++,
    toggleOsd: () => calls.toggle++,
    back() {},
    stopPlayer: () => calls.stop++,
    closeTrackMenu() {},
    seekBy() {},
    moveFocus() {}
  });
  assert.equal(typeof onKeydown, 'function');
  onKeydown({ keyCode, preventDefault() { calls.prevent++; } });
  return calls;
}

test('pressing OK or Space over video toggles menus without pausing playback', () => {
  for (const key of [13, 32]) {
    const c = press(key);
    assert.equal(c.toggle, 1);
    assert.equal(c.play, 0);
    assert.equal(c.pause, 0);
    assert.equal(c.prevent, 1);
  }
});

test('OK on a focused control still activates that button', () => {
  const c = press(13, 'button');
  assert.equal(c.click, 1);
  assert.equal(c.toggle, 0);
  assert.equal(c.pause, 0);
});

test('dedicated remote media keys continue controlling playback', () => {
  const pause = press(19);
  assert.equal(pause.pause, 1);
  assert.equal(pause.toggle, 0);
  const play = press(415);
  assert.equal(play.play, 1);
  assert.equal(play.toggle, 0);
  const stop = press(413);
  assert.equal(stop.stop, 1);
  assert.equal(stop.toggle, 0);
});

test('Magic Remote video clicks still toggle the OSD directly', () => {
  assert.match(appSource, /\$\('player'\)\.addEventListener\('click', toggleOsd\)/);
  assert.match(appSource, /function toggleOsd\(\)/);
});
