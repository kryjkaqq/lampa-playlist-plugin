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

                            // 1. Отправляем в TorrServer явную установку текущего файла для проигрывания
                            try {
                                var setXhr = new XMLHttpRequest();
                                setXhr.open('POST', host + '/torrents', false);
                                setXhr.setRequestHeader('Content-Type', 'application/json');
                                setXhr.send(JSON.stringify({
                                    action: 'set_file',
                                    hash: hash,
                                    file_index: currentFileIndex
                                }));
                            } catch (e) {}

                            // 2. Также делаем сброс просмотра через удаление торрента из списка просмотренного (viewed)
                            try {
                                var remXhr = new XMLHttpRequest();
                                remXhr.open('POST', host + '/viewed', false);
                                remXhr.setRequestHeader('Content-Type', 'application/json');
                                remXhr.send(JSON.stringify({ action: 'rem', hash: hash }));
                            } catch (e) {}

                            // 3. Формируем плейлист с явным указанием индекса начала: &index=N
                            item.url = host + '/stream/playlist.m3u?link=' + hash + '&index=' + currentFileIndex + '&m3u';

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