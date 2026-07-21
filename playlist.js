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
                            var targetIndex = indexMatch ? parseInt(indexMatch[1], 10) : 0;

                            // Запрашиваем структуру плейлиста у TorrServer
                            var rawM3uUrl = host + '/stream/playlist.m3u?link=' + hash + '&m3u';

                            var xhr = new XMLHttpRequest();
                            xhr.open('GET', rawM3uUrl, false);
                            xhr.send();

                            if (xhr.status === 200 && xhr.responseText) {
                                var lines = xhr.responseText.split('\n');
                                var filteredLines = ['#EXTM3U'];
                                var currentIndex = 0;
                                var include = false;

                                for (var i = 0; i < lines.length; i++) {
                                    var line = lines[i].trim();

                                    if (line.indexOf('#EXTINF:') === 0) {
                                        include = (currentIndex >= targetIndex);
                                        currentIndex++;
                                    }

                                    if (include && line !== '#EXTM3U' && line.length > 0) {
                                        filteredLines.push(line);
                                    }
                                }

                                var modifiedM3u = filteredLines.join('\n');

                                // Скачиваем файл локально браузером и отдаем созданный URL
                                var blob = new Blob([modifiedM3u], { type: 'application/x-mpegurl' });
                                var fileUrl = URL.createObjectURL(blob);

                                // Для Windows/PotPlayer передаем дата-стрим или временную ссылку
                                item.url = host + '/stream/playlist.m3u?link=' + hash + '&m3u&from=' + targetIndex;
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