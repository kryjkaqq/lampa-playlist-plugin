(function () {
    'use strict';

    function startPlugin() {
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show('M3U TorrServer (API): Активен');
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

                            // 1. Сбрасываем старую историю просмотров через чистый API
                            try {
                                var resetXhr = new XMLHttpRequest();
                                resetXhr.open('POST', host + '/viewed', false);
                                resetXhr.setRequestHeader('Content-Type', 'application/json');
                                resetXhr.send(JSON.stringify({ action: 'rem', hash: hash }));
                            } catch (e) {}

                            // 2. Если серия > 1, метку "просмотрено" ставим через API без загрузки файла (без &play и без stream)
                            if (currentFileIndex > 0) {
                                var targetIndex = currentFileIndex - 1;
                                try {
                                    var setXhr = new XMLHttpRequest();
                                    setXhr.open('POST', host + '/viewed', false);
                                    setXhr.setRequestHeader('Content-Type', 'application/json');
                                    setXhr.send(JSON.stringify({
                                        action: 'set',
                                        hash: hash,
                                        file_index: targetIndex
                                    }));
                                } catch (e) {}
                            }

                            // 3. Передаем чистую ссылку на плейлист БЕЗ флага &play на конце!
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