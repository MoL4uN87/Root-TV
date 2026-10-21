#!/bin/sh
# Repair the LGVPN process checks and BusyBox sleep compatibility.
# This file intentionally contains no server address or VPN credentials.
set -eu
umask 077

BASE=${LGVPN_BASE:-/var/lib/webosbrew/lgvpn}
START="$BASE/lgvpn-start"
STOP="$BASE/lgvpn-stop"

[ -f "$START" ] && [ -f "$STOP" ] || {
  echo 'ERROR=LGVPN_SCRIPTS_NOT_FOUND' >&2
  exit 1
}

old_start='  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then'
new_start='  if [ -n "$OLD_PID" ] && [ "$(readlink "/proc/$OLD_PID/exe" 2>/dev/null)" = "$BIN" ]; then'
old_loop='while [ "$I" -lt 30 ]; do'
new_loop='while [ "$I" -lt 5 ]; do'
old_sleep='  sleep 0.1'
new_sleep='  sleep 1'
old_stop='  [ -n "$PID" ] && kill "$PID" 2>/dev/null || true'
new_stop='  if [ -n "$PID" ] && [ "$(readlink "/proc/$PID/exe" 2>/dev/null)" = "$BASE/bin/sing-box" ]; then'

has_line() { grep -Fqx "$2" "$1"; }

# Only patch the exact known script layout; never rewrite an unknown version.
if has_line "$START" "$new_start" && has_line "$START" "$new_loop" && has_line "$START" "$new_sleep" && has_line "$STOP" "$new_stop"; then
  sh -n "$START" && sh -n "$STOP"
  echo 'LGVPN_ALREADY_PATCHED'
  exit 0
fi

if ! has_line "$START" "$old_start" || ! has_line "$START" "$old_loop" || ! has_line "$START" "$old_sleep" || ! has_line "$STOP" "$old_stop"; then
  echo 'ERROR=UNEXPECTED_SCRIPT_VERSION_NO_CHANGES' >&2
  exit 1
fi

if [ "$(sed -n '16p' "$START")" != "$old_start" ] || [ "$(sed -n '25p' "$STOP")" != "$old_stop" ]; then
  echo 'ERROR=UNEXPECTED_LINE_POSITIONS_NO_CHANGES' >&2
  exit 1
fi

backup="$BASE/backup-fix-$(date +%Y%m%d-%H%M%S)"
[ ! -e "$backup" ] || { echo 'ERROR=BACKUP_ALREADY_EXISTS' >&2; exit 1; }
mkdir "$backup"
cp -p "$START" "$STOP" "$backup/"

start_tmp="$BASE/.lgvpn-start.$$"
stop_tmp="$BASE/.lgvpn-stop.$$"
cleanup() { rm -f "$start_tmp" "$stop_tmp"; }
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

{
  sed -n '1,15p' "$START"
  printf '%s\n' "$new_start"
  sed -n '17,$p' "$START" | sed \
    -e 's/^  sleep 0\.1$/  sleep 1/' \
    -e 's/^while \[ "\$I" -lt 30 \]; do$/while [ "$I" -lt 5 ]; do/'
} > "$start_tmp"

{
  sed -n '1,24p' "$STOP"
  printf '%s\n' "$new_stop"
  printf '%s\n' '    kill "$PID" 2>/dev/null || true'
  printf '%s\n' '  fi'
  sed -n '26,$p' "$STOP"
} > "$stop_tmp"

sh -n "$start_tmp"
sh -n "$stop_tmp"
has_line "$start_tmp" "$new_start" && has_line "$start_tmp" "$new_loop" && has_line "$start_tmp" "$new_sleep" && has_line "$stop_tmp" "$new_stop" || {
  echo 'ERROR=PATCH_VALIDATION_FAILED_NO_CHANGES' >&2
  exit 1
}

chmod 755 "$start_tmp" "$stop_tmp"
mv "$stop_tmp" "$STOP"
mv "$start_tmp" "$START"

echo 'LGVPN_PATCHED'
echo "BACKUP=$backup"
echo 'Changes take effect on the next start/stop. The VPN was not restarted.'
