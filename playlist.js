(function () {
    'use strict';

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

                            // Синхронный запрос гарантирует обновление истории в TorrServer мгновенно
                            try {
                                var xhr = new XMLHttpRequest();
                                xhr.open('POST', host + '/viewed', false);
                                xhr.setRequestHeader('Content-Type', 'application/json');

                                if (currentFileIndex === 0) {
                                    // Для 1-й серии полностью сбрасываем историю
                                    xhr.send(JSON.stringify({ action: "rem", hash: hash, file_index: -1 }));
                                    item.url = host + '/stream/playlist.m3u?link=' + hash + '&m3u';
                                } else {
                                    // Для остальных серий ставим метку на предыдущую серию
                                    var targetIndex = currentFileIndex - 1;
                                    xhr.send(JSON.stringify({ hash: hash, file_index: targetIndex }));
                                    item.url = host + '/stream/playlist.m3u?link=' + hash + '&m3u&fromlast';
                                }
                            } catch (err) {
                                console.error('TorrServer API Sync Error:', err);
                            }

                            if (Lampa.Noty) {
                                Lampa.Noty.show('Запуск с серии №' + (currentFileIndex + 1));
                            }
                        }
                    }
                } catch (e) {
                    console.error('Playlist Patch Error:', e);
                }

                // Гарантированно вырезаем хвостик &play, если Лампы попытается его добавить
                if (item && item.url) {
                    item.url = item.url.replace(/&play(?=&|$)/g, '');
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