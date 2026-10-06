# Установка Seena на rooted LG webOS TV

> Эта инструкция относится к проекту **Root TV / Seena webOS** и проверенной rooted-конфигурации LG webOS.

## Что понадобится

На Windows:

- PowerShell 7;
- Node.js;
- LG webOS CLI (`ares-package`);
- SSH root к TV;
- настроенный alias `lg-tv` либо IP/ключ;
- текущий репозиторий проекта.

Проверить SSH:

```powershell
ssh lg-tv
```

## 1. Структура проекта

В рабочем проекте используются:

```text
helper/
runtime/
seena-0.3.32/com.seena.webos/
dist/
tests/
install.ps1
```

Имя каталога исходников осталось `seena-0.3.32`, но фактическая версия приложения берётся из:

```text
seena-0.3.32/com.seena.webos/appinfo.json
```

Например текущая рабочая версия:

```text
0.3.33
```

## 2. Запустить тесты

**Терминал:** VS Code → PowerShell.

Из корня проекта:

```powershell
node --test (Get-ChildItem ".\tests\*.test.cjs" | ForEach-Object FullName)
```

Перед публикацией текущего состояния проекта был получен результат:

```text
tests 37
pass 37
fail 0
```

## 3. Проверить JavaScript

Для основного приложения:

```powershell
node --check ".\seena-0.3.32\com.seena.webos\app.js"
```

Для helper-файлов при изменениях можно аналогично запускать `node --check`.

## 4. Собрать IPK

**Терминал:** VS Code → PowerShell.

```powershell
ares-package ".\seena-0.3.32\com.seena.webos" -o ".\dist"
```

После успешной сборки появится:

```text
dist\com.seena.webos_<VERSION>_all.ipk
```

Для версии 0.3.33:

```text
com.seena.webos_0.3.33_all.ipk
```

## 5. Простой способ установки IPK вручную

Скопировать пакет на TV:

```powershell
scp ".\dist\com.seena.webos_0.3.33_all.ipk" lg-tv:/tmp/seena.ipk
```

Установить через штатный webOS service:

```powershell
$j='{"id":"com.ares.defaultName","ipkUrl":"/tmp/seena.ipk","subscribe":true}'; $b=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($j)); ssh lg-tv "p=`$(echo $b | base64 -d); luna-send-pub -w 30000 -i luna://com.webos.appInstallService/dev/install `"`$p`""
```

Успешная установка заканчивается состоянием:

```text
"state":"installed"
```

При обновлении поверх существующей версии может присутствовать:

```text
"update":true
```

## 6. Запустить Seena

Рабочая команда:

```powershell
$j='{"id":"com.seena.webos"}'; $b=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($j)); ssh lg-tv "p=`$(echo $b | base64 -d); luna-send-pub -n 1 luna://com.webos.applicationManager/launch `"`$p`""
```

Ожидается:

```text
{"returnValue":true}
```

## 7. Где установлено приложение

На TV:

```text
/media/developer/apps/usr/palm/applications/com.seena.webos
```

Проверка:

```powershell
ssh lg-tv "cat /media/developer/apps/usr/palm/applications/com.seena.webos/appinfo.json"
```

## 8. Полная установка текущего проекта через `install.ps1`

Для текущего репозитория предпочтительный способ:

```powershell
.\install.ps1
```

Параметры по умолчанию:

```text
Tv  = root@192.168.1.95
Key = %USERPROFILE%\.ssh\lg_webos_codex
```

Можно переопределить:

```powershell
.\install.ps1 -Tv 'root@192.168.1.95' -Key 'C:\Users\<USER>\.ssh\lg_webos_codex'
```

Скрипт используется для установки не только web-приложения, но и persistent helper.

## 9. Seena helper

Persistent-каталог:

```text
/var/lib/webosbrew/seena-helper/
```

Startup hook:

```text
/var/lib/webosbrew/init.d/seena-helper
```

После установки helper должен отвечать:

```sh
curl -fsS http://127.0.0.1:8787/health
```

`install.ps1` в рабочем проекте:

1. копирует helper/runtime;
2. устанавливает persistent startup hook;
3. запускает helper;
4. ждёт `/health`;
5. устанавливает/обновляет Seena;
6. перезапускает приложение.

## 10. Проверить helper

**Терминал:** Windows PowerShell.

```powershell
ssh lg-tv "curl -fsS http://127.0.0.1:8787/health"
```

Также:

```powershell
ssh lg-tv "ps | grep seena"
```

## 11. Перезапуск Seena

На TV helper содержит restart script:

```text
/var/lib/webosbrew/seena-helper/seena-restart-app
```

Запуск:

```powershell
ssh lg-tv "sh /var/lib/webosbrew/seena-helper/seena-restart-app"
```

## 12. Обновление версии

Изменить:

```text
seena-0.3.32/com.seena.webos/appinfo.json
```

Поле:

```json
"version": "X.Y.Z"
```

После этого:

```powershell
node --check ".\seena-0.3.32\com.seena.webos\app.js"
```

затем:

```powershell
node --test (Get-ChildItem ".\tests\*.test.cjs" | ForEach-Object FullName)
```

и собрать новый IPK:

```powershell
ares-package ".\seena-0.3.32\com.seena.webos" -o ".\dist"
```

## 13. Что не коммитить

В `.gitignore` должны быть исключены:

```text
*.ipk
runtime/
backup/
*.bak
*.bak-*
kinozal-config.json
cookies
cookie header files
.env
private SSH keys
captured HTML dumps
diagnostic playlists
```

Никогда не хранить в GitHub:

- Kinozal login/password;
- `cf_clearance`;
- browser cookie DB;
- SSH private key;
- Hysteria2 credentials.

## 14. Важные ограничения

Seena не требует изменения системных разделов TV.

Не изменять ради Seena:

```text
KERNEL
ROOTFS
TVSERVICE
/lib
/usr
/etc/ld.so.preload
```

Приложение устанавливается через штатный:

```text
com.webos.appInstallService
```

а persistent helper — только в writable Homebrew-каталогах.
