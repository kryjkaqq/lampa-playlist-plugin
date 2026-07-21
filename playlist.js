(function () {
    'use strict';

    function startPlugin() {
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show('M3U TorrServer (fromlast): Активен');
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
                            var title = item.title ? encodeURIComponent(item.title) : 'playlist';

                            // 1. Мгновенно регистрируем выбранную серию в TorrServer как "последнюю"
                            var pingUrl = host + '/stream/file.mkv?link=' + hash + '&index=' + fileIndex + '&play';
                            try {
                                var xhr = new XMLHttpRequest();
                                xhr.open('HEAD', pingUrl, false); // Быстрый запрос состояния
                                xhr.send();
                            } catch (e) {
                                // Игнорируем прерывание сети, главное — статус передан на сервер
                            }

                            // 2. Отдаем в PotPlayer ссылку на M3U с параметром &fromlast
                            item.url = host + '/stream/' + title + '.m3u?link=' + hash + '&m3u&fromlast';

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