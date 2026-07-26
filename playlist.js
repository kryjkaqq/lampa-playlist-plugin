(function () {
    'use strict';

    var lastPlayItem = null;
    var lastResumeSeconds = 0;
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
            var hash = item && item.timeline && item.timeline.hash;
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
            var can = Lampa.PlayerPlaylist.canNext();
            if (Lampa.Noty) Lampa.Noty.show('tryNext: canNext=' + can);

            if (can) {
                Lampa.PlayerPlaylist.next();
            }
        } catch (e) {
            console.error('[playlist-plugin] PlayerPlaylist.next error', e);
            if (Lampa.Noty) Lampa.Noty.show('tryNext error: ' + e.message);
        }
    }

    // ---------- VLC: слежение через встроенный HTTP-интерфейс ----------

    function watchVlc(item, url, onClose) {
        var lastKnownPercent = 0;
        var lastKnownTime = 0;
        var lastKnownDuration = 0;

        var poll = setInterval(function () {
            var headers = new Headers();
            headers.append('Authorization', 'Basic ' + btoa(':' + VLC_PASSWORD));

            fetch('http://localhost:' + VLC_PORT + '/requests/status.json', { headers: headers })
                .then(function (r) { return r.json(); })
                .then(function (status) {
                    if (status && status.time && status.length) {
                        lastKnownPercent = Math.round((status.time / status.length) * 100);
                        lastKnownTime = status.time;
                        lastKnownDuration = status.length;
                    }
                })
                .catch(function () {});
        }, 4000);

        onClose(function () {
            clearInterval(poll);
            return { percent: lastKnownPercent, time: lastKnownTime, duration: lastKnownDuration };
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
        var EOF_REQ_ID = 1003;
        var IDLE_REQ_ID = 1004;
        var timePos = null;
        var duration = null;

        function updatePercent() {
            if (timePos !== null && duration !== null && duration > 0) {
                lastKnownPercent = Math.round((timePos / duration) * 100);
                // Пишем прогресс в Lampa прямо во время просмотра — как это
                // нативно делает встроенный опрос Lampa для VLC
                updateTimeline(item, url, lastKnownPercent, timePos, duration);
            }
        }

        function requestProp(name, id) {
            if (!socket || socket.destroyed) return;
            try {
                socket.write(JSON.stringify({ command: ['get_property', name], request_id: id }) + '\n');
            } catch (e) {}
        }

        function tryConnect(attemptsLeft) {
            if (attemptsLeft <= 0) {
                if (Lampa.Noty) Lampa.Noty.show('MPV IPC: не удалось подключиться к ' + pipeName);
                return;
            }

            socket = net.connect(pipeName, function () {
                if (Lampa.Noty) Lampa.Noty.show('MPV IPC: подключено');

                poll = setInterval(function () {
                    requestProp('duration', DUR_REQ_ID);
                    requestProp('time-pos', TIME_REQ_ID);
                    requestProp('eof-reached', EOF_REQ_ID);
                    requestProp('idle-active', IDLE_REQ_ID);
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

                        if (msg && msg.request_id === DUR_REQ_ID) {
                            if (typeof msg.data === 'number') duration = msg.data;
                            updatePercent();
                        }
                        if (msg && msg.request_id === TIME_REQ_ID) {
                            if (typeof msg.data === 'number') timePos = msg.data;
                            updatePercent();
                            if (Lampa.Noty) Lampa.Noty.show('MPV: time=' + timePos + ' dur=' + duration + ' percent=' + lastKnownPercent);
                        }
                        if (msg && msg.request_id === EOF_REQ_ID) {
                            if (Lampa.Noty) Lampa.Noty.show('MPV eof-reached=' + JSON.stringify(msg.data) + ' (error=' + msg.error + ')');
                        }
                        if (msg && msg.request_id === IDLE_REQ_ID) {
                            if (Lampa.Noty) Lampa.Noty.show('MPV idle-active=' + JSON.stringify(msg.data) + ' (error=' + msg.error + ')');
                        }
                    } catch (e) {}
                });
            });

            socket.on('error', function (err) {
                if (Lampa.Noty) Lampa.Noty.show('MPV IPC error: ' + (err && err.message) + ', попытка ' + attemptsLeft);
                try { socket.destroy(); } catch (e) {}
                setTimeout(function () { tryConnect(attemptsLeft - 1); }, 700);
            });
        }

        tryConnect(6);

        onClose(function () {
            if (poll) clearInterval(poll);
            if (socket) { try { socket.destroy(); } catch (e) {} }
            return { percent: lastKnownPercent, time: timePos || 0, duration: duration || 0 };
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

            // Берём сохранённый таймкод НАПРЯМУЮ из хранилища Lampa по хэшу —
            // item.timeline.time ненадёжен (может быть 0 даже если прогресс
            // реально сохранён), а Timeline.view(hash) читает актуальные данные
            try {
                var hash = item && item.timeline && item.timeline.hash;
                if (hash && Lampa.Timeline && Lampa.Timeline.view) {
                    var saved = Lampa.Timeline.view(hash);
                    // Если серия уже досмотрена почти до конца - не пытаемся
                    // резюмировать буквально с конца файла (плеер с флагом
                    // "закрыться по окончании" тут же выйдет обратно)
                    if (saved && saved.percent >= 95) {
                        lastResumeSeconds = 0;
                    } else {
                        lastResumeSeconds = (saved && typeof saved.time === 'number') ? saved.time : 0;
                    }
                } else {
                    lastResumeSeconds = 0;
                }
            } catch (e) {
                lastResumeSeconds = 0;
            }

            try {
                if (item && item.url) {
                    computeEpisodeNum(item, item.url, false);

                    if (Lampa.Noty) {
                        var tlKeys = item.timeline ? Object.keys(item.timeline).join(',') : 'NO_TIMELINE';
                        var combinedMsg = 'season=' + item.season + ' episode=' + item.episode + ' | tl=' + tlKeys;

                        var idxM = item.url.match(/[?&]index=([0-9]+)/);
                        if (idxM) {
                            var curIdx = parseInt(idxM[1], 10);
                            var hypotheticalNextUrl = item.url.replace(/([?&]index=)[0-9]+/, '$1' + (curIdx + 1));
                            combinedMsg += ' || NEXT(idx+1)=' + hypotheticalNextUrl;
                        } else {
                            combinedMsg += ' || NO index= IN URL';
                        }

                        Lampa.Noty.show(combinedMsg);
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
                    // Lampa к моменту запуска VLC уже где-то теряет/обнуляет
                    // сохранённый таймкод (--start-time приходит около нуля).
                    // Подставляем вместо него значение, снятое нами раньше,
                    // сразу при клике на серию — пока оно ещё было верным.
                    var resumeSec = Math.floor(lastResumeSeconds || 0);
                    var hadStartTimeArg = false;

                    finalArgs = finalArgs.map(function (a) {
                        if (typeof a === 'string' && a.indexOf('--start-time=') === 0) {
                            hadStartTimeArg = true;
                            return '--start-time=' + resumeSec;
                        }
                        return a;
                    });

                    if (!hadStartTimeArg && resumeSec > 0) {
                        finalArgs.unshift('--start-time=' + resumeSec);
                    }

                    if (Lampa.Noty) {
                        Lampa.Noty.show('VLC resume: --start-time=' + resumeSec + ' сек');
                    }
                }

                if (mpv) {
                    var resumeSecMpv = Math.floor(lastResumeSeconds || 0);
                    var argsWithResume = finalArgs.concat(['--keep-open=no']);

                    if (resumeSecMpv > 0) {
                        argsWithResume = ['--start=' + resumeSecMpv].concat(argsWithResume);
                    }

                    var patched = patchArgsForMpv(argsWithResume);
                    finalArgs = patched.args;
                    mpvPipe = patched.pipeName;

                    if (Lampa.Noty) {
                        Lampa.Noty.show('MPV resume: --start=' + resumeSecMpv + ' сек');
                    }
                }

                var child = origSpawn.call(this, path, finalArgs, options);

                if (!vlc && !mpv) {
                    // Плеер без API (PotPlayer и т.п.) — реального таймкода
                    // не знаем, ничего не отслеживаем и не переключаем
                    return child;
                }

                var getStateOnClose = null;

                function onCloseRegister(fn) { getStateOnClose = fn; }

                if (vlc) watchVlc(itemAtLaunch, url, onCloseRegister);
                if (mpv) watchMpv(mpvPipe, itemAtLaunch, url, onCloseRegister);

                try {
                    child.on('close', function () {
                        var state = getStateOnClose ? getStateOnClose() : { percent: 0, time: 0, duration: 0 };

                        if (Lampa.Noty) {
                            Lampa.Noty.show('CLOSE: percent=' + state.percent + ' time=' + state.time + ' duration=' + state.duration + ' (порог=' + FINISH_THRESHOLD_PERCENT + ')');
                        }

                        if (state.percent < FINISH_THRESHOLD_PERCENT) {
                            // Закрыл раньше конца — ничего не трогаем и не
                            // переключаем серию сами
                            return;
                        }

                        // Досмотрел до конца — фиксируем 100%, время ставим
                        // равным длительности (а не нулю), чтобы не портить
                        // ранее сохранённые данные фиктивным сбросом
                        updateTimeline(itemAtLaunch, url, 100, state.duration, state.duration);
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