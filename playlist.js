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
                            var fileIndex = indexMatch ? parseInt(indexMatch[1], 10) : 0;

                            // 1. Делаем быстрый запрос к TorrServer, фиксируя ТЕКУЩИЙ index как просматриваемый
                            var pingUrl = host + '/stream/file.mkv?link=' + hash + '&index=' + fileIndex;
                            
                            try {
                                var xhr = new XMLHttpRequest();
                                xhr.open('GET', pingUrl, false); // Синхронный короткий пинг
                                xhr.send();
                            } catch (e) {
                                // Игнорируем разрыв соединения
                            }

                            // 2. Формируем валидный короткий URL без двойного encodeURIComponent
                            var cleanTitle = 'playlist';
                            if (item.title) {
                                try {
                                    // Проверяем, не закодирована ли строка уже
                                    cleanTitle = encodeURIComponent(decodeURIComponent(item.title));
                                } catch (e) {
                                    cleanTitle = encodeURIComponent(item.title);
                                }
                            }

                            // 3. Отдаем плейлист с &fromlast
                            item.url = host + '/stream/' + cleanTitle + '.m3u?link=' + hash + '&m3u&fromlast';

                            if (Lampa.Noty) {
                                Lampa.Noty.show('Запуск с серии №' + (fileIndex + 1));
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