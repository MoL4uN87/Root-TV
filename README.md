# Seena 0.3.9: Kinozal через локальный helper

Целевая система: rooted LG webOS 6.5.x с 32-битным ARM userspace. Приложение обращается к `http://127.0.0.1:8787`; helper запрашивает Kinozal через patched ARMHF `curl-impersonate` 2.2.3 и передаёт `.torrent` в существующий UI Seena, который загружает его в TorrServer на `127.0.0.1:8090`.

В 0.3.9 верхняя строка плеера («К карточке» и название) скрывается вместе с нижними кнопками через 5 секунд воспроизведения без действий. Нажатие кнопки или движение указателя пульта показывает обе панели; при паузе, ошибке и открытом меню дорожек они остаются видимыми.

## Что выяснилось про Cloudflare

- Старый снимок `cf_clearance` был нерабочим: challenge появлялся даже в Yandex Browser. Новый снимок отличается по значению clearance; `uid` и `pass` остались прежними.
- В контролируемой серии на Windows `curl_cffi` с `chrome150` и обычным Chrome User-Agent получил 6/6 challenge 403. С User-Agent Yandex Browser 26.8 (`Chrome/150... YaBrowser/26.8...`) тот же клиент и cookies получил 3/6 HTTP 200. Значит User-Agent существенно влияет, но не устраняет нестабильность Cloudflare.
- TV `curl-impersonate` с `chrome150`, Yandex User-Agent и новым clearance получает HTTP 200 по HTTP/2, иногда вперемежку с challenge 403. Helper повторяет challenge до трёх раз и возвращает JSON ошибку, если все попытки отклонены.
- После reboot IPv6 запросы на TV истекали по тайм-ауту; `--ipv4` дал рабочее соединение. HTTP/3 на TV также истекал по тайм-ауту. Рабочая конфигурация использует HTTP/2 поверх IPv4.
- На этом TV прямой TLS к Kinozal зависает после reboot при отключённом LGVPN. После подключения уже установленного LGVPN тот же helper сразу вернул HTTP 200. По разрешению пользователя startup hook запускает LGVPN при загрузке (до 12 попыток); это направляет сетевой трафик TV через настроенный VPN-сервер. Если VPN не поднялся, helper возвращает понятную ошибку `vpn_disconnected`.
- Полное совпадение TLS/HTTP2 fingerprint с Yandex Browser не доказано. Автономного прохождения нового Cloudflare challenge на TV нет; Windows нужен для получения свежего clearance.

## Размещение на TV

| Путь | Назначение |
| --- | --- |
| `/media/developer/apps/usr/palm/applications/com.seena.webos` | Seena 0.3.9 |
| `/var/lib/webosbrew/seena-helper` | helper, patched curl, ARMHF runtime, `cookies.json` с правами `600` |
| `/home/r/l` | короткая ссылка на ARMHF ELF loader из persistent каталога |
| `/var/lib/webosbrew/init.d/seena-helper` | штатный Homebrew startup hook для LGVPN и helper |
| `/var/lib/webosbrew/seena-helper/seena-0.3.7-backup` | резервная копия установленной 0.3.7 |

Системные `/lib`, `/usr` и `/etc/ld.so.preload` не меняются. Предупреждение об `/lib/libSegFault.so` от старого preload для ARMHF runtime безвредно. Hook не меняет конфигурацию LGVPN; он запускает существующий `/var/lib/webosbrew/lgvpn/lgvpn-start`.

## Сборка и установка

В PowerShell из этого каталога:

```powershell
node --check helper/seena-kinozal-helper.js
node --check seena-0.3.9/com.seena.webos/app.js
node --test 'C:\Users\USER\Documents\ChatGPT\WebOS\build-0.3.7\model.test.cjs'
ares-package seena-0.3.9/com.seena.webos -o dist
./install.ps1
```

