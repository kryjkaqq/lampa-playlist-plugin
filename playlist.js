(function () {
    'use strict';

    function init() {
        if (typeof Lampa === 'undefined' || !Lampa.Player) return;

        // Запоминаем оригинальную функцию запуска видео в Lampa
        const originalPlay = Lampa.Player.play;

        Lampa.Player.play = function (item) {
            try {
                const data = Lampa.Player.playdata();

                if (data && Array.isArray(data.playlist) && data.playlist.length > 1) {
                    // Проверяем, идет ли проигрывание через TorrServer
                    if (item && item.url && item.url.includes('link=')) {
                        const urlObj = new URL(item.url);
                        const hash = urlObj.searchParams.get('link') || urlObj.searchParams.get('hash');

                        if (hash) {
                            // Формируем прямую M3U ссылку TorrServer
                            const m3uUrl = `${urlObj.origin}/playlist.m3u?hash=${hash}`;

                            // Подменяем URL текущего элемента на весь плейлист
                            item.url = m3uUrl;

                            if (Lampa.Noty) {
                                Lampa.Noty.show('Подменен плейлист TorrServer (M3U)');
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Ошибка в плагине плейлиста:', e);
            }

            // Вызываем родной метод Lampa
            return originalPlay.call(this, item);
        };
    }

    // Запускаем после полной загрузки Lampa
    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }
})();