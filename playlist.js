(function () {
    'use strict';

    function showVisualBanner(text) {
        try {
            // Создаём яркую плашку поверх всего интерфейса Lampa
            var div = document.createElement('div');
            div.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#ff0055;color:#fff;padding:15px 25px;font-size:18px;z-index:999999;border-radius:8px;box-shadow:0 0 15px rgba(0,0,0,0.8);font-weight:bold;font-family:sans-serif;';
            div.innerText = text;
            document.body.appendChild(div);

            setTimeout(function() {
                if (div && div.parentNode) div.parentNode.removeChild(div);
            }, 5000);
        } catch(e) {}
    }

    function startPlugin() {
        // 1. Визуальный баннер в DOM
        showVisualBanner('M3U TorrServer: Плагин загружен!');

        // 2. Стандартное уведомление Lampa
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show('M3U TorrServer: Активен');
        }

        // 3. Перехват плеера
        if (typeof Lampa !== 'undefined' && Lampa.Player) {
            var originalPlay = Lampa.Player.play;

            Lampa.Player.play = function (item) {
                try {
                    if (item && item.url && (item.url.indexOf('link=') !== -1 || item.url.indexOf('hash=') !== -1)) {
                        var match = item.url.match(/(https?:\/\/[^\/]+)/);
                        var hashMatch = item.url.match(/(?:link|hash)=([a-fA-F0-9]+)/);

                        if (match && hashMatch) {
                            var host = match[1];
                            var hash = hashMatch[1];
                            
                            // Формируем M3U плейлист
                            item.url = host + '/playlist.m3u?hash=' + hash;

                            if (Lampa.Noty) {
                                Lampa.Noty.show('M3U плейлист отправлен в плеер');
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

    // Инициализация при любом состоянии готовности
    if (window.appready || (typeof Lampa !== 'undefined' && Lampa.Player)) {
        startPlugin();
    } else {
        if (typeof Lampa !== 'undefined' && Lampa.Listener) {
            Lampa.Listener.follow('app', function (e) {
                if (e.type === 'ready') startPlugin();
            });
        } else {
            // Если Listener недоступен, пробуем запустить через 2 секунды
            setTimeout(startPlugin, 2000);
        }
    }
})();