`install.ps1` использует SSH `root@192.168.1.95` и ключ `~/.ssh/lg_webos_codex`; параметры `-Tv` и `-Key` их переопределяют. Он сначала проверяет helper и HTTP 200 к Top, потом копирует 0.3.9 поверх установленного приложения. Архив `dist/com.seena.webos_0.3.9_all.ipk` собирается для хранения; на данном TV `ares-install` недоступен из-за прав на конфигурацию SSH, поэтому установка выполняется по SSH. Для повторной установки сохраните локальную папку `runtime/`: она содержит пропатченный бинарник и ARMHF библиотеки и намеренно не попадает в Git.

После копирования установщик даёт WebView доступ к файлам приложения, завершает уже запущенный процесс Seena и запускает новый. Это нужно при обновлении поверх работающей версии: иначе TV может оставить старую страницу в памяти или показать серый экран.

Проверка на TV:

```sh
curl -fsS http://127.0.0.1:8787/health
curl -fsS http://127.0.0.1:8787/kinozal/cookies/status
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8787/kinozal/top
/var/lib/webosbrew/lgvpn/lgvpn-status | head -1
```

Маршруты: `/health`, `/kinozal/top`, `/kinozal/search`, `/kinozal/details?id=…`, `/kinozal/torrent?id=…`, `/kinozal/image?url=…`, `/kinozal/cookies/status`. Сервис слушает только `127.0.0.1`; cookies никогда не возвращаются в API или логи. Доступ WebView обеспечивается CORS.

## Обновление cookies

1. Откройте Kinozal в Yandex Browser на Windows и дождитесь обычной страницы Top.
2. Полностью закройте браузер, включая фоновые процессы. Не завершайте его принудительно до сохранения вкладок.
3. Выполните `./refresh-cookies.ps1` в PowerShell. Нужны Python 3.12 и установленный `pycryptodome`. Скрипт локально расшифрует только `uid`, `pass` и `cf_clearance` через DPAPI и AES-GCM, передаст их на TV по SSH, выставит `600` и выведет только HTTP-статус. Обновление helper не требует перезапуска.

Локальные `diagnostics/Cookies-yandex-refresh` и `diagnostics/kinozal-cookies-refresh.json` содержат секреты и исключены из Git. При истечении clearance helper возвращает `503` с `error: cloudflare_challenge`; Seena показывает понятную ошибку. До обновления cookies автоматического обхода challenge нет.

## Удаление и откат

Чтобы вернуть прежнюю Seena и убрать helper, сначала остановите его процесс, затем восстановите файлы из `/var/lib/webosbrew/seena-helper/seena-0.3.7-backup` (или локальной папки `backup/seena-tv-0.3.7`). После проверки 0.3.7 удалите только `/var/lib/webosbrew/init.d/seena-helper`, `/home/r/l` и `/var/lib/webosbrew/seena-helper`. Это не требует изменений системных разделов. При удалении одного helper оставленная Seena 0.3.9 потеряет доступ к вкладке Kinozal.

Команды для отката (на TV под root через SSH):

```sh
cp -a /var/lib/webosbrew/seena-helper/seena-0.3.7-backup/. /media/developer/apps/usr/palm/applications/com.seena.webos/
pkill -f '^/usr/bin/node /var/lib/webosbrew/seena-helper/seena-kinozal-helper.js$' || true
rm -f /var/lib/webosbrew/init.d/seena-helper /home/r/l
test "$(readlink -f /var/lib/webosbrew/seena-helper)" = /var/lib/webosbrew/seena-helper && rm -rf /var/lib/webosbrew/seena-helper
```

Локальная копия `backup/seena-tv-0.3.7` остаётся в рабочей папке.

## Проверено

На TV проверены HTTP 200 для Top, поиска, карточки и валидного `.torrent`; TorrServer принял тестовый torrent и сообщил о 10 файлах. После reboot Homebrew hook автоматически поднял helper из persistent каталога. Пользователь подтвердил отображение Top и карточки в Seena, запуск Watch и воспроизведение видео через TorrServer.
