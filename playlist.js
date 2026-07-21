(function () {
    'use strict';

    if (typeof require === 'undefined') {
        console.warn('[playlist-patch] Node integration недоступна');
        return;
    }

    try {
        const cp = require('child_process');

        if (cp.spawn.__playlistPatchApplied) {
            return;
        }

        const originalSpawn = cp.spawn;

        cp.spawn = function (command, args, options) {
            try {
                if (
                    !Array.isArray(args) ||
                    typeof Lampa === 'undefined' ||
                    !Lampa.Player ||
                    typeof Lampa.Player.playdata !== 'function'
                ) {
                    return originalSpawn.call(this, command, args, options);
                }

                const data = Lampa.Player.playdata();

                if (
                    !data ||
                    !Array.isArray(data.playlist) ||
                    data.playlist.length < 2
                ) {
                    return originalSpawn.call(this, command, args, options);
                }

                let current = data.playlist.findIndex(item => item.selected);
                if (current < 0) current = 0;

                const playlist = data.playlist
                    .slice(current)
                    .filter(item =>
                        item &&
                        typeof item.url === 'string' &&
                        item.url.length
                    );

                if (playlist.length < 2) {
                    return originalSpawn.call(this, command, args, options);
                }

                const urlIndex = args.findIndex(arg =>
                    typeof arg === 'string' &&
                    arg.length &&
                    arg[0] !== '-'
                );

                if (urlIndex === -1) {
                    console.warn('[playlist-patch] URL не найден');
                    return originalSpawn.call(this, command, args, options);
                }

                const urls = playlist.map(item =>
                    item.url.replace('&preload', '&play')
                );

                const newArgs = [
                    ...args.slice(0, urlIndex),
                    ...urls,
                    ...args.slice(urlIndex + 1)
                ];

                console.log(
                    `[playlist-patch] ${command}: ${urls.length} серий`
                );

                return originalSpawn.call(this, command, newArgs, options);

            } catch (err) {
                console.error('[playlist-patch]', err);
                return originalSpawn.call(this, command, args, options);
            }
        };

        cp.spawn.__playlistPatchApplied = true;

        console.log('[playlist-patch] Установлен');

    } catch (err) {
        console.error('[playlist-patch]', err);
    }
})();