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

                            // 1. Управляем историей просмотров через API TorrServer
                            try {
                                var xhr = new XMLHttpRequest();
                                xhr.open('POST', host + '/viewed', false);
                                xhr.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');

                                if (currentFileIndex === 0) {
                                    xhr.send(JSON.stringify({ action: 'rem', hash: hash }));
                                } else {
                                    var targetIndex = currentFileIndex - 1;
                                    xhr.send(JSON.stringify({
                                        hash: hash,
                                        file_index: targetIndex
                                    }));
                                }
                            } catch (e) {
                                console.error('TorrServer View API Error:', e);
                            }

                            // 2. Формируем чистый URL плейлиста
                            item.url = host + '/stream/playlist.m3u?link=' + hash + '&m3u&fromlast';

                            if (Lampa.Noty) {
                                Lampa.Noty.show('Запуск с серии №' + (currentFileIndex + 1));
                            }
                        }
                    }
                } catch (e) {
                    console.error('Playlist Patch Error:', e);
                }

                // Безопасно вырезаем только точный хвост &play, не портя другие параметры
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