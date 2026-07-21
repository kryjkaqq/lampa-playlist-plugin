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

                            // 1. Полностью сбрасываем историю просмотров (View States) для этого торрента
                            try {
                                var resetXhr = new XMLHttpRequest();
                                resetXhr.open('POST', host + '/viewed', false);
                                resetXhr.setRequestHeader('Content-Type', 'application/json');
                                resetXhr.send(JSON.stringify({ action: 'rem', hash: hash }));
                            } catch (e) {
                                // Игнорируем ошибки сети
                            }

                            // 2. Если выбрана серия > 1 (индекс > 0), отмечаем предыдущую, 
                            // чтобы fromlast отдал плейлист НАЧИНАЯ с выбранной серии.
                            if (currentFileIndex > 0) {
                                var targetIndex = currentFileIndex - 1;
                                var pingUrl = host + '/stream/file.mkv?link=' + hash + '&index=' + targetIndex;
                                try {
                                    var pingXhr = new XMLHttpRequest();
                                    pingXhr.open('GET', pingUrl, false);
                                    pingXhr.send();
                                } catch (e) {}
                            }

                            // 3. Отдаем чистый URL плейлиста
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