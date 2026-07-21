(function () {
    'use strict';

    function init() {
        if (window.torrserver_playlist_plugin) return;
        window.torrserver_playlist_plugin = true;

        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show('Плагин M3U TorrServer подключен');
        }

        // Перехватываем метод проигрывания
        if (Lampa.Player && typeof Lampa.Player.play === 'function') {
            const originalPlay = Lampa.Player.play;

            Lampa.Player.play = function (item) {
                try {
                    // Если у воспроизводимого объекта есть URL и он от TorrServer
                    if (item && item.url && (item.url.includes('link=') || item.url.includes('hash='))) {
                        const urlObj = new URL(item.url);
                        const hash = urlObj.searchParams.get('link') || urlObj.searchParams.get('hash');

                        if (hash) {
                            // Формируем M3U-ссылку со всеми сериями
                            const m3uUrl = urlObj.origin + '/playlist.m3u?hash=' + hash;

                            // Подменяем ссылку
                            item.url = m3uUrl;

                            if (Lampa.Noty) {
                                Lampa.Noty.show('Плейлист TorrServer (M3U) отправлен в плеер');
                            }
                        }
                    }
                } catch (e) {
                    console.error('TorrServer Playlist Error:', e);
                }

                return originalPlay.call(this, item);
            };
        }
    }

    // Инициализация как в вашем рабочем примере
    if (window.appready) {
        init();
    } else {
        if (typeof Lampa !== 'undefined' && Lampa.Listener) {
            Lampa.Listener.follow('app', function (e) {
                if (e.type === 'ready') init();
            });
        }
    }
})();