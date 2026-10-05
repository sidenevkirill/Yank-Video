# 📋 План развития проекта TikTok / YouTube Downloader

Этот документ — пошаговый план на будущее. Здесь описано, что и в каком порядке делать, чтобы:
- перенести проект на сервер (VPS);
- настроить обход блокировок YouTube;
- задеплоить Android-приложение;
- добавить новые фичи.

---

## 📑 Содержание

- [Этап 1: Подготовка репозитория](#этап-1-подготовка-репозитория)
- [Этап 2: Перенос на VPS](#этап-2-перенос-на-vps)
- [Этап 3: Обход блокировок (GoodbyeDPI-Linux)](#этап-3-обход-блокировок-goodbyedpi-linux)
- [Этап 4: Nginx и PM2](#этап-4-nginx-и-pm2)
- [Этап 5: Linux-версии утилит](#этап-5-linux-версии-утилит)
- [Этап 6: Домен и HTTPS](#этап-6-домен-и-https)
- [Этап 7: Android-приложение](#этап-7-android-приложение)
- [Этап 8: Мониторинг и бэкапы](#этап-8-мониторинг-и-бэкапы)
- [Этап 9: Новые фичи](#этап-9-новые-фичи)
- [Чек-лист перед деплоем](#чек-лист-перед-деплоем)

---

## Этап 1: Подготовка репозитория

**Когда:** перед переносом на сервер.

- [ ] Проверить `.gitignore`:
node_modules/
*.exe
.env
*.log
*.tmp
proxy.json
readme.txt

text
- [ ] Убедиться, что в `package.json` есть:
```json
"scripts": { "start": "node server.js" },
"engines": { "node": ">=20" }
□ Проверить, что в репозитории нет node_modules/, *.exe, proxy.json.
□ Создать ветку dev для разработки, main — для стабильной версии.
□ Добавить LICENSE (MIT).
□ Добавить описание репозитория на GitHub.
Этап 2: Перенос на VPS
Когда: после подготовки репозитория.

Что нужно:

VPS с Ubuntu 22.04 / Debian 12 (минимум 1 ГБ RAM, 10 ГБ диска).

Root-доступ по SSH.

Шаги
□ Подключиться к серверу:
bash
ssh root@IP_СЕРВЕРА
□ Обновить систему:
bash
sudo apt update && sudo apt upgrade -y
□ Установить Node.js 20:
bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
□ Установить PM2:
bash
sudo npm install -g pm2
□ Установить Nginx:
bash
sudo apt install nginx -y
□ Клонировать репозиторий:
bash
cd /var/www
sudo git clone https://github.com/sidenevkirill/tiktok-server.git
cd tiktok-server
sudo npm install
Этап 3: Обход блокировок (GoodbyeDPI-Linux)
Когда: после переноса проекта.

Зачем: YouTube в России блокируется на уровне DPI. Без обхода yt-dlp не сможет скачивать видео.

Шаги
□ Установить зависимости:
bash
sudo apt install -y git build-essential libnetfilter-queue-dev libpcap-dev iptables
□ Склонировать GoodbyeDPI-Linux:
bash
git clone https://github.com/wickstudio/GoodbyeDPI-Linux.git
cd GoodbyeDPI-Linux
□ Запустить менеджер:
bash
sudo ./goodbyedpi-manager.sh
□ В меню выбрать по порядку:
Install Dependencies & Compile
Configure DNS Poisoning Bypass — обязательно
Install as Auto-Start Service
Start GoodbyeDPI Temporarily
□ Проверить работу:
bash
dig discord.com
Должен вернуть реальный IP, а не заглушку.

□ Проверить, что YouTube открывается:
bash
curl -I https://www.youtube.com
Должен вернуть HTTP/2 200.

Альтернативы (если GoodbyeDPI-Linux не заработает)
□ Zapret — github.com/bol-van/zapret
□ ByeDPI — github.com/hufrea/byedpi
□ Платные резидентные прокси (ProxyHat, Oxylabs) — если готов платить.
Этап 4: Nginx и PM2
Когда: после обхода блокировок.

Nginx
□ Создать конфиг /etc/nginx/sites-available/tiktok-server:
nginx
server {
    listen 80;
    server_name IP_СЕРВЕРА_ИЛИ_ДОМЕН;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
□ Активировать:
bash
sudo ln -s /etc/nginx/sites-available/tiktok-server /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
PM2
□ Запустить приложение:
bash
pm2 start server.js --name tiktok-downloader
□ Сохранить список процессов:
bash
pm2 save
□ Настроить автозапуск:
bash
pm2 startup
Скопировать и выполнить команду, которую выведет PM2.

□ Проверить статус:
bash
pm2 status
pm2 logs tiktok-downloader
Этап 5: Linux-версии утилит
Когда: после настройки Nginx и PM2.

yt-dlp
□ Скачать Linux-версию:
bash
sudo wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
□ Проверить:
bash
yt-dlp --version
□ В server.js заменить:
javascript
const YT_DLP_PATH = "/usr/local/bin/yt-dlp";
ffmpeg
□ Установить:
bash
sudo apt install ffmpeg -y
□ Проверить:
bash
ffmpeg -version
yt-dlp-proxy (опционально)
□ Установить Python и pip:
bash
sudo apt install python3 python3-pip -y
□ Установить пакет:
bash
pip3 install yt-dlp-proxy
□ Обновить список прокси:
bash
yt-dlp-proxy update
Этап 6: Домен и HTTPS
Когда: после того, как всё работает по IP.

Домен
□ Купить домен: reg.ru, namecheap.com.
□ Настроить A-запись на IP сервера.
□ В Nginx заменить server_name IP_СЕРВЕРА на server_name твой-домен.com.
HTTPS (Let's Encrypt)
□ Установить Certbot:
bash
sudo apt install certbot python3-certbot-nginx -y
□ Получить сертификат:
bash
sudo certbot --nginx -d твой-домен.com
□ Проверить автопродление:
bash
sudo certbot renew --dry-run
Этап 7: Android-приложение
Когда: после настройки HTTPS.

□ В TikTokApi.java заменить SERVER:
java
private static final String SERVER = "https://твой-домен.com";
□ В AndroidManifest.xml убрать usesCleartextTraffic="true" — HTTPS не требует HTTP.
□ Пересобрать APK.
□ Протестировать на телефоне:
□ Скачивание TikTok
□ Скачивание YouTube MP4
□ Скачивание YouTube MP3
□ Поиск TikTok
□ Поиск YouTube
□ Избранное
□ Разделение видео/треков
□ Опубликовать APK в GitHub Releases:
□ git tag v1.0.0
□ git push --tags
□ На GitHub: Releases → Create new release → загрузить APK.
Этап 8: Мониторинг и бэкапы
Когда: после стабильного запуска.

Мониторинг
□ Установить pm2-logrotate:
bash
pm2 install pm2-logrotate
□ Настроить pm2 monit для实时-мониторинга.
□ Подключить UptimeRobot — бесплатный мониторинг доступности сайта.
□ Подключить Sentry — отслеживание ошибок (опционально).
Бэкапы
□ Настроить бэкап server.js и public/ через cron:
bash
crontab -e
Добавить:

text
0 3 * * * tar -czf /root/backups/tiktok-$(date +\%Y\%m\%d).tar.gz /var/www/tiktok-server
□ Настроить очистку старых бэкапов (оставлять 7 дней).
Безопасность
□ Настроить ufw:
bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
□ Отключить вход по паролю:
bash
sudo nano /etc/ssh/sshd_config
Заменить PasswordAuthentication yes на no.

bash
sudo systemctl restart ssh
□ Добавить rate limiting в server.js:
bash
npm install express-rate-limit
javascript
const rateLimit = require("express-rate-limit");
app.use(rateLimit({ windowMs: 60_000, max: 30 }));
Этап 9: Новые фичи
Когда: после стабилизации.

Веб
□ Прогресс-бар для всех скачиваний (сейчас только для YouTube).
□ История поиска (localStorage).
□ Тёмная тема с переключателем.
□ Массовое скачивание — несколько ссылок через запятую.
□ Плейлисты YouTube — скачивание всего плейлиста.
□ Скачивание субтитров (.srt).
Android
□ Прогресс-бар скачивания.
□ Очередь загрузок — несколько ссылок по очереди.
□ Фоновое скачивание (Foreground Service).
□ Уведомления о завершении.
□ Плейлисты.
□ Экспорт избранного (JSON/CSV).
Сервер
□ Кэш поиска (Redis или в памяти).
□ Логирование в файл.
□ API-ключ для защиты.
□ WebSocket вместо SSE.
□ Поддержка Instagram, Twitter/X, Vimeo.
Чек-лист перед деплоем
Перед переносом на сервер убедись, что:

□ .gitignore настроен правильно.
□ node_modules/ и *.exe не в репозитории.
□ README.md актуален.
□ package.json содержит start и engines.
□ Все зависимости в package.json (нет лишних).
□ server.js не содержит хардкод IP (192.168.0.216).
□ Все пути к yt-dlp и ffmpeg вынесены в константы.
□ Обработка ошибок в каждом эндпоинте.
□ Логи пишутся в консоль (или файл).
□ Тестовое скачивание TikTok и YouTube работает.
📌 Что важно помнить
Момент	Пояснение
GoodbyeDPI-Linux	Требует root-доступ и компиляции. На Render/Railway не подходит
Прокси	Если GoodbyeDPI не работает — используй платные резидентные прокси
HTTPS	Обязателен для Android 9+ (иначе cleartext блокируется)
PM2	Автозапуск + перезапуск при падении
Бэкапы	Настрой до того, как что-то сломается
Мониторинг	UptimeRobot — бесплатно, 5 минут
Rate limiting	Защита от ботов и перегрузки
