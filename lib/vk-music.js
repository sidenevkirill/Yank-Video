const axios = require("axios");
const fs = require("fs");
const path = require("path");
const os = require("os");

const VK_TOKEN_PATH = path.join(__dirname, "..", "vk-music.js");

// ============================================
// Заголовки для запросов к VK
// ============================================
function getVkHeaders() {
    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://vk.com/",
        "Accept": "*/*",
        "Accept-Language": "ru-RU,ru;q=0.9",
    };

    try {
        delete require.cache[require.resolve(VK_TOKEN_PATH)];
        const { vkCookie } = require(VK_TOKEN_PATH);
        if (vkCookie) {
            headers["Cookie"] = vkCookie;
        }
    } catch {}

    return headers;
}

// ============================================
// Получить токен из vk-music.js
// ============================================
function getVkToken() {
    try {
        delete require.cache[require.resolve(VK_TOKEN_PATH)];
        const { vkToken } = require(VK_TOKEN_PATH);
        return vkToken;
    } catch (e) {
        console.error("Не удалось прочитать vk-music.js:", e.message);
        return null;
    }
}

// ============================================
// Парсинг ссылки на трек
// ============================================
function parseTrackLink(link) {
    let match = link.match(/audio(-?\d+)_(\d+)/i);
    if (match) {
        return { owner_id: match[1], audio_id: match[2] };
    }
    throw new Error("Не удалось распарсить ссылку на трек");
}

// ============================================
// Получить инфо о треке через VK API
// ============================================
async function getTrackInfo(link) {
    const token = getVkToken();
    if (!token || !token.access_token) {
        throw new Error("Заполни vk-music.js: access_token и user_id");
    }

    const { owner_id, audio_id } = parseTrackLink(link);

    const urls = [
        `https://api.vk.com/method/audio.getById?audios=${owner_id}_${audio_id}&access_token=${token.access_token}&v=5.131`,
        `https://api.vk.com/method/audio.getById?audios=-${owner_id}_${audio_id}&access_token=${token.access_token}&v=5.131`,
    ];

    for (const url of urls) {
        try {
            const res = await axios.get(url, { headers: getVkHeaders() });
            const list = res?.data?.response;

            if (list && list[0]) {
                return {
                    id: list[0].id,
                    artist: list[0].artist,
                    title: list[0].title,
                    duration: list[0].duration,
                    url: list[0].url, // прямая MP3-ссылка
                };
            }

            if (res?.data?.error) {
                console.error("VK API error:", res.data.error.error_msg);
            }
        } catch (e) {
            console.error("VK API request error:", e.message);
        }
    }
    throw new Error("Трек не найден. Возможно, токен истёк или трек недоступен.");
}

// ============================================
// Скачать MP3-файл напрямую
// ============================================
async function downloadMp3(url, outputPath) {
    console.log(`[VK Music] Скачиваю MP3: ${url.substring(0, 80)}...`);

    const response = await axios.get(url, {
        responseType: "stream",
        headers: getVkHeaders(),
    });

    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);
        writer.on("finish", resolve);
        writer.on("error", reject);
    });
}

// ============================================
// Главная функция: скачать трек по ссылке
// ============================================
async function downloadVkTrack(link) {
    const track = await getTrackInfo(link);
    if (!track.url) throw new Error("VK не вернул ссылку на MP3");

    const safeArtist = (track.artist || "Unknown").replace(/[<>:"/\\|?*]/g, "");
    const safeTitle = (track.title || "Track").replace(/[<>:"/\\|?*]/g, "");
    const fileName = `${safeArtist} - ${safeTitle}.mp3`;
    const tmpFile = path.join(os.tmpdir(), `vk_track_${Date.now()}.mp3`);

    console.log(`[VK Music] Скачиваю: ${fileName}`);
    await downloadMp3(track.url, tmpFile);

    const stat = fs.statSync(tmpFile);
    console.log(`[VK Music] Размер: ${(stat.size / 1024 / 1024).toFixed(2)} МБ`);

    return { filePath: tmpFile, fileName, track };
}

module.exports = { downloadVkTrack, getTrackInfo };