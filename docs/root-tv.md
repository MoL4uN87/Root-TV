# Установка ROOT на LG webOS TV

> Проверено на **LG OLED55C1RLA**, webOS 6.x, прошивка **03.53.45**.  
> Это не универсальная инструкция для всех моделей и прошивок LG. Перед выполнением на другом TV нужно отдельно проверять совместимость.

## Что понадобится

На Windows:

- PowerShell 7;
- Git;
- Python;
- телевизор и ПК в одной локальной сети.

В примерах TV имеет IP:

```text
192.168.1.95
```

Замените его на адрес своего телевизора.

## 1. Проверить доступность телевизора

**Терминал:** Windows PowerShell.

```powershell
ping 192.168.1.95
```

Проверить порт, который использует SlopBro:

```powershell
Test-NetConnection 192.168.1.95 -Port 3000
```

В рабочем случае:

```text
TcpTestSucceeded : True
```

## 2. Скачать SlopBro

**Терминал:** Windows PowerShell.

```powershell
cd $HOME\Desktop
git clone https://github.com/throwaway96/slopbro.git
cd .\slopbro
```

## 3. Запустить SlopBro

Команда, которая реально использовалась для webOS 6:

```powershell
python .\slopbro.py --webos-version 6 192.168.1.95
```

Во время выполнения на телевизоре может появиться запрос на pairing/подтверждение подключения — его нужно принять.

В проверенном сценарии SlopBro:

- подключился к TV;
- pairing был подтверждён;
- необходимые файлы были переданы;
- команда завершилась без ошибки.

## 4. Перезагрузить TV

После завершения SlopBro перезагрузите телевизор.

Откройте **Homebrew Channel**.

В рабочем состоянии отображалось:

```text
Root status: ok
```

После получения root в Homebrew Channel был включён:

```text
Block system updates
```

Для проверенной конфигурации обновление прошивки после получения root не выполнялось.

## 5. Проверить SSH root

**Терминал:** Windows PowerShell.

```powershell
ssh root@192.168.1.95
```

После успешного входа приглашение выглядело примерно так:

```text
root@LGwebOSTV:~#
```

Проверить пользователя:

```sh
id
```

Проверить архитектуру и систему:

```sh
uname -a
uname -m
cat /etc/os-release
cat /etc/webos-release 2>/dev/null
cat /etc/palm-build-info 2>/dev/null
```

## 6. Настроить вход по SSH-ключу

Пароль root и приватный SSH-ключ **не должны храниться в GitHub**.

Создать отдельный ключ для TV.

**Терминал:** Windows PowerShell.

```powershell
ssh-keygen -t rsa -b 4096 -f "$env:USERPROFILE\.ssh\lg_webos_codex" -C "codex-lg-webos"
```

Передать публичный ключ на TV:

```powershell
Get-Content "$env:USERPROFILE\.ssh\lg_webos_codex.pub" | ssh root@192.168.1.95 'mkdir -p /home/root/.ssh && chmod 700 /home/root/.ssh && cat >> /home/root/.ssh/authorized_keys && chmod 600 /home/root/.ssh/authorized_keys'
```

Проверить вход по ключу:

```powershell
ssh -i "$env:USERPROFILE\.ssh\lg_webos_codex" root@192.168.1.95
```

Для автоматизации проекта удобно настроить SSH alias `lg-tv` в:

```text
C:\Users\<USER>\.ssh\config
```

После этого подключение выполняется:

```powershell
ssh lg-tv
```

Проверка без запроса пароля:

```powershell
ssh -o BatchMode=yes lg-tv "echo CODEX_SSH_OK"
```

Ожидаемый ответ:

```text
CODEX_SSH_OK
```

## 7. Важные ограничения

Не перезаписывать системные разделы и компоненты:

```text
KERNEL
ROOTFS
TVSERVICE
```

Для этого проекта не требуется:

- изменять `/lib`;
- изменять `/usr`;
- менять `/etc/ld.so.preload`;
- перепрошивать системные разделы.

Используются writable/persistent каталоги:

```text
/var/lib/webosbrew/
/media/developer/
```

## 8. Полезные проверки после ROOT

На TV по SSH:

```sh
ls -l /dev/net/tun
iptables --version
ip addr
ip route
```

В рабочей конфигурации были подтверждены:

```text
/dev/net/tun
iptables 1.6.2
wlan0
```

ROOT нужен для системного VPN, persistent helper Seena и служебных скриптов.
