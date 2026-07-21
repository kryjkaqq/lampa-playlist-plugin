(function () {
    'use strict';

    function startPlugin() {
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show('M3U TorrServer: Активен');
        }

        if (typeof Lampa !== 'undefined' && Lampa.Player) {
            var originalPlay = Lampa.Player.play;
            var isHandling = false;

            Lampa.Player.play = function (item) {
                if (isHandling) {
                    return originalPlay.call(this, item);
                }

                try {
                    if (item && item.url && (item.url.indexOf('link=') !== -1 || item.url.indexOf('hash=') !== -1)) {
                        var hostMatch = item.url.match(/(https?:\/\/[^\/]+)/);
                        var hashMatch = item.url.match(/(?:link|hash)=([a-fA-F0-9]+)/);
                        var indexMatch = item.url.match(/(?:index|id|file)=([0-9]+)/);

                        if (hostMatch && hashMatch) {
                            var host = hostMatch[1];
                            var hash = hashMatch[1];
                            var currentFileIndex = indexMatch ? parseInt(indexMatch[1], 10) : 0;

                            // Точная структура запроса из логов TorrServer
                            var apiData = {
                                action: "rem",
                                hash: hash,
                                file_index: currentFileIndex === 0 ? -1 : (currentFileIndex - 1)
                            };

                            fetch(host + '/viewed', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(apiData)
                            }).then(function () {
                                executePlay();
                            }).catch(function () {
                                executePlay();
                            });

                            function executePlay() {
                                var cleanUrl = host + '/stream/playlist.m3u?link=' + hash + '&m3u&fromlast';

                                var internalUrl = cleanUrl;
                                Object.defineProperty(item, 'url', {
                                    get: function () {
                                        return internalUrl;
                                    },
                                    set: function (val) {
                                        internalUrl = val ? val.replace(/&play(?=&|$)/g, '') : val;
                                    },
                                    configurable: true
                                });

                                if (Lampa.Noty) {
                                    Lampa.Noty.show('Запуск с серии №' + (currentFileIndex + 1));
                                }

                                isHandling = true;
                                originalPlay.call(Lampa.Player, item);
                                isHandling = false;
                            }

                            return;
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