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
                            var startIndex = indexMatch ? parseInt(indexMatch[1], 10) : 0;

                            // 1. Запрашиваем информацию о файлах торрента напрямую из API TorrServer
                            var xhr = new XMLHttpRequest();
                            xhr.open('POST', host + '/torrents', false); // Синхронный запрос к API
                            xhr.setRequestHeader('Content-Type', 'application/json');
                            xhr.send(JSON.stringify({ action: 'get', hash: hash }));

                            if (xhr.status === 200 && xhr.responseText) {
                                var response = JSON.parse(xhr.responseText);
                                var files = (response.file_stats || response.files || []);

                                if (files.length > 0) {
                                    var m3uLines = ['#EXTM3U'];

                                    // 2. Формируем список ссылок строго начиная с выбранного startIndex (серии)
                                    for (var i = startIndex; i < files.length; i++) {
                                        var file = files[i];
                                        var fileId = file.id !== undefined ? file.id : i;
                                        var fileName = file.path ? file.path.split('/').pop() : ('Episode ' + (fileId + 1) + '.mkv');
                                        
                                        // Формируем прямую ссылку на каждый файл, как вы предложили
                                        var fileUrl = host + '/stream/' + encodeURIComponent(fileName) + '?link=' + hash + '&index=' + fileId + '&play';

                                        m3uLines.push('#EXTINF:-1,' + fileName);
                                        m3uLines.push(fileUrl);
                                    }

                                    // 3. Преобразуем собранный плейлист в Data-URL без обрезаний
                                    var m3uContent = m3uLines.join('\n');
                                    item.url = 'data:audio/mpegurl;charset=utf-8,' + encodeURIComponent(m3uContent);

                                    if (Lampa.Noty) {
                                        Lampa.Noty.show('Сформирован плейлист: с серии №' + (startIndex + 1));
                                    }
                                }
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