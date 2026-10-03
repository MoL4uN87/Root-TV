const { test } = require('node:test');
const assert = require('node:assert/strict');

test('sport network lease restores VPN on release and after a lost heartbeat', () => {
  let VpnLease;
  try { VpnLease = require('../helper/seena-vpn-lease.js'); }
  catch (_) { VpnLease = function () {}; }

  const actions = [];
  const timers = [];
  const lease = new VpnLease({
    stopVpn: () => actions.push('stop'),
    startVpn: () => actions.push('start'),
    setTimer: callback => { timers.push(callback); return timers.length; },
    clearTimer: () => {},
    timeoutMs: 45_000
  });

  lease.acquire();
  lease.keepAlive();
  assert.deepEqual(actions, ['stop']);
  lease.release();
  assert.deepEqual(actions, ['stop', 'start']);

  lease.acquire();
  timers.at(-1)();
  assert.deepEqual(actions, ['stop', 'start', 'stop', 'start']);
  assert.equal(lease.status().active, false);
});
