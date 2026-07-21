(function () {
    'use strict';

    const _require = typeof require !== 'undefined'
        ? require
        : (typeof window !== 'undefined' && window.require ? window.require : null);

    if (!_require) return;

    try {
        const cp = _require('child_process');
        const fs = _require('fs');
        const path = _require('path');
        const os = _require('os');

        function log(...args) {
            const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
            try {
                fs.appendFileSync(
                    path.join(os.homedir(), 'lampa-patch.log'),
                    '[' + new Date().toLocaleTimeString() + '] ' + msg + '\n'
                );
            } catch (e) {}
        }

        if (cp.spawn.__playlistPatchApplied) return;

        const originalSpawn = cp.spawn;

        cp.spawn = function (command, args, options) {
            log('=== Запуск плеера:', command, '===');
            log('Оригинальные аргументы:', JSON.stringify(args));

            try {
                if (Array.isArray(args)) {
                    // Ищем URL TorrServer'а среди аргументов
                    const urlIndex = args.findIndex(a => 
                        typeof a === 'string' && 
                        (a.includes('/stream') || a.includes('/play') || a.includes('link='))
                    );

                    if (urlIndex !== -1) {
                        const origUrl = args[urlIndex];
                        log('Найден URL TorrServer:', origUrl);

                        // Пробуем достать hash из URL
                        // Обычно ссылки выглядят как: http://127.0.0.1:8090/stream/... ?link=HASH...
                        const urlObj = new URL(origUrl);
                        const hash = urlObj.searchParams.get('link') || urlObj.searchParams.get('hash');

                        if (hash) {
                            // Формируем M3U ссылку прямо с TorrServer
                            const m3uUrl = `${urlObj.origin}/playlist.m3u?hash=${hash}`;
                            
                            log('Сформирован M3U URL TorrServer:', m3uUrl);

                            // Подменяем одиночную ссылку на плейлист
                            args[urlIndex] = m3uUrl;

                            if (typeof Lampa !== 'undefined' && Lampa.Noty) {
                                Lampa.Noty.show('Проброшен M3U плейлист TorrServer');
                            }
                        } else {
                            log('Не удалось извлечь hash/link из URL:', origUrl);
                        }
                    } else {
                        log('URL TorrServer не найден в аргументах');
                    }
                }
            } catch (e) {
                log('ОШИБКА:', e.stack || e.message);
            }

            return originalSpawn.call(this, command, args, options);
        };

        cp.spawn.__playlistPatchApplied = true;

    } catch (e) {}
})();