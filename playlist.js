(function () {
    'use strict';

    function startPlugin() {
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show('M3U TorrServer: Активен');
        }

        if (typeof Lampa !== 'undefined' && Lampa.Player) {
            var originalPlay = Lampa.Player.play;
            var isHandling = false;

            Lampa.Player.play = function (item) {
                if (isHandling) {
                    isHandling = false;
                    return originalPlay.call(this, item);
                }

                try {
                    if (item && item.url && (item.url.indexOf('link=') !== -1 || item.url.indexOf('hash=') !== -1)) {
                        var hostMatch = item.url.match(/(https?:\/\/[^\/]+)/);
                        var hashMatch = item.url.match(/(?:link|hash)=([a-fA-F0-9]+)/);
                        var indexMatch = item.url.match(/(?:index|id|file)=([0-9]+)/);

                        if (hostMatch && hashMatch) {
                            var host = hostMatch[1];
                            var hash = hashMatch[1];
                            var currentFileIndex = indexMatch ? parseInt(indexMatch[1], 10) : 0;

                            // Точная структура запроса подсмотрена в панели TorrServer:
                            // Если 1-я серия (index 0) — сбрасываем через file_index: -1 и action: "rem"
                            // Если любая другая — ставим последней просмотренной предыдущую серию (currentFileIndex - 1)
                            var apiData = currentFileIndex === 0 
                                ? { action: "rem", hash: hash, file_index: -1 } 
                                : { hash: hash, file_index: currentFileIndex - 1 };

                            fetch(host + '/viewed', {
                                method: 'POST',
                                headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
                                body: JSON.stringify(apiData)
                            }).then(function () {
                                item.url = host + '/stream/playlist.m3u?link=' + hash + '&m3u&fromlast';
                                if (item.url) {
                                    item.url = item.url.replace(/&play(?=&|$)/g, '');
                                }

                                if (Lampa.Noty) {
                                    Lampa.Noty.show('Запуск с серии №' + (currentFileIndex + 1));
                                }

                                isHandling = true;
                                Lampa.Player.play(item);
                            }).catch(function (err) {
                                console.error('TorrServer API Error:', err);
                                item.url = host + '/stream/playlist.m3u?link=' + hash + '&m3u&fromlast';
                                isHandling = true;
                                Lampa.Player.play(item);
                            });

                            return;
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