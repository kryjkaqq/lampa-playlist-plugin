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
                        // Извлекаем id/index выбранного файла (серии)
                        var indexMatch = item.url.match(/(?:index|id|file)=([0-9]+)/);

                        if (hostMatch && hashMatch) {
                            var host = hostMatch[1];
                            var hash = hashMatch[1];
                            var title = item.title ? encodeURIComponent(item.title) : 'playlist';
                            var fileIndex = indexMatch ? indexMatch[1] : null;

                            // Формируем ссылку на плейлист
                            var playlistUrl = host + '/stream/' + title + '.m3u?link=' + hash + '&m3u';

                            // Если передана конкретная серия — добавляем указатель на неё
                            if (fileIndex !== null) {
                                playlistUrl += '&index=' + fileIndex + '&play=' + fileIndex;
                            }

                            item.url = playlistUrl;

                            if (Lampa.Noty) {
                                Lampa.Noty.show('M3U: Запуск с выбранной серии');
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