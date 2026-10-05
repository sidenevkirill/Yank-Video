const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");
const { download } = require("@silent-tech-offc/ttdl");

const app = express();
const PORT = 3000;
const YT_DLP_PATH = path.join(__dirname, "yt-dlp.exe");

app.use(express.static(path.join(__dirname, "public")));

// ============================================
// /api — инфо о видео (TikTok) или VK
// ============================================
app.get("/api", async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: "no url" });

    console.log("API запрос:", url);

    // Если это VK — обрабатываем через yt-dlp, а не через ttdl
    if (url.includes("vk.com/video") || url.includes("vkvideo.ru/video")) {
        console.log("VK-ссылка в /api, получаю инфо через yt-dlp...");
        const vkInfo = await getVkVideoInfo(url);
        if (vkInfo) {
            return res.json({
                video: null,
                title: vkInfo.title,
                author: vkInfo.author,
                id: vkInfo.id,
                cover: vkInfo.thumbnail,
                platform: "vk",
            });
        }
        return res.status(500).json({ error: "Не удалось получить инфо о VK-видео" });
    }

    try {
        const v = await download(url);

        let cover = v.cover || v.thumbnail || v.originCover || null;
        let author = v.author || "";
        let title = v.title || "video";

        if (!cover) {
            try {
                const oembed = await fetch(
                    "https://www.tiktok.com/oembed?url=" + encodeURIComponent(url)
                );
                if (oembed.ok) {
                    const info = await oembed.json();
                    cover = info.thumbnail_url || null;
                    if (!author) author = info.author_name || "";
                    if (title === "video") title = info.title || "video";
                }
            } catch (e) {
                console.warn("oEmbed не сработал:", e.message);
            }
        }

        res.json({
            video: v.videoNoWatermark,
            title,
            author,
            id: v.id || Date.now().toString(),
            cover,
        });
    } catch (e) {
        console.error("Ошибка:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// ============================================
// /search — TikTok, YouTube или VK
// ============================================
app.get("/search", async (req, res) => {
    const query = (req.query.q || "").trim();
    const platform = (req.query.platform || "tiktok").toLowerCase();

    if (!query) return res.status(400).json({ error: "no query" });

    console.log(`Search запрос: "${query}" (platform: ${platform})`);

    // Если это прямая ссылка на VK-видео — возвращаем инфо о нём
    if (query.includes("vk.com/video") || query.includes("vkvideo.ru/video")) {
        console.log("Распознана VK-ссылка, получаю инфо...");
        const vkInfo = await getVkVideoInfo(query);
        if (vkInfo) {
            return res.json({ results: [vkInfo], platform: "vk" });
        }
        return res.status(500).json({ error: "Не удалось получить инфо о VK-видео" });
    }

    try {
        let results;
        if (platform === "youtube") {
            results = await searchYoutube(query);
        } else if (platform === "tiktok") {
            results = await searchTikTok(query);
        } else {
            const [tt, yt] = await Promise.all([
                searchTikTok(query).catch(() => []),
                searchYoutube(query).catch(() => []),
            ]);
            results = [...tt, ...yt];
        }
        res.json({ results, platform });
    } catch (e) {
        console.error("Ошибка поиска:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// ============================================
// Получить инфо о VK-видео через yt-dlp
// ============================================
function getVkVideoInfo(url) {
    return new Promise((resolve) => {
        const normalizedUrl = url
            .replace("vk.com/video", "vkvideo.ru/video")
            .replace("m.vk.com/video", "vkvideo.ru/video");

        execFile(YT_DLP_PATH, [
            normalizedUrl,
            "--dump-json",
            "--no-warnings",
            "--skip-download",
            "--no-playlist",
        ], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
            if (err) {
                console.error("VK info error:", err.message);
                return resolve(null);
            }
            try {
                const j = JSON.parse(stdout.trim());
                resolve({
                    id: j.id,
                    title: j.title || "VK видео",
                    url: url,
                    thumbnail: j.thumbnail || null,
                    author: j.uploader || j.channel || "VK",
                    duration: j.duration,
                    platform: "vk",
                });
            } catch (e) {
                console.error("VK JSON parse error:", e.message);
                resolve(null);
            }
        });
    });
}

// ============================================
// Поиск TikTok (через ytsearch, фильтр tiktok.com)
// ============================================
async function searchTikTok(query) {
    const results = await searchWithYtDlp(`ytsearch15:${query} tiktok`, "tiktok");

    const tiktokOnly = results.filter(r =>
        r.url && r.url.includes("tiktok.com")
    );

    let finalResults;
    if (tiktokOnly.length > 0) {
        finalResults = tiktokOnly;
    } else {
        finalResults = results.map(r => ({
            ...r,
            platform: r.url.includes("tiktok.com") ? "tiktok" : "youtube",
        }));
    }

    for (const r of finalResults) {
        if (!r.thumbnail) {
            try {
                const oembedUrl = r.url.includes("tiktok.com")
                    ? "https://www.tiktok.com/oembed?url=" + encodeURIComponent(r.url)
                    : "https://www.youtube.com/oembed?url=" + encodeURIComponent(r.url) + "&format=json";

                const oembed = await fetch(oembedUrl);
                if (oembed.ok) {
                    const info = await oembed.json();
                    r.thumbnail = info.thumbnail_url || null;
                    if (!r.title || r.title === "Без названия") r.title = info.title || r.title;
                    if (!r.author) r.author = info.author_name || "";
                }
            } catch (e) {
                console.warn("oEmbed не сработал для", r.url, ":", e.message);
            }
        }
    }

    return finalResults;
}

// ============================================
// Поиск YouTube
// ============================================
async function searchYoutube(query) {
    const results = await searchWithYtDlp(`ytsearch15:${query}`, "youtube");

    for (const r of results) {
        if (!r.thumbnail && r.url) {
            try {
                const oembed = await fetch(
                    "https://www.youtube.com/oembed?url=" +
                    encodeURIComponent(r.url) + "&format=json"
                );
                if (oembed.ok) {
                    const info = await oembed.json();
                    r.thumbnail = info.thumbnail_url || null;
                    if (!r.title) r.title = info.title || r.title;
                    if (!r.author) r.author = info.author_name || "";
                }
            } catch (e) {
                console.warn("oEmbed не сработал:", e.message);
            }
        }
    }

    return results;
}

// ============================================
// Общий поиск через yt-dlp
// ============================================
function searchWithYtDlp(searchQuery, platform) {
    return new Promise((resolve, reject) => {
        const args = [
            searchQuery,
            "--dump-json",
            "--flat-playlist",
            "--no-warnings",
            "--skip-download",
        ];

        execFile(YT_DLP_PATH, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) {
                console.error("yt-dlp stderr:", stderr);
                return reject(new Error(err.message || "yt-dlp error"));
            }

            const results = stdout.trim().split("\n").filter(Boolean).map((line) => {
                try {
                    const j = JSON.parse(line);

                    const url = j.webpage_url || j.url || "";
                    const isVideo = url.includes("/watch?")
                                 || url.includes("youtu.be/")
                                 || url.includes("/shorts/")
                                 || url.includes("/video/");

                    if (!isVideo) return null;

                    const realPlatform = url.includes("youtube.com") || url.includes("youtu.be")
                        ? "youtube"
                        : url.includes("tiktok.com")
                            ? "tiktok"
                            : platform;

                    const isYouTube = realPlatform === "youtube";

                    const thumbnail = j.thumbnail
                        || (isYouTube ? `https://i.ytimg.com/vi/${j.id}/hqdefault.jpg` : null);

                    return {
                        id: j.id,
                        title: j.title || "Без названия",
                        url: url,
                        thumbnail: thumbnail,
                        author: j.uploader || j.channel,
                        duration: j.duration,
                        platform: realPlatform,
                    };
                } catch { return null; }
            }).filter(Boolean);

            resolve(results);
        });
    });
}

// ============================================
// /cover — прокси-обложка
// ============================================
app.get("/cover", async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).send("no url");
    try {
        const r = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
                "Referer": "https://www.tiktok.com/",
                "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
            }
        });
        if (!r.ok) throw new Error("HTTP " + r.status);
        res.setHeader("Content-Type", r.headers.get("content-type") || "image/jpeg");
        res.setHeader("Cache-Control", "public, max-age=86400");
        const buf = Buffer.from(await r.arrayBuffer());
        res.end(buf);
    } catch (e) {
        console.error("Cover error:", url, e.message);
        res.status(500).send(e.message);
    }
});

