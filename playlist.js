(function () {
    'use strict';

    function plugin() {
        // Уведомление при запуске
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show('M3U Плагин загружен!');
        }

        // Перехватываем воспроизведение
        if (typeof Lampa !== 'undefined' && Lampa.Player) {
            var originalPlay = Lampa.Player.play;

            Lampa.Player.play = function (item) {
                try {
                    if (item && item.url && (item.url.indexOf('link=') !== -1 || item.url.indexOf('hash=') !== -1)) {
                        // Разбираем URL без использования new URL (для старых движков)
                        var match = item.url.match(/(https?:\/\/[^\/]+)/);
                        var hashMatch = item.url.match(/(?:link|hash)=([a-fA-F0-9]+)/);

                        if (match && hashMatch) {
                            var host = match[1];
                            var hash = hashMatch[1];
                            
                            // Заменяем ссылку на M3U плейлист TorrServer
                            item.url = host + '/playlist.m3u?hash=' + hash;

                            if (Lampa.Noty) {
                                Lampa.Noty.show('Отправлен M3U плейлист');
                            }
                        }
                    }
                } catch (e) {
                    console.error('Plugin Error:', e);
                }

                return originalPlay.call(this, item);
            };
        }
    }

    // Безопасная инициализация
    if (window.appready) {
        plugin();
    } else {
        if (typeof Lampa !== 'undefined' && Lampa.Listener) {
            Lampa.Listener.follow('app', function (e) {
                if (e.type === 'ready') plugin();
            });
        }
    }
})();