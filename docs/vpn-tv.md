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

## 14. Исправление зависшего PID и задержки на webOS (октябрь 2026)

На телевизоре были подтверждены две проблемы:

- Старый файл `vpn.pid` указывал на посторонний процесс. Проверка одного лишь `kill -0` ошибочно сообщала `VPN_ALREADY_CONNECTED`, даже когда `sing-box` не был запущен.
- В установленном `sleep` дробная задержка `sleep 0.1` не поддерживалась.
- Остановка по одному PID могла завершить посторонний процесс.

Исправление: перед использованием PID сравнивать `readlink /proc/<PID>/exe` с исполняемым файлом `sing-box` и заменить цикл ожидания интерфейса `tun0` на пять попыток с `sleep 1`.

В репозитории есть **[vpn/apply-lgvpn-fixes.sh](../vpn/apply-lgvpn-fixes.sh)** — скрипт, который воспроизводит это исправление **только на уже установленной LGVPN со знакомой структурой скриптов**. Он не устанавливает sing-box, не меняет настройки подключения и не требует VPN-пароля. Для неизвестной версии он завершится с ошибкой без изменения рабочих файлов.

Для локально клонированного репозитория в PowerShell:

```powershell
Get-Content -Raw .\vpn\apply-lgvpn-fixes.sh | ssh lg-tv sh
```

Результаты: `LGVPN_PATCHED` (исправлено), `LGVPN_ALREADY_PATCHED` (исправлено ранее) или `ERROR=...` (неизвестная версия — ничего не менять вручную без проверки). При изменении создаётся отдельная резервная копия `backup-fix-YYYYMMDD-HHMMSS` в persistent-каталоге LGVPN. Скрипт **не перезапускает действующий VPN**. После применения проверить запуск и остановку обычными командами из разделов 5–7.

Для восстановления использовать сохранённые копии `lgvpn-start` и `lgvpn-stop`, предварительно остановив VPN. Не копировать в GitHub содержимое каталогов `config`, `log`, резервные копии с TV, PID-файлы или ссылку Hysteria2 с учётными данными. Действующая конфигурация остаётся **только на телевизоре**, а репозиторий содержит исключительно обезличенный код исправления.