// ============================================
// Утилита: безопасное имя файла
// ============================================
function sanitizeFileName(name) {
    let safe = (name || "video")
        .replace(/[^\wа-яА-ЯёЁ\s._-]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 80);
    if (!safe) safe = "video";
    return safe;
}

// ============================================
// /download — TikTok (ttdl), YouTube или VK (yt-dlp)
// ============================================
app.get("/download", async (req, res) => {
    const url = req.query.url;
    const format = (req.query.format || "mp4").toLowerCase();

    if (!url) return res.status(400).send("no url");

    console.log(`Download запрос: ${url} (format: ${format})`);

    // 👇 VK — обрабатываем через отдельную функцию
    if (url.includes("vk.com/video") || url.includes("vkvideo.ru/video")) {
        const start = parseInt(req.query.start, 10) || 0;
        const normalizedUrl = url
            .replace("vk.com/video", "vkvideo.ru/video")
            .replace("m.vk.com/video", "vkvideo.ru/video");
        return downloadWithYtDlpVk(normalizedUrl, res, format, start);
    }

    if (url.includes("youtube.com") || url.includes("youtu.be")) {
        return downloadWithYtDlp(url, res, format);
    }

    if (format === "mp3") {
        return downloadWithYtDlp(url, res, "mp3");
    }

    try {
        const v = await download(url);
        const videoUrl = v.videoNoWatermark;

        let safeTitle = (v.title || "").trim();
        if (!safeTitle) {
            safeTitle = (v.author || "tiktok") + "_" + (v.id || Date.now());
        }
        safeTitle = sanitizeFileName(safeTitle);
        const fileName = safeTitle + ".mp4";

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="video.mp4"; filename*=UTF-8''${encodeURIComponent(fileName)}`
        );
        res.setHeader("Content-Type", "video/mp4");

        const response = await fetch(videoUrl);
        if (!response.ok) throw new Error("CDN ответил " + response.status);

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.setHeader("Content-Length", buffer.length);
        res.end(buffer);

        console.log("Отдано (TikTok MP4):", fileName, buffer.length, "bytes");
    } catch (e) {
        console.error("Ошибка download (TikTok):", e.message);
        if (!res.headersSent) res.status(500).send("Ошибка: " + e.message);
    }
});

// ============================================
// Получить title через yt-dlp
// ============================================
function getYtDlpTitle(url) {
    return new Promise((resolve) => {
        execFile(YT_DLP_PATH, [
            url,
            "--dump-json",
            "--no-warnings",
            "--skip-download",
            "--no-playlist",
        ], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
            if (err) return resolve(null);
            try {
                const j = JSON.parse(stdout.trim());
                resolve(j.title || null);
            } catch { resolve(null); }
        });
    });
}

// ============================================
// Скачивание через yt-dlp (MP4 H.264 или MP3)
// ============================================
async function downloadWithYtDlp(url, res, format = "mp4") {
    const ext = format === "mp3" ? "mp3" : "mp4";
    const tmpFile = path.join(
        os.tmpdir(),
        `yt_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    );

    const title = await getYtDlpTitle(url);
    const safeTitle = sanitizeFileName(title || "video");
    const fileName = `${safeTitle}.${ext}`;

    let args;
    if (format === "mp3") {
        args = [
            url,
            "-x",
            "--audio-format", "mp3",
            "--audio-quality", "0",
            "-o", tmpFile,
            "--no-warnings",
            "--no-playlist",
        ];
    } else {
        args = [
            url,
            "-f", "bv*[ext=mp4][vcodec^=avc1]+ba[ext=m4a]/b[ext=mp4][vcodec^=avc1]/b[ext=mp4]/best",
            "--merge-output-format", "mp4",
            "-o", tmpFile,
            "--no-warnings",
            "--no-playlist",
        ];
    }

    console.log(`yt-dlp → ${tmpFile} (format: ${format}, title: ${safeTitle})`);

    const proc = execFile(YT_DLP_PATH, args, {
        maxBuffer: 1024 * 1024 * 1024,
    });

    let stderrData = "";

    proc.stderr.on("data", (d) => {
        stderrData += d.toString();
        console.error("yt-dlp:", d.toString().trim());
    });

    proc.on("error", (e) => {
        console.error("yt-dlp spawn error:", e.message);
        cleanup();
        if (!res.headersSent) {
            res.status(500).json({ error: "yt-dlp не запущен: " + e.message });
        }
    });

    proc.on("close", (code) => {
        console.log("yt-dlp завершён с кодом:", code);

        if (code !== 0 || !fs.existsSync(tmpFile)) {
            console.error("yt-dlp stderr:", stderrData);
            cleanup();
            if (!res.headersSent) {
                res.status(500).json({
                    error: "yt-dlp не смог скачать: " + stderrData.substring(0, 300)
                });
            }
            return;
        }

        const stat = fs.statSync(tmpFile);

        if (stat.size === 0) {
            cleanup();
            if (!res.headersSent) {
                res.status(500).json({ error: "yt-dlp вернул пустой файл" });
            }
            return;
        }

        console.log("Размер файла:", stat.size, "байт");

        const mime = format === "mp3" ? "audio/mpeg" : "video/mp4";
        const fallbackName = format === "mp3" ? "audio.mp3" : "video.mp4";

        res.setHeader("Content-Type", mime);
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
        );
        res.setHeader("Content-Length", stat.size);

        const stream = fs.createReadStream(tmpFile);
        stream.pipe(res);

        stream.on("close", () => {
            cleanup();
        });

        stream.on("error", (e) => {
            console.error("Stream error:", e.message);
            cleanup();
            if (!res.writableEnded) res.end();
        });
    });

    function cleanup() {
        try {
            if (fs.existsSync(tmpFile)) {
                fs.unlinkSync(tmpFile);
                console.log("Удалён временный файл:", tmpFile);
            }
        } catch (e) {
            console.error("Cleanup error:", e.message);
        }
    }

    res.on("close", () => {
        if (!proc.killed) proc.kill();
    });
}

