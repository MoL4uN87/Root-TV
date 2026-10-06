# Индекс найденных чатов Root TV

Краткий указатель на разговоры, из которых восстановлена техническая история проекта.

| Дата | Тема | Что важно |
| --- | --- | --- |
| 2026-06-27 | VPN для LG webOS | Вывод: обычному webOS app недостаточно прав для full-TV VPN; нужен root/отдельный gateway. Обсуждались sing-box/Xray/Hysteria2. |
| 2026-09-07 | Root + SSH + VPN | Root через SlopBro, Homebrew `Root status: ok`, root SSH; затем рабочий sing-box/Hysteria2 TUN, routes, DNS и IPv6 policy. |
| 2026-09-16 | Root TV / LG VPN 0.2.0 | Зафиксированы модель/прошивка, persistent backend `/var/lib/webosbrew/lgvpn`, scripts `lgvpn-start/stop/status`, server/port UI. |
| 2026-09-30 | Seena на rooted TV | Passwordless SSH alias `lg-tv`, безопасная установка webOS app, запрет трогать KERNEL/ROOTFS/TVSERVICE. |
| 2026-10-04 | Seena helper + VPN lease | Persistent helper `/var/lib/webosbrew/seena-helper`, health `127.0.0.1:8787`, startup/watchdog и интеграция с LGVPN. |

Полные секреты/credential-строки из чатов в репозиторий не переносятся. В документации оставлена только архитектура и воспроизводимые безопасные сведения.
