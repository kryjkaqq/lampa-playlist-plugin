(function () {
    'use strict';

    var VLC_PORT = 3999;
    var VLC_PASSWORD = '123456';
    var POLL_INTERVAL = 5000;
    var pollTimer = null;

    function isVlc(path) {
        return typeof path === 'string' && path.toLowerCase().indexOf('vlc') !== -1;
    }

    function getSeasonNumber() {
        try {
            var act = Lampa.Activity.active();
            if (act && act.activity && act.activity.season && act.activity.season.number) {
                return act.activity.season.number;
            }
        } catch (e) {}
        return 1;
    }

    function getCard() {
        try {
            var act = Lampa.Activity.active();
            return (act && act.activity && act.activity.card) ? act.activity.card : null;
        } catch (e) {
            return null;
        }
    }

    function episodeHash(card, season, episode) {
        try {
            return Lampa.Utils.hash([season, season > 10 ? ':' : '', episode, card.original_name || card.original_title].join(''));
        } catch (e) {
            return null;
        }
    }

    // Сохраняет прогресс серии прямо в историю просмотра Lampa
    function markEpisode(card, season, episode, percent, time, duration) {
        if (!card) return;
        var hash = episodeHash(card, season, episode);
        if (!hash) return;

        try {
            Lampa.Timeline.update({
                hash: hash,
                percent: Math.max(0, Math.min(100, Math.round(percent))),
                time: time || 0,
                duration: duration || 0
            });
        } catch (e) {
            console.error('[playlist-plugin] Timeline.update error', e);
        }
    }

    function pushTorrServerTimecode(host, hash, fileIndex, timecode) {
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', host + '/viewed', false);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(JSON.stringify({
                action: 'set',
                hash: hash,
                file_index: fileIndex,
                timecode: timecode
            }));
        } catch (e) {
            console.error('[playlist-plugin] TorrServer timecode push error', e);
        }
    }

    function stopVlcTracking() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    // Полноценное отслеживание для VLC через встроенный HTTP-интерфейс
    function startVlcTracking(host, hash, playlist, startIndex) {
        stopVlcTracking();

        var card = getCard();
        var season = getSeasonNumber();

        pollTimer = setInterval(function () {
            var headers = new Headers();
            headers.append('Authorization', 'Basic ' + btoa(':' + VLC_PASSWORD));

            fetch('http://localhost:' + VLC_PORT + '/requests/status.json', { headers: headers })
                .then(function (r) { return r.json(); })
                .then(function (status) {
                    if (!status || !status.time || !status.length) return;

                    var currentTime = status.time;
                    var duration = status.length;
                    var percent = Math.round((currentTime / duration) * 100);

                    // Пытаемся понять, какой именно файл сейчас играет,
                    // сопоставляя имя файла из VLC с адресами в плейлисте
                    var playingName = '';
                    try {
                        playingName = status.information.category.meta.filename || '';
                    } catch (e) {}

                    var activeIndex = startIndex;

                    if (playingName && playlist && playlist.length) {
                        for (var i = 0; i < playlist.length; i++) {
                            if (playlist[i].url && decodeURIComponent(playlist[i].url).indexOf(playingName) !== -1) {
                                activeIndex = i;
                                break;
                            }
                        }
                    }

                    var episodeNum = activeIndex + 1;

                    markEpisode(card, season, episodeNum, percent, currentTime, duration);
                    pushTorrServerTimecode(host, hash, activeIndex, currentTime);
                })
                .catch(function (e) {
                    console.error('[playlist-plugin] VLC poll error', e);
                    stopVlcTracking();
                });
        }, POLL_INTERVAL);
    }

    function startPlugin() {
        if (typeof Lampa === 'undefined' || !Lampa.Player) return;

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

                        var playerPath = (Lampa.Storage.field('player_nw_path') || '');
                        var vlc = isVlc(playerPath);

                        try {
                            // 1. Получаем текущий список просмотренных индексов для этого hash
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

                            // 2. Для НЕ-VLC плееров (нет доступа к живому таймкоду) —
                            //    считаем все более ранние серии просмотренными полностью,
                            //    раз ты уже переключился дальше
                            if (!vlc) {
                                var card0 = getCard();
                                var season0 = getSeasonNumber();

                                existing.forEach(function (v) {
                                    if (v.file_index < currentFileIndex) {
                                        markEpisode(card0, season0, v.file_index + 1, 100, 0, 0);
                                    }
                                });
                            }

                            // 3. Удаляем каждый найденный индекс по отдельности
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

                            // Помечаем текущую серию как "начатую" сразу — чтобы не забыть,
                            // на чём остановился, даже если дальше ничего не отследится
                            if (!vlc) {
                                markEpisode(getCard(), getSeasonNumber(), currentFileIndex + 1, 1, 0, 0);
                            }

                            if (vlc) {
                                var playlistData = null;
                                try {
                                    var pd = Lampa.Player.playdata();
                                    if (pd && pd.playlist) playlistData = pd.playlist;
                                } catch (e) {}

                                setTimeout(function () {
                                    startVlcTracking(host, hash, playlistData, currentFileIndex);
                                }, POLL_INTERVAL);
                            }
                        } catch (err) {
                            console.error('TorrServer API Sync Error:', err);
                        }

                        if (Lampa.Noty) {
                            Lampa.Noty.show(
                                'Запуск с серии №' + (currentFileIndex + 1) +
                                (vlc ? ' · слежение за таймкодом включено' : ' · без точного таймкода (не VLC)')
                            );
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