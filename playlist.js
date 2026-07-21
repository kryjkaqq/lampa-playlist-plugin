(function () {
    'use strict';

    function startPlugin() {
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

                            try {
                                var existing = [];
                                try {
                                    var xhrList = new XMLHttpRequest();
                                    xhrList.open('POST', host + '/viewed', false);
                                    xhrList.setRequestHeader('Content-Type', 'application/json');
                                    xhrList.send(JSON.stringify({ action: 'list', hash: hash }));

                                    if (xhrList.status === 200 && xhrList.responseText) {
                                        existing = JSON.parse(xhrList.responseText) || [];
                                    }
                                } catch (e) {
                                    console.error('TorrServer viewed list error:', e);
                                }
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
                                    } catch (e) {
                                        console.error('TorrServer viewed rem error:', e);
                                    }
                                });

                                if (currentFileIndex === 0) {
                                    item.url = host + '/stream/playlist.m3u?link=' + hash + '&m3u';
                                } else {
                                    var targetIndex = currentFileIndex;

                                    var xhrSet = new XMLHttpRequest();
                                    xhrSet.open('POST', host + '/viewed', false);
                                    xhrSet.setRequestHeader('Content-Type', 'application/json');
                                    xhrSet.send(JSON.stringify({
                                        action: 'set',
                                        hash: hash,
                                        file_index: targetIndex
                                    }));

                                    item.url = host + '/stream/playlist.m3u?link=' + hash + '&m3u&fromlast';
                                }
                            } catch (err) {
                                console.error('TorrServer API Sync Error:', err);
                            }

                        }
                    }
                } catch (e) {
                    console.error('Playlist Patch Error:', e);
                }
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