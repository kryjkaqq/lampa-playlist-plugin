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

                        if (hostMatch && hashMatch && indexMatch) {
                            var host = hostMatch[1];
                            var hash = hashMatch[1];
                            var targetIndex = parseInt(indexMatch[1], 10); // Номер серии (0-based)

                            // Запрашиваем полный M3U у TorrServer
                            var rawM3uUrl = host + '/stream/playlist.m3u?link=' + hash + '&m3u';

                            var xhr = new XMLHttpRequest();
                            xhr.open('GET', rawM3uUrl, false); // Синхронный запрос для быстрой подмены
                            xhr.send();

                            if (xhr.status === 200 && xhr.responseText) {
                                var lines = xhr.responseText.split('\n');
                                var newLines = ['#EXTM3U'];
                                var currentIndex = 0;
                                var keep = false;

                                // Разбираем M3U по блокам #EXTINF
                                for (var i = 0; i < lines.length; i++) {
                                    var line = lines[i].trim();
                                    if (line.indexOf('#EXTINF:') === 0) {
                                        keep = (currentIndex >= targetIndex);
                                        currentIndex++;
                                    }
                                    if (keep && line !== '#EXTM3U') {
                                        newLines.push(line);
                                    }
                                }

                                // Формируем Data-URL плейлиста без первых серий
                                var modifiedM3u = newLines.join('\n');
                                item.url = 'data:audio/x-mpegurl;charset=utf-8;base64,' + btoa(unescape(encodeURIComponent(modifiedM3u)));

                                if (Lampa.Noty) {
                                    Lampa.Noty.show('Запуск с серии №' + (targetIndex + 1));
                                }
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