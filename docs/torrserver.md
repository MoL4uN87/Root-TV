# Установка TorrServer на LG webOS TV

Эта инструкция описывает проверенную схему установки **TorrServer for webOS 1.2.0** для проекта **Root TV / Seena**.

В рабочей конфигурации:

- приложение: `com.torrserver.app`;
- пакет: `com.torrserver.app_1.2.0_all.ipk`;
- TorrServer слушает порт `8090`;
- Seena обращается к нему локально через `http://127.0.0.1:8090`;
- webOS использует 32-битный ARM userspace, поэтому в webOS-пакете используется ARMv7/arm7-сборка TorrServer;
- автозапуск после перезагрузки TV требует root/Homebrew Channel.

Исходный проект TorrServer for webOS:

https://github.com/6ebeng/torrserver-webos

Официальный TorrServer:

https://github.com/YouROK/TorrServer

## 1. Что понадобится

На Windows:

- PowerShell 7;
- SSH-доступ к телевизору;
- root на TV для автозапуска;
- настроенный SSH alias `lg-tv` либо IP телевизора.

Проверка SSH.

**Терминал: Windows PowerShell**

```powershell
ssh lg-tv
```

Если alias не настроен:

```powershell
ssh root@<TV_IP>
```

## 2. Скачать TorrServer for webOS

Для проверенной конфигурации используется релиз **v1.2.0**:

https://github.com/6ebeng/torrserver-webos/releases/tag/v1.2.0

Прямая ссылка на IPK:

https://github.com/6ebeng/torrserver-webos/releases/download/v1.2.0/com.torrserver.app_1.2.0_all.ipk

Скачать из PowerShell:

**Терминал: Windows PowerShell**

```powershell
Invoke-WebRequest -Uri "https://github.com/6ebeng/torrserver-webos/releases/download/v1.2.0/com.torrserver.app_1.2.0_all.ipk" -OutFile ".\com.torrserver.app_1.2.0_all.ipk"
```

## 3. Проверить SHA-256 пакета

Для релиза v1.2.0 опубликован SHA-256:

```text
217b064ac7829928a0a8424cd642436dea769d25b52e2ad7d2076ac27e6a1a5b
```

Проверка:

**Терминал: Windows PowerShell**

```powershell
Get-FileHash ".\com.torrserver.app_1.2.0_all.ipk" -Algorithm SHA256
```

Хэш должен совпасть с опубликованным.

## 4. Скопировать IPK на телевизор

**Терминал: Windows PowerShell**

```powershell
scp ".\com.torrserver.app_1.2.0_all.ipk" lg-tv:/tmp/torrserver.ipk
```

Либо без SSH alias:

```powershell
scp ".\com.torrserver.app_1.2.0_all.ipk" root@<TV_IP>:/tmp/torrserver.ipk
```

## 5. Установить TorrServer через webOS appInstallService

**Терминал: Windows PowerShell**

