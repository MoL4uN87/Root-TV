# Seena 0.3.23: Kinozal через локальный helper

Целевая система: rooted LG webOS 6.5.x с 32-битным ARM userspace. Приложение обращается к `http://127.0.0.1:8787`; helper запрашивает Kinozal через patched ARMHF `curl-impersonate` 2.2.3 и передаёт `.torrent` в существующий UI Seena, который загружает его в TorrServer на `127.0.0.1:8090`.

В 0.3.9 верхняя строка плеера («К карточке» и название) скрывается вместе с нижними кнопками через 5 секунд воспроизведения без действий. Нажатие кнопки или движение указателя пульта показывает обе панели; при паузе, ошибке и открытом меню дорожек они остаются видимыми. В 0.3.10 Seena повторяет запрос при временном Cloudflare challenge. В 0.3.11 helper автоматически переключается между `kinozal.guru` и официальным зеркалом `kinozal.jumpingcrab.com`. В 0.3.12 загрузка torrent обращается к выбранному адресу через helper. В 0.3.13 добавлен вход в Kinozal на TV; при сохранённом пароле кнопка «Обновить сессию» повторяет вход, если авторизация истекла. В 0.3.15 Seena показывает собственную клавиатуру, если системная не открылась. В 0.3.16 проверка входа больше не скачивает тестовый torrent. В 0.3.17 нажатие на видео переключает видимость обеих панелей. В 0.3.18 верхний пункт «История» показывает последние успешно начатые просмотры из каталога и Кинозала: карточку можно открыть снова или удалить отдельную запись. История хранится локально на TV. В 0.3.19 фокус на верхних пунктах меню подсвечивает всю кнопку, включая её фон и внутреннюю рамку.

В 0.3.20 helper сохраняет страницы Top, поиска и карточек Кинозала со списками связанных раздач. Top и поиск обновляются через 10 минут, карточки — через час; успешное обновление сессии очищает кэш. В верхних «Настройках» можно выбрать лимит 0/4/8/16 МБ, увидеть занятое место и очистить кэш. Видео и файлы `.torrent` не сохраняются. В карточках скрыта правая полоса прокрутки, прокрутка пультом работает. В 0.3.21 колесо пульта перемещает выделение между карточками в каталоге, поиске, истории и Кинозале. В 0.3.22 кнопки верхней панели выровнены по высоте; между «История», «Настройки» и «Поиск» добавлены одинаковые отступы. В 0.3.23 кнопка «Удалить» в истории отделена от нижнего края карточки.

## Что выяснилось про Cloudflare

