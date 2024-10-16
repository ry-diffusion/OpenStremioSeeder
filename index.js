import { QBittorrent } from '@ctrl/qbittorrent'
import Setup from "./Setup.js"
import { readdir, readFile } from 'fs/promises'
import { existsSync } from 'fs';

const cx = new QBittorrent({
    baseUrl: Setup.URL,
    username: Setup.User,
    password: Setup.Passwd
});

async function scanStremioCache() {
    const caches = []

    for await (const dir of await readdir(Setup.StremioCacheDir)) {
        const root = `${Setup.StremioCacheDir}/${dir}`
        const torrentFile = `${root}/cache`

        if (!existsSync(torrentFile)) {
            continue
        }

        caches.push({
            root,
            hash: dir,
            torrentFile,
            torrent: await readFile(torrentFile)
        })
    }

    return caches
}


async function main() {
    const res = await scanStremioCache();

    for (const cache of res) {
        console.log(`[+] Adding ${cache.hash} to qBittorrent`)
        try {
            await cx.addTorrent(cache.torrent, {
                savepath: cache.root,
                category: "Stremio",
                paused: true
            })
        } catch (e) {
            console.log(`[-] Failed to add ${cache.hash} to qBittorrent`)
        }
    }

    const torrents = await cx.listTorrents()
    console.log("[**] Updating status!");


    for (const torrent of torrents) {
        if (torrent.state == "checkingUP" || torrent.state == "checkingDL") {
            console.log(`[!] ${torrent.hash} is still checking. Run again later`)
            continue;
        }

        if (torrent.category !== "Stremio") {
            continue
        }

        const files = await cx.torrentFiles(torrent.hash)
        if (!files.length) {
            console.log(`[!] ${torrent.hash} has no files. Run again later`)
            continue;

        }

        try {
            const incomplete = files.filter(item => item.progress >= 0.5).map(f => f.index);
            const complete = files.filter(item => item.progress <= 0.5).map(f => f.index);
            if (incomplete.length !== 0)
                await cx.setFilePriority(torrent.hash, incomplete, 1)
            if (complete.length !== 0)
                await cx.setFilePriority(torrent.hash, complete, 0)
        } catch (e) {
            console.log(`[-] Failed to update ${torrent.hash} status`)
        }
    }
}

main()