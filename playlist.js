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

                            var debugLines = [];
                            debugLines.push('idx=' + currentFileIndex);

                            try {
                                // 1. Получаем текущий список просмотренных индексов для этого hash
                                var existing = [];
                                try {
                                    var xhrList = new XMLHttpRequest();
                                    xhrList.open('POST', host + '/viewed', false);
                                    xhrList.setRequestHeader('Content-Type', 'application/json');
                                    xhrList.send(JSON.stringify({ action: 'list', hash: hash }));

                                    debugLines.push('list:' + xhrList.status + ' ' + (xhrList.responseText || '').substring(0, 120));

                                    if (xhrList.status === 200 && xhrList.responseText) {
                                        existing = JSON.parse(xhrList.responseText) || [];
                                    }
                                } catch (e) {
                                    debugLines.push('list-err:' + e.message);
                                }

                                // 2. Удаляем КАЖДЫЙ найденный индекс по отдельности
                                //    (rem работает только точечно, массового сброса нет)
                                existing.forEach(function (v) {
                                    try {
                                        var xhrRem = new XMLHttpRequest();
                                        xhrRem.open('POST', host + '/viewed', false);
                                        xhrRem.setRequestHeader('Content-Type', 'application/json');
                                        xhrRem.send(JSON.stringify({
                                            action: 'rem',
                                            hash: hash,
                                            file_index: v.file_index
                                        }));
                                        debugLines.push('rem ' + v.file_index + ':' + xhrRem.status);
                                    } catch (e) {
                                        debugLines.push('rem-err:' + e.message);
                                    }
                                });

                                if (currentFileIndex === 0) {
                                    // Для 1-й серии просто отдаём полный плейлист
                                    item.url = host + '/stream/playlist.m3u?link=' + hash + '&m3u';
                                } else {
                                    // ВАЖНО: fromlast стартует С ТОГО ЖЕ индекса, что помечен viewed
                                    // (searchLastPlayed возвращает позицию файла с этим Id, i >= from
                                    // включает его самого) — сдвиг "-1" тут не нужен.
                                    var targetIndex = currentFileIndex;

                                    var xhrSet = new XMLHttpRequest();
                                    xhrSet.open('POST', host + '/viewed', false);
                                    xhrSet.setRequestHeader('Content-Type', 'application/json');
                                    xhrSet.send(JSON.stringify({
                                        action: 'set',
                                        hash: hash,
                                        file_index: targetIndex
                                    }));

                                    debugLines.push('set ' + targetIndex + ':' + xhrSet.status);

                                    item.url = host + '/stream/playlist.m3u?link=' + hash + '&m3u&fromlast';
                                }
                            } catch (err) {
                                debugLines.push('fatal-err:' + err.message);
                            }

                            if (Lampa.Noty) {
                                Lampa.Noty.show(debugLines.join(' | '));
                            }

                            if (Lampa.Noty) {
                                Lampa.Noty.show('Запуск с серии №' + (currentFileIndex + 1));
                            }
                        }
                    }
                } catch (e) {
                    console.error('Playlist Patch Error:', e);
                }

                // Гарантированно вырезаем хвостик &play, если Лампа попытается его добавить
                if (item && item.url) {
                    item.url = item.url.replace(/&play(?=&|$)/g, '');
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