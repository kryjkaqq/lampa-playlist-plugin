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

    // Подтверждено сверкой с реальным item.timeline.hash - формула верна
    function episodeHash(card, season, episode) {
        try {
            return Lampa.Utils.hash([season, season > 10 ? ':' : '', episode, card.original_name || card.original_title].join(''));
        } catch (e) {
            return null;
        }
    }

    function updateTimeline(hash, percent, time, duration) {
        try {
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

    // Строим объект следующего эпизода сами - у Lampa нет своего "playlist"
    // в сценарии просмотра файлов торрента (PlayerPlaylist.canNext() всегда
    // false тут), так что штатный переход неприменим. Реальные id/path берём
    // напрямую из TorrServer (просто подменить index= в url недостаточно -
    // Lampa, похоже, пересобирает запрос по id/path, а не по url напрямую).
    function fetchNextFileFromTorrServer(host, hash, nextIndex) {
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', host + '/torrents', false);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(JSON.stringify({ action: 'get', hash: hash }));

            if (xhr.status !== 200 || !xhr.responseText) return null;

            var data = JSON.parse(xhr.responseText);
            var files = data && data.file_stats;
            if (!Array.isArray(files)) return null;

            for (var i = 0; i < files.length; i++) {
                if (files[i].id === nextIndex) return files[i];
            }
            return null;
        } catch (e) {
            console.error('[playlist-plugin] fetchNextFileFromTorrServer error', e);
            return null;
        }
    }

    function buildNextItem(item) {
        try {
            if (!item || !item.url) {
                try { alert('buildNextItem: нет item или item.url'); } catch (e) {}
                return null;
            }

            var hostMatch = item.url.match(/(https?:\/\/[^\/]+)/);
            var hashMatch = item.url.match(/(?:link|hash)=([a-fA-F0-9]+)/);
            var idxM = item.url.match(/[?&]index=([0-9]+)/);
            if (!hostMatch || !hashMatch || !idxM) {
                try { alert('buildNextItem: не распарсился url: ' + item.url); } catch (e) {}
                return null;
            }

            var host = hostMatch[1];
            var torrentHash = hashMatch[1];
            var nextIndex = parseInt(idxM[1], 10) + 1;

            var nextFile = fetchNextFileFromTorrServer(host, torrentHash, nextIndex);
            if (!nextFile) {
                try { alert('buildNextItem: файл с id=' + nextIndex + ' НЕ найден в TorrServer'); } catch (e) {}
                return null;
            }

            // Берём РАБОЧИЙ url текущей серии и меняем в нём только имя файла
            // и index= - так сохраняются все остальные параметры (&preload
            // и т.п.), которые мы не знаем точно, как правильно собрать с нуля
            var oldNameMatch = item.url.match(/\/stream\/([^?]+)/);
            var newNameEncoded = encodeURIComponent(nextFile.path.split('/').pop());
            var nextUrl = item.url;

            if (oldNameMatch) {
                nextUrl = nextUrl.replace(oldNameMatch[1], newNameEncoded);
            }
            nextUrl = nextUrl.replace(/([?&]index=)[0-9]+/, '$1' + nextIndex);

            var nextEpisode = (item.episode || 0) + 1;
            var season = item.season || getSeasonNumber();
            var card = getCard(item);
            var nextHash = episodeHash(card, season, nextEpisode);

            var savedProgress = null;
            try {
                if (nextHash && Lampa.Timeline && Lampa.Timeline.view) {
                    savedProgress = Lampa.Timeline.view(nextHash);
                }
            } catch (e) {}

            var nextItem = {};
            for (var k in item) {
                if (Object.prototype.hasOwnProperty.call(item, k)) nextItem[k] = item[k];
            }
            nextItem.url = nextUrl;
            nextItem.id = nextIndex;
            nextItem.path = nextFile.path;
            nextItem.episode = nextEpisode;
            nextItem.timeline = {
                hash: nextHash,
                percent: savedProgress ? savedProgress.percent : 0,
                time: savedProgress ? savedProgress.time : 0,
                duration: savedProgress ? savedProgress.duration : 0,
                profile: savedProgress ? savedProgress.profile : 0
            };

            return nextItem;
        } catch (e) {
            console.error('[playlist-plugin] buildNextItem error', e);
            return null;
        }
    }

    function openNext(item) {
        var next = buildNextItem(item);
        if (!next) return;

        try {
            Lampa.Player.play(next);
        } catch (e) {
            console.error('[playlist-plugin] openNext error', e);
        }
    }

    // ---------- VLC: слежение через встроенный HTTP-интерфейс ----------

    function watchVlc(onClose) {
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

    // onFinish вызывается САМИМ этим модулем, когда видит idle-active=true
    // (mpv.net не закрывает процесс сам по себе даже с --keep-open=no,
    // поэтому ждать child.on('close') для него бессмысленно)
    function watchMpv(pipeName, hash, onFinish) {
        var net = require('net');
        var socket = null;
        var poll = null;
        var buffer = '';
        var finished = false;

        var TIME_REQ_ID = 1001;
        var DUR_REQ_ID = 1002;
        var IDLE_REQ_ID = 1004;
        var timePos = null;
        var duration = null;
        var lastKnownPercent = 0;

        function updatePercent() {
            if (timePos !== null && duration !== null && duration > 0) {
                lastKnownPercent = Math.round((timePos / duration) * 100);
                // Пишем прогресс в Lampa прямо во время просмотра
                updateTimeline(hash, lastKnownPercent, timePos, duration);
            }
        }

        function requestProp(name, id) {
            if (!socket || socket.destroyed) return;
            try {
                socket.write(JSON.stringify({ command: ['get_property', name], request_id: id }) + '\n');
            } catch (e) {}
        }

        function cleanup() {
            if (poll) clearInterval(poll);
            if (socket) { try { socket.destroy(); } catch (e) {} }
        }

        function tryConnect(attemptsLeft) {
            if (attemptsLeft <= 0) {
                try { alert('MPV IPC: не удалось переподключиться (' + pipeName + ')'); } catch (e) {}
                return;
            }

            socket = net.connect(pipeName, function () {
                poll = setInterval(function () {
                    requestProp('duration', DUR_REQ_ID);
                    requestProp('time-pos', TIME_REQ_ID);
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
                        }
                        if (msg && msg.request_id === IDLE_REQ_ID && msg.data === true && !finished) {
                            finished = true;
                            var state = { percent: lastKnownPercent, time: timePos || 0, duration: duration || 0 };
                            try { alert('MPV idle-active сработал: percent=' + state.percent); } catch (e) {}
                            cleanup();
                            onFinish(state);
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

        return { cleanup: cleanup };
    }

    function startPlugin() {
        if (typeof require === 'undefined') {
            console.warn('[playlist-plugin] нет доступа к require, автопереход недоступен');
            return;
        }
        if (typeof Lampa === 'undefined' || !Lampa.Player) return;

        var originalPlay = Lampa.Player.play;
        Lampa.Player.play = function (item) {
            lastPlayItem = item;

            // Берём сохранённый таймкод НАПРЯМУЮ из хранилища Lampa по хэшу
            try {
                var hash = item && item.timeline && item.timeline.hash;
                if (hash && Lampa.Timeline && Lampa.Timeline.view) {
                    var saved = Lampa.Timeline.view(hash);
                    // Если серия уже досмотрена почти до конца - не резюмируем
                    // буквально с конца файла (плеер тут же выйдет обратно)
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

            return originalPlay.call(this, item);
        };

        try {
            var cp = require('child_process');

            if (cp.spawn.__lampaPlaylistPatched) {
                return;
            }

            var origSpawn = cp.spawn;

            cp.spawn = function (path, args, options) {
                var vlc = isVlc(path);
                var mpv = isMpv(path);
                var itemAtLaunch = lastPlayItem;
                var url = extractUrl(args);
                var episodeHashAtLaunch = itemAtLaunch && itemAtLaunch.timeline ? itemAtLaunch.timeline.hash : null;

                var finalArgs = args;
                var mpvPipe = null;

                if (vlc && Array.isArray(finalArgs)) {
                    // Lampa к моменту запуска VLC теряет сохранённый таймкод
                    // (--start-time приходит около нуля). Подставляем вместо
                    // него значение, снятое нами раньше при клике на серию.
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
                }

                var child = origSpawn.call(this, path, finalArgs, options);

                try {
                    alert('SPAWN args: ' + JSON.stringify(finalArgs));
                } catch (e) {}

                if (!vlc && !mpv) {
                    // Плеер без API (PotPlayer и т.п.) - реального таймкода
                    // не знаем, ничего не отслеживаем и не переключаем
                    return child;
                }

                function handleFinish(state) {
                    if (state.percent < FINISH_THRESHOLD_PERCENT) {
                        // Закрыл раньше конца - ничего не трогаем и не
                        // переключаем серию сами
                        return;
                    }

                    // Досмотрел до конца - фиксируем 100%, время равно
                    // длительности (не нулю, чтобы не портить данные)
                    updateTimeline(episodeHashAtLaunch, 100, state.duration, state.duration);
                    openNext(itemAtLaunch);
                }

                if (vlc) {
                    // У VLC есть --play-and-exit, процесс сам корректно
                    // закрывается по окончании - используем событие close
                    var getStateOnClose = null;
                    watchVlc(function (fn) { getStateOnClose = fn; });

                    try {
                        child.on('close', function () {
                            var state = getStateOnClose ? getStateOnClose() : { percent: 0, time: 0, duration: 0 };
                            handleFinish(state);
                        });
                    } catch (e) {
                        console.error('[playlist-plugin] spawn close hook error', e);
                    }
                }

                if (mpv) {
                    // mpv.net не закрывает процесс сам по себе даже с
                    // --keep-open=no - ловим окончание через idle-active в IPC
                    watchMpv(mpvPipe, episodeHashAtLaunch, function (state) {
                        handleFinish(state);
                    });
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