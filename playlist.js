(function () {
    'use strict';

    // Выводим всплывающее окно прямо в интерфейсе Lampa при старте
    function test() {
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show('ТЕСТ: Плагин успешно загружен!');
        } else {
            alert('ТЕСТ: Плагин загружен!');
        }
    }

    if (window.appready) {
        test();
    } else {
        if (typeof Lampa !== 'undefined' && Lampa.Listener) {
            Lampa.Listener.follow('app', function (e) {
                if (e.type === 'ready') test();
            });
        }
    }
})();