(function () {
    'use strict';

    if (typeof require === 'undefined') {
        return;
    }

    try {
        const cp = require('child_process');
        const fs = require('fs');
        const path = require('path');

        function log() {
            try {
                const text = Array.from(arguments).join(' ');
                fs.appendFileSync(
                    path.join(process.cwd(), 'playlist-patch.log'),
                    '[' + new Date().toLocaleTimeString() + '] ' + text + '\n'
                );
            } catch (e) {}
        }

        if (cp.spawn.__playlistPatchApplied) {
            log('Уже установлен');
            return;
        }

        const originalSpawn = cp.spawn;

        cp.spawn = function (command, args, options) {

            log('--------------------------------');
            log('spawn:', command);

            try {
                log('args:', JSON.stringify(args));

                if (
                    typeof Lampa !== 'undefined' &&
                    Lampa.Player &&
                    typeof Lampa.Player.playdata === 'function'
                ) {
                    const data = Lampa.Player.playdata();

                    log('playdata:');
                    log(JSON.stringify(data, null, 2));

                    if (
                        data &&
                        Array.isArray(data.playlist)
                    ) {
                        log('playlist length:', data.playlist.length);

                        let idx = data.playlist.findIndex(p => p.selected);
                        if (idx < 0) idx = 0;

                        const playlist = data.playlist
                            .slice(idx)
                            .filter(p => p && typeof p.url === 'string');

                        log('usable playlist:', playlist.length);

                        if (playlist.length > 1 && Array.isArray(args)) {

                            const urlIndex = args.findIndex(a =>
                                typeof a === 'string' &&
                                a.length &&
                                a[0] !== '-'
                            );

                            log('urlIndex:', urlIndex);

                            if (urlIndex !== -1) {

                                const urls = playlist.map(p =>
                                    p.url.replace('&preload', '&play')
                                );

                                log('urls:', JSON.stringify(urls));

                                args = [
                                    ...args.slice(0, urlIndex),
                                    ...urls,
                                    ...args.slice(urlIndex + 1)
                                ];

                                log('patched args:', JSON.stringify(args));
                            }
                        }
                    }
                }
            } catch (e) {
                log('ERROR:', e.stack || e);
            }

            return originalSpawn.call(this, command, args, options);
        };

        cp.spawn.__playlistPatchApplied = true;

        log('Патч установлен');

    } catch (e) {}
})();