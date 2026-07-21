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

                            // Если выбираем 1-ю серию (индекс 0), сдвиг не нужен.
                            // Для остальных серий отмечаем предыдущую, чтобы fromlast выдал список НАЧИНАЯ с текущей.
                            var targetIndex = currentFileIndex > 0 ? (currentFileIndex - 1) : 0;

                            // 1. Фиксируем предыдущую серию в TorrServer
                            var pingUrl = host + '/stream/file.mkv?link=' + hash + '&index=' + targetIndex;
                            
                            try {
                                var xhr = new XMLHttpRequest();
                                xhr.open('GET', pingUrl, false);
                                xhr.send();
                            } catch (e) {
                                // Игнорируем разрыв
                            }

                            // 2. Используем СТРОГО латинское имя файла "playlist.m3u"
                            // Это на 100% убирает ошибку двойного кодирования (%25D0) в PotPlayer
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