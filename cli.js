#!/usr/bin/env node

/**
 * CLI для скачивания видео из TikTok, YouTube и VK
 * Режимы:
 *   node cli.js              → интерактивное меню
 *   node cli.js tiktok <url> → прямая команда
 *   node cli.js --help       → справка
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const readline = require("readline");
const { execFile, spawn } = require("child_process");
const { download } = require("@silent-tech-offc/ttdl");

const YT_DLP_PATH = path.join(__dirname, "yt-dlp.exe");
const OUTPUT_DIR = path.join(__dirname, "downloads");

// ============================================
// Утилиты
// ============================================
function ensureOutputDir() {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
}

function sanitizeFileName(name) {
    let safe = (name || "video")
        .replace(/[^\wа-яА-ЯёЁ\s._-]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 80);
    if (!safe) safe = "video";
    return safe;
}

function isVk(url) {
    return url.includes("vk.com/video") || url.includes("vkvideo.ru/video");
}
function isYouTube(url) {
    return url.includes("youtube.com") || url.includes("youtu.be");
}
function isTikTok(url) {
    return url.includes("tiktok.com");
}

function normalizeVkUrl(url) {
    return url
        .replace("vk.com/video", "vkvideo.ru/video")
        .replace("m.vk.com/video", "vkvideo.ru/video");
}

// ============================================
// Интерактивный ввод
// ============================================
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function ask(question) {
    return new Promise((resolve) => rl.question(question, resolve));
}

// ============================================
// Скачивание TikTok
// ============================================
async function downloadTikTok(url, isAudio) {
    console.log(`\n[TikTok] Получаю инфо...`);
    const v = await download(url);
    const videoUrl = v.videoNoWatermark;
    if (!videoUrl) throw new Error("Не удалось получить ссылку на видео");

    let safeTitle = (v.title || "").trim();
    if (!safeTitle) safeTitle = (v.author || "tiktok") + "_" + (v.id || Date.now());
    safeTitle = sanitizeFileName(safeTitle);

    ensureOutputDir();

    if (isAudio) {
        console.log("[TikTok] Конвертирую в MP3...");
        const tmpVideo = path.join(os.tmpdir(), `tt_${Date.now()}.mp4`);
        const response = await fetch(videoUrl);
        if (!response.ok) throw new Error("CDN ответил " + response.status);
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(tmpVideo, buffer);

        const outFile = path.join(OUTPUT_DIR, safeTitle + ".mp3");
        await runYtDlp(["-x", "--audio-format", "mp3", "--audio-quality", "0", "-o", outFile, tmpVideo]);
        fs.unlinkSync(tmpVideo);
        console.log(`✓ Сохранено: ${outFile}`);
    } else {
        const outFile = path.join(OUTPUT_DIR, safeTitle + ".mp4");
        const response = await fetch(videoUrl);
        if (!response.ok) throw new Error("CDN ответил " + response.status);
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(outFile, buffer);
        console.log(`✓ Сохранено: ${outFile}`);
    }
}

// ============================================
// Скачивание через yt-dlp (YouTube / VK)
// ============================================
function runYtDlp(args) {
    return new Promise((resolve, reject) => {
        const proc = spawn(YT_DLP_PATH, args, { stdio: "inherit" });
        proc.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`yt-dlp завершился с кодом ${code}`));
        });
        proc.on("error", reject);
    });
}

async function downloadWithYtDlp(url, isAudio, start = 0) {
    ensureOutputDir();

    const args = [
        url,
        "-o", path.join(OUTPUT_DIR, "%(title)s.%(ext)s"),
        "--no-warnings",
        "--no-playlist",
    ];

    if (isVk(url)) {
        args.push(
            "--no-check-certificate",
            "--downloader", "ffmpeg",
            "--downloader-args", "ffmpeg_i:-tls_verify 0 -loglevel error"
        );
    }

    if (isAudio) {
        args.push("-x", "--audio-format", "mp3", "--audio-quality", "0");
    } else {
        args.push(
            "-f", "bv*[ext=mp4][vcodec^=avc1]+ba[ext=m4a]/b[ext=mp4][vcodec^=avc1]/b[ext=mp4]/best",
            "--merge-output-format", "mp4"
        );
    }

    if (start > 0) {
        args.push("--download-sections", `*${start}-inf`);
    }

    console.log(`\n[yt-dlp] Скачиваю...`);
    await runYtDlp(args);
    console.log(`✓ Сохранено в: ${OUTPUT_DIR}`);
}

// ============================================
// Инфо о видео
// ============================================
function getInfo(url) {
    return new Promise((resolve, reject) => {
        const normalized = isVk(url) ? normalizeVkUrl(url) : url;
        execFile(YT_DLP_PATH, [
            normalized,
            "--dump-json",
            "--no-warnings",
            "--skip-download",
            "--no-playlist",
        ], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
            if (err) return reject(err);
            try {
                const j = JSON.parse(stdout.trim());
                resolve({
                    id: j.id,
                    title: j.title,
                    author: j.uploader || j.channel,
                    duration: j.duration,
                    thumbnail: j.thumbnail,
                    platform: isVk(url) ? "vk" : isYouTube(url) ? "youtube" : "tiktok",
                });
            } catch (e) { reject(e); }
        });
    });
}

// ============================================
// Поиск
// ============================================
function search(query, platform) {
    return new Promise((resolve, reject) => {
        const searchQuery = platform === "youtube"
            ? `ytsearch15:${query}`
            : platform === "tiktok"
                ? `ytsearch15:${query} tiktok`
                : `ytsearch15:${query}`;

        execFile(YT_DLP_PATH, [
            searchQuery,
            "--dump-json",
            "--flat-playlist",
            "--no-warnings",
            "--skip-download",
        ], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
            if (err) return reject(err);
            const results = stdout.trim().split("\n").filter(Boolean).map(line => {
                try {
                    const j = JSON.parse(line);
                    const url = j.webpage_url || j.url || "";
                    if (!url.includes("/watch?") && !url.includes("youtu.be/") &&
                        !url.includes("/shorts/") && !url.includes("/video/")) return null;
                    return {
                        title: j.title,
                        url: url,
                        author: j.uploader || j.channel,
                        duration: j.duration,
                    };
                } catch { return null; }
            }).filter(Boolean);
            resolve(results);
        });
    });
}

// ============================================
// Help
// ============================================
function printHelp() {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║  TikTok / YouTube / VK Downloader CLI                    ║
╚══════════════════════════════════════════════════════════╝

Использование:
  node cli.js                          → интерактивное меню
  node cli.js <команда> <аргумент>     → прямая команда

Команды:
  tiktok <url>              Скачать видео из TikTok
  youtube <url>             Скачать видео из YouTube
  vk <url>                  Скачать видео из VK
  search <запрос>           Найти видео
  info <url>                Показать инфо о видео

Флаги:
  --mp3                     Скачать только аудио (MP3)
  --start=<секунда>         Начать скачивание с указанной секунды (только VK)
  --platform=youtube|tiktok|all   Платформа для поиска (по умолчанию all)
  --help                    Показать справку

Примеры:
  node cli.js tiktok https://www.tiktok.com/@user/video/123
  node cli.js youtube https://youtu.be/xxx --mp3
  node cli.js vk https://vk.com/video-22822305_456239018 --start=60
  node cli.js search "бультерьер" --platform=youtube
  node cli.js info https://youtu.be/xxx

Файлы сохраняются в: ${OUTPUT_DIR}
`);
}

// ============================================
// Интерактивное меню
// ============================================
async function interactiveMenu() {
    while (true) {
        console.log(`
╔════════════════════════════════════════════╗
║   TikTok / YouTube / VK Downloader         ║
╠════════════════════════════════════════════╣
║  1. Скачать с TikTok                       ║
║  2. Скачать с YouTube                      ║
║  3. Скачать из VK                          ║
║  4. Скачать только аудио (MP3)             ║
║  5. Поиск видео                            ║
║  6. Инфо о видео                           ║
║  0. Выход                                  ║
╚════════════════════════════════════════════╝
`);

        const choice = (await ask("Выбери пункт: ")).trim();

        try {
            switch (choice) {
                case "1": {
                    const url = (await ask("Вставь ссылку TikTok: ")).trim();
                    if (!url) { console.log("✗ Пустая ссылка"); break; }
                    if (!isTikTok(url)) { console.log("✗ Это не TikTok-ссылка"); break; }
                    await downloadTikTok(url, false);
                    break;
                }
                case "2": {
                    const url = (await ask("Вставь ссылку YouTube: ")).trim();
                    if (!url) { console.log("✗ Пустая ссылка"); break; }
                    if (!isYouTube(url)) { console.log("✗ Это не YouTube-ссылка"); break; }
                    await downloadWithYtDlp(url, false, 0);
                    break;
                }
                case "3": {
                    const url = (await ask("Вставь ссылку VK: ")).trim();
                    if (!url) { console.log("✗ Пустая ссылка"); break; }
                    if (!isVk(url)) { console.log("✗ Это не VK-ссылка"); break; }
                    await downloadWithYtDlp(normalizeVkUrl(url), false, 0);
                    break;
                }
                case "4": {
                    const url = (await ask("Вставь ссылку (TikTok/YouTube/VK): ")).trim();
                    if (!url) { console.log("✗ Пустая ссылка"); break; }
                    if (isTikTok(url)) {
                        await downloadTikTok(url, true);
                    } else if (isYouTube(url) || isVk(url)) {
                        const normalized = isVk(url) ? normalizeVkUrl(url) : url;
                        await downloadWithYtDlp(normalized, true, 0);
                    } else {
                        console.log("✗ Неизвестная платформа");
                    }
                    break;
                }
                case "5": {
                    const query = (await ask("Поисковый запрос: ")).trim();
                    if (!query) { console.log("✗ Пустой запрос"); break; }
                    const platform = (await ask("Платформа (youtube/tiktok/all, Enter=all): ")).trim() || "all";
                    console.log(`\nПоиск: "${query}" (${platform})...\n`);
                    const results = await search(query, platform);
                    if (results.length === 0) {
                        console.log("Ничего не найдено.");
                        break;
                    }
                    results.forEach((r, i) => {
                        console.log(`${i + 1}. ${r.title}`);
                        console.log(`   Автор: ${r.author || "—"}`);
                        console.log(`   URL:   ${r.url}`);
                        console.log("");
                    });
                    const pick = (await ask("Скачать один из них? Введи номер (Enter=пропустить): ")).trim();
                    if (pick) {
                        const idx = parseInt(pick, 10) - 1;
                        if (results[idx]) {
                            const r = results[idx];
                            if (isTikTok(r.url)) {
                                await downloadTikTok(r.url, false);
                            } else {
                                await downloadWithYtDlp(r.url, false, 0);
                            }
                        }
                    }
                    break;
                }
                case "6": {
                    const url = (await ask("Вставь ссылку: ")).trim();
                    if (!url) { console.log("✗ Пустая ссылка"); break; }
                    const info = await getInfo(url);
                    console.log("\n─────────────────────────────────────");
                    console.log(`Платформа: ${info.platform}`);
                    console.log(`ID:        ${info.id}`);
                    console.log(`Название:  ${info.title}`);
                    console.log(`Автор:     ${info.author || "—"}`);
                    console.log(`Длительность: ${info.duration ? info.duration + " сек" : "—"}`);
                    console.log("─────────────────────────────────────");
                    break;
                }
                case "0":
                    console.log("Пока!");
                    rl.close();
                    process.exit(0);
                default:
                    console.log("✗ Неизвестный пункт");
            }
        } catch (e) {
            console.error(`\n✗ Ошибка: ${e.message}\n`);
        }

        await ask("\nНажми Enter, чтобы вернуться в меню...");
    }
}

// ============================================
// Парсинг аргументов
// ============================================
function parseArgs(argv) {
    const args = { command: null, url: null, flags: {} };
    const rest = [];

    for (const arg of argv) {
        if (arg.startsWith("--")) {
            const [key, value] = arg.slice(2).split("=");
            args.flags[key] = value === undefined ? true : value;
        } else if (!args.command) {
            args.command = arg;
        } else if (!args.url) {
            args.url = arg;
        } else {
            rest.push(arg);
        }
    }
    args.rest = rest;
    return args;
}

// ============================================
// Main
// ============================================
async function main() {
    const argv = process.argv.slice(2);

    // Если аргументов нет — интерактивное меню
    if (argv.length === 0) {
        await interactiveMenu();
        return;
    }

    const args = parseArgs(argv);

    if (args.flags.help || !args.command) {
        printHelp();
        process.exit(0);
    }

    const isAudio = !!args.flags.mp3;
    const start = parseInt(args.flags.start, 10) || 0;

    try {
        switch (args.command) {
            case "tiktok":
                if (!args.url) throw new Error("Укажи URL");
                if (!isTikTok(args.url)) throw new Error("Это не TikTok-ссылка");
                await downloadTikTok(args.url, isAudio);
                break;

            case "youtube":
                if (!args.url) throw new Error("Укажи URL");
                if (!isYouTube(args.url)) throw new Error("Это не YouTube-ссылка");
                await downloadWithYtDlp(args.url, isAudio, 0);
                break;

            case "vk":
                if (!args.url) throw new Error("Укажи URL");
                if (!isVk(args.url)) throw new Error("Это не VK-ссылка");
                await downloadWithYtDlp(normalizeVkUrl(args.url), isAudio, start);
                break;

            case "search": {
                if (!args.url) throw new Error("Укажи поисковый запрос");
                const platform = args.flags.platform || "all";
                console.log(`Поиск: "${args.url}" (${platform})...\n`);
                const results = await search(args.url, platform);
                if (results.length === 0) {
                    console.log("Ничего не найдено.");
                    break;
                }
                results.forEach((r, i) => {
                    console.log(`${i + 1}. ${r.title}`);
                    console.log(`   Автор: ${r.author || "—"}`);
                    console.log(`   URL:   ${r.url}`);
                    console.log("");
                });
                break;
            }

            case "info": {
                if (!args.url) throw new Error("Укажи URL");
                const info = await getInfo(args.url);
                console.log("─────────────────────────────────────");
                console.log(`Платформа: ${info.platform}`);
                console.log(`ID:        ${info.id}`);
                console.log(`Название:  ${info.title}`);
                console.log(`Автор:     ${info.author || "—"}`);
                console.log(`Длительность: ${info.duration ? info.duration + " сек" : "—"}`);
                console.log(`Обложка:   ${info.thumbnail || "—"}`);
                console.log("─────────────────────────────────────");
                break;
            }

            default:
                console.error(`Неизвестная команда: ${args.command}`);
                printHelp();
                process.exit(1);
        }
    } catch (e) {
        console.error(`\n✗ Ошибка: ${e.message}\n`);
        process.exit(1);
    }

    rl.close();
}

main();