```powershell
$j='{"id":"com.ares.defaultName","ipkUrl":"/tmp/torrserver.ipk","subscribe":true}'; $b=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($j)); ssh lg-tv "p=`$(echo $b | base64 -d); luna-send-pub -w 30000 -i luna://com.webos.appInstallService/dev/install `"`$p`""
```

При успешной установке в ответе должно появиться состояние:

```text
"state":"installed"
```

## 6. Запустить приложение TorrServer

ID приложения:

```text
com.torrserver.app
```

Запуск:

**Терминал: Windows PowerShell**

```powershell
$j='{"id":"com.torrserver.app"}'; $b=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($j)); ssh lg-tv "p=`$(echo $b | base64 -d); luna-send-pub -n 1 luna://com.webos.applicationManager/launch `"`$p`""
```

После запуска откройте TorrServer на телевизоре.

## 7. Первый запуск

В интерфейсе TorrServer:

1. нажмите **Start**;
2. дождитесь состояния **Running**;
3. посмотрите адрес Web UI;
4. посмотрите созданные приложением логин и пароль;
5. на rooted TV включите **Autostart**.

Пароль и другие данные доступа **не нужно сохранять в GitHub**.

После выхода из интерфейса TorrServer сам сервер продолжает работать в фоне.

## 8. Проверить порт 8090

TorrServer слушает:

```text
http://127.0.0.1:8090
```

На телевизоре:

**Терминал: Windows PowerShell**

```powershell
ssh lg-tv "netstat -lnt 2>/dev/null | grep ':8090 '"
```

Также можно проверить HTTP-ответ:

```powershell
ssh lg-tv "curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8090/"
```

При включённой HTTP Basic Auth сервер может вернуть `401`. Это нормально: такой ответ подтверждает, что TorrServer работает и требует авторизацию.

## 9. Открыть Web UI с компьютера или телефона

В браузере устройства из той же локальной сети:

```text
http://<TV_IP>:8090
```

Данные авторизации смотрите в приложении TorrServer на телевизоре.

Не пробрасывайте порт `8090` напрямую в интернет.

## 10. Настроить автозапуск

В приложении TorrServer найдите строку **Autostart** и включите её.

На rooted TV приложение создаёт startup hook через Homebrew окружение. После этого TorrServer должен запускаться после перезагрузки телевизора без ручного открытия приложения.

Проверка после reboot:

**Терминал: Windows PowerShell**

```powershell
ssh lg-tv "netstat -lnt 2>/dev/null | grep ':8090 '"
```

Если порт появился — автозапуск работает.

## 11. Связь с Seena

Seena использует TorrServer внутри самого телевизора:

```text
http://127.0.0.1:8090
```

Поэтому для связи **Seena → TorrServer** внешний IP телевизора не нужен.

Типичная цепочка:

```text
Seena
  ↓
локальный TorrServer API
  ↓
127.0.0.1:8090
  ↓
torrent stream
  ↓
плеер Seena
```

DLNA для этой схемы не требуется.

## 12. Почему используется ARMv7, хотя uname может показывать aarch64

На некоторых LG TV:

```sh
uname -m
```

показывает:

```text
aarch64
```

При этом webOS userspace остаётся 32-битным ARM.

Поэтому пакет TorrServer for webOS v1.2.0 содержит 32-битную ARM/arm7 сборку TorrServer. Не нужно вручную заменять её на Linux ARM64 только из-за результата `uname -m`.

## 13. Обновление TorrServer

Новый IPK можно устанавливать поверх существующей версии.

Общий порядок:

1. скачать новый релиз;
2. проверить хэш, если он опубликован;
3. скопировать IPK в `/tmp/torrserver.ipk`;
4. снова вызвать `com.webos.appInstallService/dev/install`;
5. открыть TorrServer и проверить состояние;
6. проверить `8090`.

Настройки TorrServer сохраняются между перезапусками и обновлениями webOS-обёртки.

## 14. Если TorrServer не работает

### Приложение показывает Idle

Нажмите:

```text
Start
```

и дождитесь:

```text
Running
```

### Seena не может начать воспроизведение

Сначала проверьте TorrServer:

```powershell
ssh lg-tv "curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8090/"
```

Если соединения нет — проблема находится до Seena: TorrServer не запущен или не слушает порт.

### После reboot TorrServer не запустился

Проверьте, что в приложении включён:

```text
Autostart
```

Автозапуск через webOS homebrew требует root.

### Не открывается Web UI с другого устройства

Проверьте:

- TV и компьютер/телефон находятся в одной локальной сети;
- используется правильный IP телевизора;
- TorrServer находится в состоянии `Running`;
- порт `8090` не блокируется локальной сетью.

## 15. Что не публиковать в Git

Не добавляйте в репозиторий:

- логин TorrServer;
- пароль TorrServer;
- локальные cookies;
- VPN credentials;
- приватные SSH-ключи;
- резервные копии конфигов с секретами.

В документации используйте только placeholders:

```text
<TV_IP>
<LOGIN>
<PASSWORD>
```

## Проверенная конфигурация проекта Root TV

Для текущей рабочей схемы подтверждено:

- TorrServer for webOS 1.2.0 установлен как `com.torrserver.app`;
- сервер работает на `8090`;
- Seena обращается к нему через `127.0.0.1:8090`;
- TorrServer продолжает работать после выхода из его UI;
- для постоянной работы после reboot используется **Autostart**;
- Seena успешно передаёт torrent в TorrServer и запускает просмотр.
