(function () {
    'use strict';

    // Функция отправки команд в API TorrServer без CORS-блокировок
    function sendTorrApi(host, payload) {
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', host + '/viewed', false);
            // text/plain обходит CORS Preflight (OPTIONS) в браузере,
            // благодаря чему TorrServer гарантированно получает и исполняет команду
            xhr.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
            xhr.send(JSON.stringify(payload));
        } catch (e) {
            console.error('TorrServer API Error:', e);
        }
    }

    function startPlugin() {
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show('M3U TorrServer: Активен');
        }

        if (typeof Lampa !== 'undefined' && Lampa.Player) {
            var originalPlay = Lampa.Player.play;

            Lampa.Player.play = function (item) {
                try {
                    if (item && item.url && (item.url.indexOf('link=') !== -1 || item.url.indexOf('hash=') !== -1)) {
                        var hostMatch = item.url.match(/(https?:\/\/[^\/]+)/);
                        var hashMatch = item.url.match(/(?:link|hash)=([a-fA-F0-9]+)/);
                        var indexMatch = item.url.match(/(?:index|id|file)=([0-9]+)/);

                        if (hostMatch && hashMatch) {
                            var host = hostMatch[1];
                            var hash = hashMatch[1];
                            var currentFileIndex = indexMatch ? parseInt(indexMatch[1], 10) : 0;

                            // 1. Гарантированно очищаем историю просмотров для этого торрента
                            sendTorrApi(host, { action: 'rem', hash: hash });

                            // 2. Если выбрана серия > 1 (индекс > 0), регистрируем предыдущую серию
                            if (currentFileIndex > 0) {
                                var targetIndex = currentFileIndex - 1;
                                sendTorrApi(host, {
                                    action: 'set',
                                    hash: hash,
                                    file_index: targetIndex,
                                    file: targetIndex,
                                    index: targetIndex
                                });
                            }

                            // 3. Отдаем плейлист с отсечкой от зафиксированной точки
                            item.url = host + '/stream/playlist.m3u?link=' + hash + '&m3u&fromlast';

                            if (Lampa.Noty) {
                                Lampa.Noty.show('Запуск с серии №' + (currentFileIndex + 1));
                            }
                        }
                    }
                } catch (e) {
                    console.error('Playlist Patch Error:', e);
                }

                return originalPlay.call(this, item);
            };
        }
    }

    if (window.appready || (typeof Lampa !== 'undefined' && Lampa.Player)) {
        startPlugin();
    } else {
        if (typeof Lampa !== 'undefined' && Lampa.Listener) {
            Lampa.Listener.follow('app', function (e) {
                if (e.type === 'ready') startPlugin();
            });
        } else {
            setTimeout(startPlugin, 1000);
        }
    }
})();