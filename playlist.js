(function () {
    'use strict';

    var lastPlayItem = null;
    var VLC_PORT = 3999;
    var VLC_PASSWORD = '123456';
    var FINISH_THRESHOLD_PERCENT = 92; // если досмотрел хотя бы досюда - считаем законченным

    function isVlc(path) {
        return typeof path === 'string' && path.toLowerCase().indexOf('vlc') !== -1;
    }

    function isMpv(path) {
        return typeof path === 'string' && path.toLowerCase().indexOf('mpv') !== -1;
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

    function getCard(item) {
        try {
            if (item && item.card) return item.card;
        } catch (e) {}
        try {
            var act = Lampa.Activity.active();
            if (act && act.movie) return act.movie;
            if (act && act.card) return act.card;
        } catch (e) {}
        return null;
    }

    function episodeHash(card, season, episode) {
        try {
            return Lampa.Utils.hash([season, season > 10 ? ':' : '', episode, card.original_name || card.original_title].join(''));
        } catch (e) {
            return null;
        }
    }

    // Сырой index=N из TorrServer -> реальная позиция серии в собственном
    // списке серий Lampa (0-based). Сырой index может быть сдвинут посторонними
    // файлами в раздаче (обложки, nfo и т.п.), поэтому напрямую его использовать нельзя.
    function buildIndexToEpisodeMap(item) {
        var map = {};
        try {
            if (item && Array.isArray(item.playlist)) {
                item.playlist.forEach(function (p, pos) {
                    var m = (p.url || '').match(/[?&]index=([0-9]+)/);
                    if (m) map[parseInt(m[1], 10)] = pos;
                });
            }
        } catch (e) {}
        return map;
    }

    function computeEpisodeNum(item, url, debug) {
        var indexMatch = (url || '').match(/[?&]index=([0-9]+)/);
        var rawIndex = indexMatch ? parseInt(indexMatch[1], 10) : 0;
        var map = buildIndexToEpisodeMap(item);
        var mapSize = Object.keys(map).length;
        var pos = map.hasOwnProperty(rawIndex) ? map[rawIndex] : rawIndex;

        if (debug && Lampa.Noty) {
            Lampa.Noty.show(
                'DEBUG raw=' + rawIndex +
                ' playlist.len=' + (item && Array.isArray(item.playlist) ? item.playlist.length : 'NO_PLAYLIST') +
                ' map.size=' + mapSize +
                ' inMap=' + map.hasOwnProperty(rawIndex) +
                ' pos=' + pos +
                ' ep=' + (pos + 1)
            );
        }

        return pos + 1;
    }

    function updateTimeline(item, url, percent, time, duration) {
        try {
            var card = getCard(item);
            var season = getSeasonNumber();
            var episodeNum = computeEpisodeNum(item, url, true);

            var hash = episodeHash(card, season, episodeNum);
            if (!hash) return;

            Lampa.Timeline.update({
                hash: hash,
                percent: Math.max(0, Math.min(100, Math.round(percent))),
                time: time || 0,
                duration: duration || 0
            });
        } catch (e) {
            console.error('[playlist-plugin] updateTimeline error', e);
        }
    }

    function extractUrl(args) {
        if (!Array.isArray(args)) return '';
        for (var i = 0; i < args.length; i++) {
            if (typeof args[i] === 'string' && args[i].indexOf('http') === 0) return args[i];
        }
        return args.length ? args[args.length - 1] : '';
    }

    function tryNext() {
        try {
            if (Lampa.PlayerPlaylist.canNext()) {
                Lampa.PlayerPlaylist.next();
            }
        } catch (e) {
            console.error('[playlist-plugin] PlayerPlaylist.next error', e);
        }
    }

    // ---------- VLC: слежение через встроенный HTTP-интерфейс ----------

    function watchVlc(item, url, onClose) {
        var lastKnownPercent = 0;

        var poll = setInterval(function () {
            var headers = new Headers();
            headers.append('Authorization', 'Basic ' + btoa(':' + VLC_PASSWORD));

            fetch('http://localhost:' + VLC_PORT + '/requests/status.json', { headers: headers })
                .then(function (r) { return r.json(); })
                .then(function (status) {
                    if (status && status.time && status.length) {
                        lastKnownPercent = Math.round((status.time / status.length) * 100);
                    }
                })
                .catch(function () {});
        }, 4000);

        onClose(function () {
            clearInterval(poll);
            return lastKnownPercent;
        });
    }

    // ---------- MPV: слежение через JSON IPC (именованный пайп) ----------

    function patchArgsForMpv(args) {
        var pipeName = '\\\\.\\pipe\\lampa-mpv-' + Date.now();
        var newArgs = ['--input-ipc-server=' + pipeName].concat(args || []);
        return { args: newArgs, pipeName: pipeName };
    }

    function watchMpv(pipeName, item, url, onClose) {
        var net = require('net');
        var lastKnownPercent = 0;
        var socket = null;
        var poll = null;
        var buffer = '';

        var TIME_REQ_ID = 1001;
        var DUR_REQ_ID = 1002;
        var timePos = null;
        var duration = null;

        function updatePercent() {
            if (timePos !== null && duration !== null && duration > 0) {
                lastKnownPercent = Math.round((timePos / duration) * 100);
            }
        }

        function requestProp(name, id) {
            if (!socket || socket.destroyed) return;
            try {
                socket.write(JSON.stringify({ command: ['get_property', name], request_id: id }) + '\n');
            } catch (e) {}
        }

        function tryConnect(attemptsLeft) {
            if (attemptsLeft <= 0) return;

            socket = net.connect(pipeName, function () {
                poll = setInterval(function () {
                    requestProp('time-pos', TIME_REQ_ID);
                    requestProp('duration', DUR_REQ_ID);
                }, 4000);
            });

            socket.on('data', function (chunk) {
                buffer += chunk.toString();
                var lines = buffer.split('\n');
                buffer = lines.pop();

                lines.forEach(function (line) {
                    if (!line.trim()) return;
                    try {
                        var msg = JSON.parse(line);
                        if (msg && msg.request_id === TIME_REQ_ID && typeof msg.data === 'number') {
                            timePos = msg.data;
                            updatePercent();
                        }
                        if (msg && msg.request_id === DUR_REQ_ID && typeof msg.data === 'number') {
                            duration = msg.data;
                            updatePercent();
                        }
                    } catch (e) {}
                });
            });

            socket.on('error', function () {
                try { socket.destroy(); } catch (e) {}
                setTimeout(function () { tryConnect(attemptsLeft - 1); }, 700);
            });
        }

        tryConnect(6);

        onClose(function () {
            if (poll) clearInterval(poll);
            if (socket) { try { socket.destroy(); } catch (e) {} }
            return lastKnownPercent;
        });
    }

    function startPlugin() {
        if (typeof require === 'undefined') {
            console.warn('[playlist-plugin] нет доступа к require, автопереход недоступен');
            return;
        }
        if (typeof Lampa === 'undefined' || !Lampa.Player || !Lampa.PlayerPlaylist) return;

        var originalPlay = Lampa.Player.play;
        Lampa.Player.play = function (item) {
            lastPlayItem = item;

            try {
                if (item && item.url) {
                    computeEpisodeNum(item, item.url, true);

                    if (Lampa.Noty) {
                        var tlKeys = item.timeline ? Object.keys(item.timeline).join(',') : 'NO_TIMELINE';
                        var tlVal = item.timeline ? JSON.stringify(item.timeline).substring(0, 200) : 'NULL';
                        Lampa.Noty.show(
                            'season=' + item.season + ' episode=' + item.episode +
                            ' | timeline keys=' + tlKeys +
                            ' | timeline=' + tlVal
                        );
                    }
                }
            } catch (e) {}

            return originalPlay.call(this, item);
        };

        try {
            var cp = require('child_process');

            if (cp.spawn.__lampaPlaylistPatched) {
                // Уже пропатчено этим же плагином раньше в этой сессии —
                // не патчим повторно, иначе close-обработчик задвоится
                return;
            }

            var origSpawn = cp.spawn;

            cp.spawn = function (path, args, options) {
                var vlc = isVlc(path);
                var mpv = isMpv(path);
                var itemAtLaunch = lastPlayItem;
                var url = extractUrl(args);

                var finalArgs = args;
                var mpvPipe = null;

                if (vlc && Array.isArray(finalArgs)) {
                    // Фикс бага самой Lampa: она передаёт --start-time в VLC,
                    // домножив секунды на 1000 (как будто это миллисекунды),
                    // из-за чего VLC получает время далеко за пределами видео
                    // и просто стартует с начала. Правим на лету.
                    finalArgs = finalArgs.map(function (a) {
                        if (typeof a === 'string' && a.indexOf('--start-time=') === 0) {
                            var ms = parseInt(a.split('=')[1], 10) || 0;
                            return '--start-time=' + Math.floor(ms / 1000);
                        }
                        return a;
                    });
                }

                if (mpv) {
                    var patched = patchArgsForMpv(finalArgs);
                    finalArgs = patched.args;
                    mpvPipe = patched.pipeName;
                }

                var child = origSpawn.call(this, path, finalArgs, options);

                if (!vlc && !mpv) {
                    // Плеер без API (PotPlayer и т.п.) — реального таймкода
                    // не знаем, ничего не отслеживаем и не переключаем
                    return child;
                }

                var getPercentOnClose = null;

                function onCloseRegister(fn) { getPercentOnClose = fn; }

                if (vlc) watchVlc(itemAtLaunch, url, onCloseRegister);
                if (mpv) watchMpv(mpvPipe, itemAtLaunch, url, onCloseRegister);

                try {
                    child.on('close', function () {
                        var lastKnownPercent = getPercentOnClose ? getPercentOnClose() : 0;

                        if (lastKnownPercent < FINISH_THRESHOLD_PERCENT) {
                            // Закрыл раньше конца — ничего не трогаем и не
                            // переключаем серию сами
                            return;
                        }

                        updateTimeline(itemAtLaunch, url, 100, 0, 0);
                        tryNext();
                    });
                } catch (e) {
                    console.error('[playlist-plugin] spawn close hook error', e);
                }

                return child;
            };

            cp.spawn.__lampaPlaylistPatched = true;

            console.log('[playlist-plugin] auto-next patch active (VLC + MPV)');
        } catch (e) {
            console.error('[playlist-plugin] could not patch spawn', e);
        }
    }

    if (window.appready || (typeof Lampa !== 'undefined' && Lampa.Player)) {
        startPlugin();
    } else if (typeof Lampa !== 'undefined' && Lampa.Listener) {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') startPlugin();
        });
    } else {
        setTimeout(startPlugin, 1000);
    }
})();