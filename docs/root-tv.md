# Root на LG webOS TV

Этот документ собирает рабочие выводы из чатов проекта **Root TV**. Секреты, пароли и приватные ключи намеренно не сохраняются в репозитории.

## Телевизор

- Модель: **LG OLED55C1RLA**.
- В ранних шагах использовалась прошивка **03.53.45**, webOS 6.x; позже система определялась как **webOS 6.5.3**.
- Ядро сообщает `aarch64`; часть пользовательского окружения webOS имеет отдельные ABI-ограничения, поэтому бинарники всегда нужно проверять на самом TV.
- Hostname: `LGwebOSTV`.

## История root

### 2026-09-07 — получение root

Root был получен через **SlopBro** с использованием Git/PowerShell. После завершения Homebrew Channel показывал:

```text
Root status: ok
```

Для этой прошивки старые варианты RootMy.TV/DejaVuln/faultmanager не использовались как основной путь.

### SSH

После root доступен root SSH. В рабочем окружении позднее был настроен отдельный SSH-ключ и алиас `lg-tv`, чтобы автоматизация не требовала ввода пароля.

Рекомендуемая локальная конфигурация использует отдельный ключ, например:

```text
~/.ssh/lg_webos_codex
```

Пароли и приватные ключи в Git не сохраняются.

## Критические ограничения

Никогда не перезаписывать и не заменять системные разделы/компоненты:

- `KERNEL`
- `ROOTFS`
- `TVSERVICE`

Для приложений использовать штатные механизмы webOS (`com.webos.appInstallService`, `luna-send-pub`) либо безопасное копирование только в writable/persistent каталоги Homebrew и Developer Mode.

Не модифицировать `/etc/ld.so.preload` ради Seena/helper. Не подменять системные библиотеки в `/lib` и `/usr`.

## Persistent-каталоги проекта

В текущей архитектуре используются:

```text
/media/developer/apps/usr/palm/applications/com.seena.webos
/var/lib/webosbrew/seena-helper
/var/lib/webosbrew/lgvpn
/var/lib/webosbrew/init.d
```

Временные эксперименты допустимы в `/tmp`, но всё, что должно переживать reboot, переносится в persistent-каталог.

## Полезные проверки

```sh
uname -a
id
ls -l /dev/net/tun
iptables --version
ip addr
ip route
```

Для Seena/helper:

```sh
curl -fsS http://127.0.0.1:8787/health
```

## Связанные чаты проекта

- **2026-09-07** — root LG C1, SSH, затем настройка системного VPN.
- **2026-09-16** — фиксация рабочего root/Homebrew и развитие LG VPN 0.2.0.
- **2026-09-30** — passwordless SSH `lg-tv`, безопасная установка Seena на rooted webOS.
- **2026-10-04** — persistent Seena helper, startup hook и интеграция с уже установленным LGVPN.

## Что не должно попадать в Git

- приватные SSH-ключи;
- root-пароли;
- Kinozal `uid`, `pass`, `cf_clearance`;
- Hysteria2 password/auth;
- VLESS UUID/private material;
- готовые runtime-конфиги с реальными секретами;
- браузерные cookie-базы.