- Старый снимок `cf_clearance` был нерабочим: challenge появлялся даже в Yandex Browser. Новый снимок отличается по значению clearance; `uid` и `pass` остались прежними.
- В контролируемой серии на Windows `curl_cffi` с `chrome150` и обычным Chrome User-Agent получил 6/6 challenge 403. С User-Agent Yandex Browser 26.8 (`Chrome/150... YaBrowser/26.8...`) тот же клиент и cookies получил 3/6 HTTP 200. Значит User-Agent существенно влияет, но не устраняет нестабильность Cloudflare.
- TV `curl-impersonate` с `chrome150`, Yandex User-Agent и новым clearance получает HTTP 200 по HTTP/2, иногда вперемежку с challenge 403. Helper повторяет challenge до пяти раз и возвращает JSON ошибку, если все попытки отклонены.
- После reboot IPv6 запросы на TV истекали по тайм-ауту; `--ipv4` дал рабочее соединение. HTTP/3 на TV также истекал по тайм-ауту. Рабочая конфигурация использует HTTP/2 поверх IPv4.
- На этом TV прямой TLS к Kinozal зависает после reboot при отключённом LGVPN. После подключения уже установленного LGVPN тот же helper сразу вернул HTTP 200. По разрешению пользователя startup hook запускает LGVPN при загрузке (до 12 попыток); это направляет сетевой трафик TV через настроенный VPN-сервер. Если VPN не поднялся, helper возвращает понятную ошибку `vpn_disconnected`.
- Официальный канал Kinozal публикует адрес зеркала `kinozal.jumpingcrab.com`: https://t.me/s/kinozaltv_official. На TV оно возвращало Top, поиск, карточку и `.torrent` по `uid`/`pass` без `cf_clearance`. При отказе зеркала helper пробует `kinozal.guru`.
- Публичные страницы зеркала helper запрашивает без cookies. Если Kinozal ограничил запросы для аккаунта, Top остаётся доступен. Кнопка «Обновить сессию» проверяет авторизованную страницу без скачивания `.torrent`: на Kinozal действует [суточное ограничение на количество скачанных torrent-файлов](https://forum.kinozal.tv/showthread.php?t=70485). Torrent загружается только при выборе раздачи, HTTP 429 показывается отдельно.
- Полное совпадение TLS/HTTP2 fingerprint с Yandex Browser не доказано. Вход через зеркало выполняется из Seena на TV. Если Kinozal отвечает HTTP 429 и после повторного входа, Seena сообщает об ограничении; клиент не может снять его самостоятельно.

## Размещение на TV

| Путь | Назначение |
| --- | --- |
| `/media/developer/apps/usr/palm/applications/com.seena.webos` | Seena 0.3.23 |
| `/var/lib/webosbrew/seena-helper` | helper, patched curl, ARMHF runtime, `cookies.json` и при включённом автологине `account.json` с правами `600` |
| `/home/r/l` | короткая ссылка на ARMHF ELF loader из persistent каталога |
| `/var/lib/webosbrew/init.d/seena-helper` | штатный Homebrew startup hook для LGVPN и watcher helper |
| `/var/lib/webosbrew/seena-helper/seena-0.3.7-backup` | резервная копия установленной 0.3.7 |

Системные `/lib`, `/usr` и `/etc/ld.so.preload` не меняются. Предупреждение об `/lib/libSegFault.so` от старого preload для ARMHF runtime безвредно. Hook не меняет конфигурацию LGVPN; он запускает существующий `/var/lib/webosbrew/lgvpn/lgvpn-start`.

Watchdog `seena-helper-watch` проверяет локальный `/health` каждые 10 секунд и перезапускает helper, если тот остановился. Его единственный экземпляр защищён `flock`; диагностический `helper.log` доступен только root и не содержит cookies.

## Сборка и установка

В PowerShell из этого каталога:

```powershell
node --check helper/seena-kinozal-helper.js
node --check seena-0.3.23/com.seena.webos/app.js
node --test tests/cache.test.cjs tests/history.test.cjs
node --test 'C:\Users\USER\Documents\ChatGPT\WebOS\build-0.3.7\model.test.cjs'
ares-package seena-0.3.23/com.seena.webos -o dist
./install.ps1
```

`install.ps1` использует SSH `root@192.168.1.95` и ключ `~/.ssh/lg_webos_codex`; параметры `-Tv` и `-Key` их переопределяют. Он проверяет локальный `/health` helper и копирует 0.3.23 поверх установленного приложения. Проверка Top не блокирует установку, если Kinozal временно отвечает HTTP 429. Архив `dist/com.seena.webos_0.3.23_all.ipk` собирается для хранения; на данном TV `ares-install` недоступен из-за прав на конфигурацию SSH, поэтому установка выполняется по SSH. Для повторной установки сохраните локальную папку `runtime/`: она содержит пропатченный бинарник и ARMHF библиотеки и намеренно не попадает в Git.

После копирования установщик даёт WebView доступ к файлам приложения, завершает уже запущенный процесс Seena и запускает новый. Это нужно при обновлении поверх работающей версии: иначе TV может оставить старую страницу в памяти или показать серый экран.

Проверка на TV:

```sh
curl -fsS http://127.0.0.1:8787/health
curl -fsS http://127.0.0.1:8787/kinozal/cookies/status
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8787/kinozal/top
/var/lib/webosbrew/lgvpn/lgvpn-status | head -1
```

Маршруты: `/health`, `/kinozal/top`, `/kinozal/search`, `/kinozal/details?id=…`, `/kinozal/torrent?id=…`, `/kinozal/image?url=…`, `/kinozal/cookies/status`, `/kinozal/session/refresh`, `POST /kinozal/session/login`. Сервис слушает только `127.0.0.1`; cookies и пароль никогда не возвращаются в API или логи. Доступ WebView обеспечивается CORS.

## Вход в Kinozal на телевизоре

Откройте «Кинозал» → «Аккаунт», введите логин и пароль и нажмите «Войти на TV». Если системная клавиатура не откроется, Seena покажет свою. Если включить «Запомнить пароль», helper сохранит его в `account.json` с правами `600`; при истечении авторизации кнопка «Обновить сессию» попробует войти снова. Без этой настройки пароль не сохраняется, а успешные cookies остаются в `cookies.json`. Вход идёт через HTTPS на зеркало. При HTTP 429 повторный вход не снимает ограничение сервера; потребуется подождать.

## Старый способ обновления cookies через Windows

1. Откройте Kinozal в Yandex Browser на Windows и дождитесь обычной страницы Top.
2. Полностью закройте браузер, включая фоновые процессы. Не завершайте его принудительно до сохранения вкладок.
3. Выполните `./refresh-cookies.ps1` в PowerShell. Нужны Python 3.12 и установленный `pycryptodome`. Скрипт локально расшифрует только `uid`, `pass` и `cf_clearance` через DPAPI и AES-GCM, передаст их на TV по SSH, выставит `600` и выведет только HTTP-статус. Обновление helper не требует перезапуска.

Локальные `diagnostics/Cookies-yandex-refresh` и `diagnostics/kinozal-cookies-refresh.json` содержат секреты и исключены из Git. Если оба адреса требуют новую сессию, helper возвращает ошибку; автоматического прохождения проверки Cloudflare нет.

## Удаление и откат

Чтобы вернуть прежнюю Seena и убрать helper, сначала остановите его процесс, затем восстановите файлы из `/var/lib/webosbrew/seena-helper/seena-0.3.7-backup` (или локальной папки `backup/seena-tv-0.3.7`). После проверки 0.3.7 удалите только `/var/lib/webosbrew/init.d/seena-helper`, `/home/r/l` и `/var/lib/webosbrew/seena-helper`. Это не требует изменений системных разделов. При удалении одного helper оставленная Seena 0.3.23 потеряет доступ к вкладке Kinozal.

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