// ============================================
// /api-youtube — инфо о YouTube-видео
// ============================================
app.get("/api-youtube", async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: "no url" });

    console.log("API-YouTube запрос:", url);

    const isVideo = url.includes("/watch?")
                 || url.includes("youtu.be/")
                 || url.includes("/shorts/");

    if (!isVideo) {
        return res.status(400).json({
            error: "Это не ссылка на видео. Открой видео, а не канал."
        });
    }

    try {
        const args = [
            url,
            "--dump-json",
            "--no-warnings",
            "--skip-download",
            "--no-playlist",
        ];

        execFile(YT_DLP_PATH, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) {
                console.error("yt-dlp stderr:", stderr);
                return res.status(500).json({
                    error: "yt-dlp error: " + (stderr || err.message).substring(0, 200)
                });
            }

            const trimmed = stdout.trim();

            if (!trimmed.startsWith("{")) {
                console.error("yt-dlp вернул не JSON:", trimmed.substring(0, 200));
                return res.status(500).json({
                    error: "yt-dlp вернул не JSON. Возможно, это канал или плейлист."
                });
            }

            try {
                const j = JSON.parse(trimmed);
                const cover = j.thumbnail
                    || `https://i.ytimg.com/vi/${j.id}/hqdefault.jpg`;

                res.json({
                    video: j.url || null,
                    title: j.title || "video",
                    author: j.uploader || j.channel || "",
                    id: j.id || Date.now().toString(),
                    cover: cover,
                    duration: j.duration || 0,
                });
            } catch (e) {
                console.error("JSON parse error:", e.message);
                res.status(500).json({ error: "Не удалось распарсить ответ yt-dlp" });
            }
        });
    } catch (e) {
        console.error("Ошибка api-youtube:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// ============================================
// /download-vk — скачивание видео из VK
// Параметры: url, format=mp4|mp3, start=секунда
// ============================================
app.get("/download-vk", async (req, res) => {
    const url = req.query.url;
    const format = (req.query.format || "mp4").toLowerCase();
    const start = parseInt(req.query.start, 10) || 0;

    if (!url) return res.status(400).send("no url");

    const normalizedUrl = url
        .replace("vk.com/video", "vkvideo.ru/video")
        .replace("m.vk.com/video", "vkvideo.ru/video");

    console.log(`Download VK: ${normalizedUrl} (format: ${format}, start: ${start})`);

    return downloadWithYtDlpVk(normalizedUrl, res, format, start);
});

// ============================================
// Скачивание VK через yt-dlp с обрезкой
// ============================================
async function downloadWithYtDlpVk(url, res, format = "mp4", start = 0) {
    const ext = format === "mp3" ? "mp3" : "mp4";
    const tmpFile = path.join(
        os.tmpdir(),
        `vk_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    );

    const title = await getYtDlpTitle(url);
    const safeTitle = sanitizeFileName(title || "vk_video");
    const fileName = `${safeTitle}.${ext}`;

    const args = [
        url,
        "-o", tmpFile,
        "--no-warnings",
        "--no-playlist",
        "--downloader", "ffmpeg",
        "--downloader-args", "ffmpeg_i:-tls_verify 0 -loglevel error",
    ];

    if (format === "mp3") {
        args.push(
            "-x",
            "--audio-format", "mp3",
            "--audio-quality", "0"
        );
    } else {
        args.push(
            "-f", "best[ext=mp4]/best",
            "--merge-output-format", "mp4"
        );
    }

    if (start > 0) {
        args.push("--download-sections", `*${start}-inf`);
    }

    console.log(`yt-dlp VK → ${tmpFile} (format: ${format}, start: ${start}, title: ${safeTitle})`);

    const proc = execFile(YT_DLP_PATH, args, {
        maxBuffer: 1024 * 1024 * 1024,
    });

    let stderrData = "";

    proc.stderr.on("data", (d) => {
        stderrData += d.toString();
        console.error("yt-dlp VK:", d.toString().trim());
    });

    proc.on("error", (e) => {
        console.error("yt-dlp VK spawn error:", e.message);
        cleanup();
        if (!res.headersSent) {
            res.status(500).json({ error: "yt-dlp не запущен: " + e.message });
        }
    });

    proc.on("close", (code) => {
        console.log("yt-dlp VK завершён с кодом:", code);

        if (code !== 0 || !fs.existsSync(tmpFile)) {
            console.error("yt-dlp VK stderr:", stderrData);
            cleanup();
            if (!res.headersSent) {
                res.status(500).json({
                    error: "yt-dlp не смог скачать VK: " + stderrData.substring(0, 300)
                });
            }
            return;
        }

        const stat = fs.statSync(tmpFile);

        if (stat.size === 0) {
            cleanup();
            if (!res.headersSent) {
                res.status(500).json({ error: "yt-dlp вернул пустой файл" });
            }
            return;
        }

        console.log("Размер VK файла:", stat.size, "байт");

        const mime = format === "mp3" ? "audio/mpeg" : "video/mp4";
        const fallbackName = format === "mp3" ? "audio.mp3" : "video.mp4";

        res.setHeader("Content-Type", mime);
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
        );
        res.setHeader("Content-Length", stat.size);

        const stream = fs.createReadStream(tmpFile);
        stream.pipe(res);

        stream.on("close", () => cleanup());
        stream.on("error", (e) => {
            console.error("VK stream error:", e.message);
            cleanup();
            if (!res.writableEnded) res.end();
        });
    });

    function cleanup() {
        try {
            if (fs.existsSync(tmpFile)) {
                fs.unlinkSync(tmpFile);
                console.log("Удалён временный VK файл:", tmpFile);
            }
        } catch (e) {
            console.error("VK cleanup error:", e.message);
        }
    }

    res.on("close", () => {
        if (!proc.killed) proc.kill();
    });
}

// ============================================
// Старт
// ============================================
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Сервер запущен: http://localhost:${PORT}`);
    console.log(`API:   http://localhost:${PORT}/api?url=...`);
    console.log(`Поиск TikTok:  http://localhost:${PORT}/search?q=бультерьер&platform=tiktok`);
    console.log(`Поиск YouTube: http://localhost:${PORT}/search?q=бультерьер&platform=youtube`);
    console.log(`Скачать MP4:   http://localhost:${PORT}/download?url=...&format=mp4`);
    console.log(`Скачать MP3:   http://localhost:${PORT}/download?url=...&format=mp3`);
    console.log(`Скачать VK:    http://localhost:${PORT}/download-vk?url=...&format=mp4&start=60`);
    console.log(`yt-dlp: ${YT_DLP_PATH}`);
});
