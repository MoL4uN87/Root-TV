# VPN на rooted LG webOS TV

Документ собирает рабочую конфигурацию LG VPN из чатов проекта Root TV. Значения аутентификации удалены; реальные секреты должны храниться только локально на TV.

## Почему нужен root

Обычное webOS-приложение работает в sandbox и не получает системный TUN/routing/iptables. Для VPN всего телевизора использовались root-доступ, `sing-box`, `/dev/net/tun` и системные маршруты.

## Рабочая конфигурация — 2026-09-07

На TV были подтверждены:

```text
/dev/net/tun
iptables 1.6.2
wlan0
```

VPN реализован через **sing-box + Hysteria2**.

Persistent-каталог:

```text
/var/lib/webosbrew/lgvpn/
```

Основные элементы:

```text
/var/lib/webosbrew/lgvpn/bin/sing-box
/var/lib/webosbrew/lgvpn/config/config.json
/var/lib/webosbrew/lgvpn/config/vpn.json
/var/lib/webosbrew/lgvpn/log/sing-box.log
/var/lib/webosbrew/lgvpn/log/vpn.log
```

Скрипты управления:

```text
lgvpn-start
lgvpn-stop
lgvpn-status
```

В последующей версии LG VPN 0.2.0 настройки сервера/порта сохранялись в `/var/lib/webosbrew/lgvpn/config/`; при изменениях backend делал резервные копии существующих скриптов/конфига.

## TUN и маршрутизация

Рабочий TUN:

```text
interface: tun0
address:   172.18.0.1/30
MTU:       1400
```

Для полного IPv4-трафика использовалось разбиение default route:

```text
0.0.0.0/1      -> tun0
128.0.0.0/1    -> tun0
```

Маршрут до самого VPN-сервера обязательно остаётся напрямую через `wlan0`, иначе возникает routing loop.

Также LAN/SSH остаётся direct через `wlan0`, чтобы после включения VPN не потерять управление телевизором.

Пример логики:

```text
VPN server /32 -> gateway on wlan0
LAN            -> wlan0
Internet       -> tun0
```

## DNS

В рабочем варианте DNS-адреса направлялись через `tun0`:

```text
1.1.1.1/32 -> tun0
9.9.9.9/32 -> tun0
```

При этом системный `/etc/resolv.conf` webOS мог указывать на локальные resolver-адреса (`127.0.0.1` / `::1`), поэтому проверять нужно фактический маршрут DNS-запроса, а не только содержимое файла.

## IPv6

Для предотвращения обхода VPN IPv6 был отключён в ConnMan (`IPv6.Configuration = Method=off`). Публичной IPv6-связности после этого не оставалось; служебные p2p-маршруты могли сохраняться.

## Проверка ON/OFF

В тестах 2026-09-07 внешний IPv4 менялся после включения VPN, что подтвердило прохождение трафика через туннель. Конкретные публичные IP и VPN credentials намеренно не фиксируются в Git.

Проверять состояние можно так:

```sh
/var/lib/webosbrew/lgvpn/lgvpn-status
ip addr show tun0
ip route
```

И отдельно проверить внешний адрес через доверенный сервис определения IP.

## Интеграция с Seena

В текущем проекте Seena использует helper `seena-vpn-lease.js` для временного управления уже установленным LGVPN в сценариях, где отдельный источник должен идти напрямую.

Seena helper не должен хранить Hysteria2 password в исходниках. Он взаимодействует с существующей установкой LGVPN и восстанавливает предыдущее состояние после завершения lease.

Startup hook Seena может убедиться, что LGVPN поднят перед обращением к сетевым источникам, но не должен переписывать VPN config.

## История чатов

- **2026-06-27** — архитектурное обсуждение VPN для webOS: sandbox vs root, sing-box/Xray/Hysteria.
- **2026-09-07** — рабочий TUN, routing, DNS, IPv6 и Hysteria2 на rooted LG C1.
- **2026-09-16** — LG VPN 0.1.1 → 0.2.0, UI server/port, persistent backend и direct route до VPN endpoint.
- **2026-10-04** — интеграция LGVPN с Seena helper и `seena-vpn-lease.js`.

## Безопасность

Никогда не коммитить:

```text
Hysteria2 auth/password
VLESS UUID/private key/shortId
cookies
SSH private keys
account.json
cookies.json
```

Если credential когда-либо публиковался в чате, issue, log или commit, считать его скомпрометированным и ротировать.
