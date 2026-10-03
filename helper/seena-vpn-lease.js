'use strict';

function VpnLease(options) {
  options = options || {};
  this.stopVpn = options.stopVpn;
  this.startVpn = options.startVpn;
  this.setTimer = options.setTimer || setTimeout;
  this.clearTimer = options.clearTimer || clearTimeout;
  this.timeoutMs = options.timeoutMs || 45000;
  this.active = false;
  this.timer = null;
}

VpnLease.prototype._arm = function () {
  var self = this;
  if (this.timer !== null) this.clearTimer(this.timer);
  this.timer = this.setTimer(function () {
    self.timer = null;
    if (!self.active) return;
    try { self.startVpn(); self.active = false; }
    catch (_) { self._arm(); }
  }, this.timeoutMs);
};

VpnLease.prototype.acquire = function () {
  if (!this.active) {
    this.stopVpn();
    this.active = true;
  }
  this._arm();
  return this.status();
};

VpnLease.prototype.keepAlive = function () {
  if (!this.active) return this.acquire();
  this._arm();
  return this.status();
};

VpnLease.prototype.release = function () {
  if (!this.active) return this.status();
  if (this.timer !== null) { this.clearTimer(this.timer); this.timer = null; }
  try { this.startVpn(); this.active = false; }
  catch (error) { this._arm(); throw error; }
  return this.status();
};

VpnLease.prototype.status = function () { return { active: this.active }; };

module.exports = VpnLease;
