(function () {
    'use strict';

    function startPlugin() {
        // Уведомление о готовности плагина
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show('M3U TorrServer: Готов');
        }

        // Перехватываем запуск плеера
        if (typeof Lampa !== 'undefined' && Lampa.Player) {
            var originalPlay = Lampa.Player.play;

            Lampa.Player.play = function (item) {
                try {
                    // Проверяем, что ссылка идет от TorrServer
                    if (item && item.url && (item.url.indexOf('link=') !== -1 || item.url.indexOf('hash=') !== -1)) {
                        var match = item.url.match(/(https?:\/\/[^\/]+)/);
                        var hashMatch = item.url.match(/(?:link|hash)=([a-fA-F0-9]+)/);

                        if (match && hashMatch) {
                            var host = match[1];
                            var hash = hashMatch[1];
                            
                            // Заменяем одиночную ссылку на полный M3U плейлист
                            item.url = host + '/playlist.m3u?hash=' + hash;

                            if (Lampa.Noty) {
                                Lampa.Noty.show('Передан M3U плейлист серий!');
                            }
                        }
                    }
                } catch (e) {
                    console.error('Playlist Patch Error:', e);
                }

                // Передаём обновленный объект дальше в плеер
                return originalPlay.call(this, item);
            };
        }
    }

    // Запуск
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