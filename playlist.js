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
                        // Находим номер выбранного файла в ссылке Lampa
                        var indexMatch = item.url.match(/(?:index|id|file)=([0-9]+)/);

                        if (hostMatch && hashMatch) {
                            var host = hostMatch[1];
                            var hash = hashMatch[1];
                            var title = item.title ? encodeURIComponent(item.title) : 'playlist';

                            // Базовый адрес генерации M3U
                            var playlistUrl = host + '/stream/' + title + '.m3u?link=' + hash + '&m3u';

                            if (indexMatch) {
                                var fileIndex = parseInt(indexMatch[1], 10);
                                
                                // Параметр from отсекает все файлы ДО выбранного индекса
                                playlistUrl += '&from=' + fileIndex;

                                if (Lampa.Noty) {
                                    Lampa.Noty.show('Плейлист сформирован начиная с серии №' + (fileIndex + 1));
                                }
                            }

                            item.url = playlistUrl;
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