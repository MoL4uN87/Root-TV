# Установка VPN на rooted LG webOS TV

> Проверенная схема проекта: **sing-box + Hysteria2 + TUN** на rooted LG webOS.  
> Проверено на LG OLED55C1RLA/webOS 6 с root и SSH.

## Что получится

После настройки:

- весь нужный IPv4-трафик TV может идти через `tun0`;
- SSH и локальная сеть остаются доступны через `wlan0`;
- до самого VPN-сервера создаётся отдельный direct route через обычный шлюз;
- VPN можно включать и выключать скриптами;
- конфигурация хранится в persistent-каталоге и переживает reboot.

## 1. Проверить ROOT и TUN

**Терминал:** Windows PowerShell.

```powershell
ssh lg-tv
```

На TV:

```sh
id
uname -m
ls -l /dev/net/tun
iptables --version
ip route
```

В проверенной конфигурации:

```text
architecture: aarch64
/dev/net/tun: присутствует
iptables: 1.6.2
default route: через wlan0
```

Без `/dev/net/tun` эта схема не заработает.

## 2. Каталоги VPN

Persistent-каталог:

```text
/var/lib/webosbrew/lgvpn/
```

Используемая структура:

```text
/var/lib/webosbrew/lgvpn/bin/
/var/lib/webosbrew/lgvpn/config/
/var/lib/webosbrew/lgvpn/log/
```

Основной бинарник:

```text
/var/lib/webosbrew/lgvpn/bin/sing-box
```

В рабочем варианте использовался:

```text
sing-box 1.14.0
ARM64-musl
```

Проверка:

```sh
/var/lib/webosbrew/lgvpn/bin/sing-box version
```

## 3. Конфигурация Hysteria2

Основной config проекта:

```text
/var/lib/webosbrew/lgvpn/config/vpn.json
```

В GitHub нельзя сохранять реальные:

```text
Hysteria2 password/auth
VLESS UUID
private keys
cookies
```

В документации и шаблонах использовать placeholders:

```text
<VPN_SERVER>
<VPN_PORT>
<HYSTERIA2_PASSWORD>
<SNI>
```

Проверенная сеть TUN:

```text
interface: tun0
address:   172.18.0.1/30
MTU:       1400
auto_route: false
stack:     system
```

`auto_route:false` используется потому, что маршруты на webOS задаются отдельными root-скриптами.

## 4. Скрипты управления

В рабочей установке использовались:

```text
/var/lib/webosbrew/lgvpn/lgvpn-start
/var/lib/webosbrew/lgvpn/lgvpn-stop
/var/lib/webosbrew/lgvpn/lgvpn-status
```

Позднее backend 0.2.0 также поддерживал изменение endpoint и сохранял backup предыдущих конфигураций.

### Что делает `lgvpn-start`

Логика запуска:

1. определяет обычный gateway TV;
2. создаёт direct route до VPN endpoint через `wlan0`;
3. запускает `sing-box`;
4. ждёт появления `tun0`;
5. добавляет две IPv4 route через TUN;
6. направляет выбранные DNS-адреса через TUN.

Рабочая схема маршрутов:

```text
<VPN_SERVER_IP>/32 -> обычный gateway через wlan0

0.0.0.0/1          -> tun0
128.0.0.0/1        -> tun0

1.1.1.1/32         -> tun0
9.9.9.9/32         -> tun0
```

Разделение default route на две `/1` позволяет оставить исходный default route системы и при этом отправить интернет-трафик через VPN.

### Почему нужен отдельный маршрут до VPN-сервера

Если отправить IP самого Hysteria2-сервера внутрь `tun0`, получится routing loop:

```text
TV -> VPN tunnel -> VPN server -> VPN tunnel -> ...
```

Поэтому endpoint VPN всегда должен идти напрямую:

```text
VPN server -> wlan0
```

## 5. Запуск

На TV:

```sh
/var/lib/webosbrew/lgvpn/lgvpn-start
```

Проверить:

```sh
/var/lib/webosbrew/lgvpn/lgvpn-status
```

Также:

```sh
ip addr show tun0
ip route
```

Ожидается наличие:

```text
tun0
172.18.0.1/30
0.0.0.0/1
128.0.0.0/1
```

## 6. Остановка

```sh
/var/lib/webosbrew/lgvpn/lgvpn-stop
```

После остановки:

```sh
ip addr show tun0
ip route
```

VPN-маршруты должны исчезнуть, а обычный интернет через `wlan0` восстановиться.

## 7. Проверка внешнего IP

Сравните внешний IPv4 до и после запуска VPN.

На TV можно использовать доступный HTTPS-сервис определения IP через `curl`.

Важно: адрес до VPN и после VPN должны отличаться.

## 8. DNS

В рабочей схеме маршруты к публичным DNS направлялись через `tun0`:

```text
1.1.1.1/32
9.9.9.9/32
```

Не следует судить о DNS только по `/etc/resolv.conf`, потому что webOS может использовать локальный resolver.

Проверять нужно фактический сетевой маршрут и работоспособность DNS после включения туннеля.

## 9. IPv6

Чтобы IPv6 не обходил IPv4 VPN, в рабочей конфигурации IPv6 отключался в ConnMan:

```text
IPv6.Configuration = Method=off
```

После изменения нужно отдельно проверить, что публичной IPv6-связности нет.

## 10. Persistent запуск

VPN находится в:

```text
/var/lib/webosbrew/lgvpn
```

То есть конфигурация и бинарники переживают обычную перезагрузку TV.

Перед автоматическим стартом после reboot сначала убедитесь, что ручные:

```sh
lgvpn-start
lgvpn-stop
lgvpn-status
```

работают стабильно.

## 11. Интеграция с Seena

В проекте Seena используется:

```text
helper/seena-vpn-lease.js
```

Он не должен хранить пароль Hysteria2.

Его задача — работать с уже установленным LGVPN и временно менять сетевой режим для отдельных источников, после чего возвращать предыдущее состояние.

## 12. Диагностика

Если после включения VPN пропал интернет:

```sh
ip addr show tun0
ip route
ps | grep sing-box
```

Проверьте:

- запущен ли `sing-box`;
- появился ли `tun0`;
- есть ли direct route до VPN endpoint;
- есть ли две `/1` route через `tun0`;
- не ушёл ли сам VPN endpoint в `tun0`;
- работает ли DNS.

Если после VPN пропал SSH, первым делом проверять маршрутизацию LAN и `wlan0`.

## 13. Что нельзя публиковать

Никогда не коммитить:

```text
реальный Hysteria2 password
реальный auth
VLESS UUID
private key
shortId
SSH private keys
cookies
account.json
cookies.json
```
