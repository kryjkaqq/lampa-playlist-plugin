(function () {
    'use strict';

    // 1. Получаем require из любого доступного места
    const _require = typeof require !== 'undefined' 
        ? require 
        : (typeof window !== 'undefined' && window.require ? window.require : null);

    if (!_require) {
        console.warn('[PlaylistPatch] Node.js `require` не найден. Плагин работает только в Desktop/Electron.');
        return;
    }

    try {
        const cp = _require('child_process');
        const fs = _require('fs');
        const path = _require('path');

        function log(...args) {
            const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
            console.log('[PlaylistPatch]', msg);
            try {
                fs.appendFileSync(
                    path.join(process.cwd(), 'playlist-patch.log'),
                    '[' + new Date().toLocaleTimeString() + '] ' + msg + '\n'
                );
            } catch (e) {}
        }

        if (cp.spawn.__playlistPatchApplied) {
            log('Патч уже установлен');
            return;
        }

        const originalSpawn = cp.spawn;

        cp.spawn = function (command, args, options) {
            log('--------------------------------');
            log('spawn command:', command);

            try {
                log('original args:', args);

                if (
                    typeof Lampa !== 'undefined' &&
                    Lampa.Player &&
                    typeof Lampa.Player.playdata === 'function'
                ) {
                    const data = Lampa.Player.playdata();

                    if (data && Array.isArray(data.playlist)) {
                        log('playlist total:', data.playlist.length);

                        let idx = data.playlist.findIndex(p => p.selected);
                        if (idx < 0) idx = 0;

                        const playlist = data.playlist
                            .slice(idx)
                            .filter(p => p && typeof p.url === 'string');

                        log('usable playlist:', playlist.length);

                        if (playlist.length > 1 && Array.isArray(args)) {
                            const urlIndex = args.findIndex(a =>
                                typeof a === 'string' &&
                                a.length > 0 &&
                                a[0] !== '-'
                            );

                            if (urlIndex !== -1) {
                                const urls = playlist.map(p =>
                                    p.url.replace('&preload', '&play')
                                );

                                log('replacing single URL with array of URLs:', urls);

                                args = [
                                    ...args.slice(0, urlIndex),
                                    ...urls,
                                    ...args.slice(urlIndex + 1)
                                ];

                                log('patched args:', args);
                            }
                        }
                    }
                }
            } catch (e) {
                log('ERROR in spawn hook:', e.stack || e);
            }

            return originalSpawn.call(this, command, args, options);
        };

        cp.spawn.__playlistPatchApplied = true;
        log('Патч успешно зарегистрирован!');

    } catch (e) {
        console.error('[PlaylistPatch Init Error]', e);
    }
})();