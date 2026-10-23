// Run: node tests/live-tv-trailer-topbar.test.cjs "C:\...\Seena-WebOS-Backup-...\app"
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
assert.ok(root, 'Pass the backed-up Seena webOS application directory');
const app = fs.readFileSync(path.join(root,'app.js'),'utf8');
const css = fs.readFileSync(path.join(root,'styles.css'),'utf8');
const html = fs.readFileSync(path.join(root,'trailer-youtube.html'),'utf8');
const code = app.match(/function V\(e,t,n,a\)\{[\s\S]+?(?=function K\()/);
assert.ok(code, 'Expected current minified webOS iframe open/close controller');
function harness(){
  const els = new Map(), focus=[];
  function get(id) {
    if (!els.has(id)) {
      const names=new Set();
      els.set(id, {
        hidden:id==='web-player-view',src:'',textContent:'',
        classList:{
          toggle(n,yes){yes?names.add(n):names.delete(n)},
          remove(n){names.delete(n)},
          contains(n){return names.has(n)}
        },
        focus(){focus.push(id)}
      });
    }
    return els.get(id);
  }
  const state={};
  const {V,H}=new Function('o','i','j','document',code[0]+';return {V,H}')(
    get,state,'http://127.0.0.1:8787',{body:{contains:()=>true}}
  );
  return {V,H,get,focus,state};
}
test('YouTube trailer hides outer top panel and focuses the iframe',()=>{
  const h=harness();
  h.V('http://127.0.0.1:8787/trailer/youtube?id=abc','Trailer',null,true);
  assert.equal(h.get('web-player-view').classList.contains('seena-youtube-trailer'),true);
  assert.equal(h.focus.at(-1),'web-player-frame');
  assert.match(css,/\.web-player-view\.seena-youtube-trailer \.web-player-top\{display:none\}/);
  assert.match(css,/\.web-player-view iframe\{display:block;width:100%;flex:1/);
  assert.match(html,/id="back"[^>]+>← Назад</);
});
test('Other embedded playback retains upper Back control',()=>{
  const h=harness();
  h.V('https://example.org/embed','Other',null,true);
  assert.equal(h.get('web-player-view').classList.contains('seena-youtube-trailer'),false);
  assert.equal(h.focus.at(-1),'web-player-back');
});
test('Closing YouTube trailer clears the mode for the next stream',()=>{
  const h=harness();
  h.V('http://127.0.0.1:8787/trailer/youtube?id=abc','Trailer',null,true);
  h.H();
  assert.equal(h.get('web-player-view').hidden,true);
  assert.equal(h.get('web-player-view').classList.contains('seena-youtube-trailer'),false);
  h.V('https://example.org/channel','Channel',null,false);
  assert.equal(h.get('web-player-view').classList.contains('seena-youtube-trailer'),false);
  assert.equal(h.focus.at(-1),'web-player-back');
});
