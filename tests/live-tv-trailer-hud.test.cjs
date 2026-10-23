// Usage: node tests/live-tv-trailer-hud.test.cjs "C:\...\Seena-WebOS-Backup-...\app\trailer-youtube.html"
// This test never connects to YouTube or modifies the installed TV app.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const file = process.argv[2] || process.env.SEENA_LIVE_TRAILER_HTML;
if (!file) throw new Error('Supply the path to the patched live trailer-youtube.html');
const html = fs.readFileSync(file, 'utf8');
const match = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
assert.ok(match, 'inline YouTube controller missing');
new vm.Script(match[1]);
assert.match(html, /#trailer-tap-surface\{[^}]*bottom:55px/);
assert.match(html, /#remote-controls\[hidden\]\{display:none\}/);

const dom = { activeElement: null, listeners: {}, head: { appendChild() {} } };
const els = new Map();
class Element {
  constructor(id) {
    this.id = id;
    this.hidden = ['language-menu', 'quality-help'].includes(id);
    this.tagName = ['back','rewind','toggle','forward','language','quality','language-close','quality-close','language-search'].includes(id) ? 'BUTTON' : 'DIV';
    this.value = '0'; this.textContent = ''; this.children = [];
    this.style = {}; this.listeners = {};
  }
  addEventListener(type, action) { this.listeners[type] = action; }
  focus() { dom.activeElement = this; }
  setAttribute() {}
  appendChild(x) { this.children.push(x); this.firstChild=this.children[0]; }
  removeChild(x) { this.children.splice(this.children.indexOf(x),1); this.firstChild=this.children[0]; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  click() { if (this.listeners.click) this.listeners.click({ preventDefault() {} }); }
}
function el(id) {
  if (!els.has(id)) els.set(id, new Element(id));
  return els.get(id);
}
dom.getElementById = el;
dom.createElement = tag => { const x = new Element(''); x.tagName = tag.toUpperCase(); return x; };
dom.addEventListener = (type,fn) => { dom.listeners[type] = fn; };
const calls = {play:0,pause:0,seek:0};
const youtube = {
  getPlayerState() { return 1; },
  getCurrentTime() { return 12; },
  getDuration() { return 90; },
  playVideo() { calls.play++; },
  pauseVideo() { calls.pause++; },
  seekTo() { calls.seek++; },
  loadVideoById() {},
  destroy() {}
};
const state = {};
const win = {listeners:{},addEventListener(type,fn){this.listeners[type]=fn}};
win.parent=win;
vm.runInNewContext(match[1], {
  document:dom,window:win,URLSearchParams,
  location:{search:'?id=abcdefghijk',origin:'http://127.0.0.1:8787'},
  YT:{PlayerState:{PLAYING:1},Player:function(_,opts){state.options=opts;return youtube;}},
  setInterval(){return 1},clearInterval(){},
  JSON,Math,Number,String,Array
});
win.onYouTubeIframeAPIReady();
state.options.events.onReady({target:youtube});
const playBefore = calls.play;
assert.equal(dom.activeElement,el('trailer-tap-surface'));
el('trailer-tap-surface').click();
assert.equal(el('remote-controls').hidden,true);
el('trailer-tap-surface').click();
assert.equal(el('remote-controls').hidden,false);
assert.equal(calls.pause,0);
assert.equal(calls.play,playBefore);
function key(code,id) {
  el(id).focus();
  let prevented=false;
  dom.listeners.keydown({keyCode:code,preventDefault(){prevented=true}});
  assert.equal(prevented,true);
}
key(13,'trailer-tap-surface');
assert.equal(el('remote-controls').hidden,true);
key(32,'trailer-tap-surface');
assert.equal(el('remote-controls').hidden,false);
assert.equal(calls.pause,0);
el('toggle').click();
assert.equal(calls.pause,1);
key(19,'trailer-tap-surface');
assert.equal(calls.pause,2);
key(415,'trailer-tap-surface');
assert.equal(calls.play,playBefore+1);
key(179,'trailer-tap-surface');
assert.equal(calls.pause,3);
el('rewind').click();
el('forward').click();
assert.equal(calls.seek,2);
el('language').click();
assert.equal(el('language-menu').hidden,false);
el('trailer-tap-surface').click();
assert.equal(el('remote-controls').hidden,false);
el('language-close').click();
el('quality').click();
assert.equal(el('quality-help').hidden,false);
el('quality-close').click();
assert.equal(state.options.playerVars.controls,1);
console.log('PASS: YouTube trailer tap, OK, play/pause, seek, modal and native controls');
