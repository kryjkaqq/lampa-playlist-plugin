(function () {
    'use strict';

    function startPlugin() {
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show('M3U TorrServer: Авто-режим активен');
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

                            // Формируем M3U с указанием стартового индекса (from) и флага m3u
                            // TorrServer MatriX обрезает всё, что идёт ДО указанного index/from
                            var playlistUrl = host + '/stream/' + title + '.m3u?link=' + hash + '&from=' + fileIndex + '&index=' + fileIndex + '&m3u';

                            item.url = playlistUrl;

                            if (Lampa.Noty) {
                                Lampa.Noty.show('Плейлист: Серии ' + (fileIndex + 1) + '...');
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