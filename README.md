# TikTok / YouTube Downloader

Веб-приложение и Android-клиент для скачивания видео и аудио из TikTok и YouTube. Работает через локальный Node.js-сервер, который использует `ttdl` (для TikTok) и `yt-dlp` (для YouTube).

---

## 📋 Содержание

- [Возможности](#-возможности)
- [Структура проекта](#-структура-проекта)
- [Установка (Windows)](#-установка-windows)
- [Запуск](#-запуск)
- [API](#-api)
- [Android-клиент](#-android-клиент)
- [План переноса на сервер (VPS)](#-план-переноса-на-сервер-vps)
- [Обход блокировок](#-обход-блокировок)
- [Лицензия](#-лицензия)

---

## 🚀 Возможности

- **Скачивание TikTok** без водяного знака (через `ttdl`)
- **Скачивание YouTube** в MP4 (H.264) или MP3 (через `yt-dlp` + `ffmpeg`)
- **Поиск** по TikTok и YouTube прямо из веб-интерфейса
- **Превью** — обложка, автор, название до скачивания
- **Прогресс скачивания** в реальном времени (SSE)
- **Нормальные имена файлов** — название видео вместо `video.mp4`
- **Тёмная/светлая тема** + Material You (Android)
- **Избранное** — сохранение понравившихся видео/треков
- **Разделение** видео и треков в «Загруженном»

---

## 📁 Структура проекта
tiktok-server/
├── server.js # Node.js-сервер
├── package.json
├── yt-dlp.exe # yt-dlp для Windows
├── ffmpeg.exe # ffmpeg для Windows (нужен для MP3 и H.264)
├── public/
│ ├── index.html # Веб-интерфейс
│ └── logo.png # Логотип
└── README.md

text

---

## 🖥️ Установка (Windows)

### 1. Установи Node.js

Скачай с [nodejs.org](https://nodejs.org/) (версия **20+**), при установке отметь **«Add to PATH»**.

Проверь:
```cmd
node --version
npm --version
2. Установи зависимости
cmd
cd C:\Users\ksdev\Desktop\tiktok-server
npm install
3. Скачай yt-dlp.exe
Скачай последнюю версию с github.com/yt-dlp/yt-dlp/releases/latest и положи в tiktok-server/yt-dlp.exe.

Проверь:

cmd
yt-dlp.exe --version
4. Установи ffmpeg
Вариант A — через winget:

cmd
winget install ffmpeg
Вариант B — вручную: скачай с ffmpeg.org, распакуй ffmpeg.exe в tiktok-server/.

Проверь:

cmd
ffmpeg -version
▶️ Запуск
cmd
cd C:\Users\ksdev\Desktop\tiktok-server
node server.js
Открой в браузере: http://localhost:3000/

🔌 API
Эндпоинт	Параметры	Что делает
GET /api	url	Инфо о TikTok-видео
GET /api-youtube	url	Инфо о YouTube-видео
GET /search	q, platform (tiktok/youtube/all)	Поиск видео
GET /cover	url	Прокси обложки
GET /download	url, format (mp4/mp3), id	Скачивание файла
GET /progress	id	SSE-прогресс скачивания
Примеры
cmd
# Поиск в YouTube
http://localhost:3000/search?q=бультерьер&platform=youtube

# Инфо о TikTok-видео
http://localhost:3000/api?url=https://www.tiktok.com/@user/video/123

# Скачать MP3
http://localhost:3000/download?url=https://youtu.be/xxx&format=mp3
📱 Android-клиент
В Android-проекте (TikTokApi.java) замени адрес сервера:

java
private static final String SERVER = "http://192.168.0.216:3000";
Локально: http://192.168.0.216:3000 (IP твоего компа в локальной сети)

Через туннель: https://xxx.trycloudflare.com (если используешь Cloudflare Tunnel)

На VPS: https://твой-домен.com

🌐 План переноса на сервер (VPS)
Инструкция для Ubuntu/Debian VPS. Для Render/Railway пункты про GoodbyeDPI не подходят — там нужен прокси.

Этап 1: Подготовка проекта
Проверь .gitignore: добавь node_modules/, *.exe, .env, *.log.

В package.json добавь:

json
"scripts": { "start": "node server.js" },
"engines": { "node": ">=20" }
Залей проект на GitHub.

Этап 2: Первичная настройка VPS
bash
ssh root@IP_СЕРВЕРА
sudo apt update && sudo apt upgrade -y

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# PM2
sudo npm install -g pm2

# Nginx
sudo apt install nginx -y
Этап 3: Установка GoodbyeDPI-Linux
bash
# Зависимости
sudo apt install -y git build-essential libnetfilter-queue-dev libpcap-dev iptables

# Сборка
git clone https://github.com/wickstudio/GoodbyeDPI-Linux.git
cd GoodbyeDPI-Linux
sudo ./goodbyedpi-manager.sh
В меню выбери по порядку:

Install Dependencies & Compile

Configure DNS Poisoning Bypass — обязательно

Install as Auto-Start Service

Start GoodbyeDPI Temporarily

Проверка:

bash
dig discord.com
Должен вернуть реальный IP.

Этап 4: Nginx и PM2
bash
cd /var/www
sudo git clone https://github.com/ТВОЙ_ЛОГИН/ТВОЙ_РЕПО.git tiktok-server
cd tiktok-server
sudo npm install
Конфиг Nginx (/etc/nginx/sites-available/tiktok-server):

nginx
server {
    listen 80;
    server_name IP_СЕРВЕРА_ИЛИ_ДОМЕН;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
Активация:

bash
sudo ln -s /etc/nginx/sites-available/tiktok-server /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo systemctl restart nginx
Запуск приложения:

bash
pm2 start server.js --name tiktok-downloader
pm2 save
pm2 startup
Этап 5: Linux-версии утилит
yt-dlp (Linux):

bash
sudo wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
В server.js замени:

javascript
const YT_DLP_PATH = "/usr/local/bin/yt-dlp";
ffmpeg:

bash
sudo apt install ffmpeg -y
🛡️ Обход блокировок
YouTube в России блокируется на уровне DPI. Есть несколько способов обхода:

Способ	Где работает	Плюсы	Минусы
GoodbyeDPI	Windows (локально)	Простой, работает из коробки	Только Windows
GoodbyeDPI-Linux	Linux (VPS)	Обход на уровне сети	Требует сборки
Cloudflare Tunnel	Любая ОС	HTTPS, бесплатно	Нестабилен в РФ
Pinggy	Любая ОС	HTTPS, работает из РФ	URL меняется, 60 минут
localtunnel	Любая ОС	Бесплатно, HTTPS	Медленно
Платные прокси	Везде	Стабильно, быстро	Платно
Windows (локально)
Скачай GoodbyeDPI.

Запусти 1_russia_blacklist_dnsredir.cmd от админа.

YouTube заработает напрямую.

Linux (VPS)
См. Этап 3.

Туннели (если свой IP не подходит)
cmd
# Cloudflare (нестабильно в РФ)
cloudflared.exe tunnel --url http://localhost:3000 --protocol http2

# Pinggy (стабильно)
ssh -p 443 -R0:localhost:3000 a.pinggy.io

# localtunnel
lt --port 3000
🐛 Решение проблем
Проблема	Решение
yt-dlp not found	Скачай yt-dlp.exe в папку проекта
ffmpeg not found	Установи ffmpeg, добавь в PATH
Cannot choose from an empty sequence (yt-dlp-proxy)	Бесплатные прокси мертвы — используй GoodbyeDPI
403 Forbidden от YouTube	YouTube требует cookies — используй --cookies-from-browser
Медленное скачивание	Проверь интернет или используй прокси
Error 1033 (Cloudflare)	Провайдер режет туннель — переключись на Pinggy
📄 Лицензия
MIT. Используй как хочешь. Автор не несёт ответственности за нарушение авторских прав третьих лиц.

🔗 Ссылки
ttdl на npm

yt-dlp на GitHub

GoodbyeDPI

GoodbyeDPI-Linux

ffmpeg
