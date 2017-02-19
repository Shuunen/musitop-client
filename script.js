window.onload = function () {

    Vue.component('toast', {
        props: ['toast'],
        template: '<div class="toast" v-bind:class="toast.type"><strong>{{ toast.title }}</strong><p>{{ toast.message }}</p></div>',
        mounted() {
            setTimeout(() => {
                this.$el.classList.toggle('visible');
                setTimeout(() => {
                    this.$el.classList.toggle('visible');
                    setTimeout(() => {
                        this.$el.remove();
                    }, 1000);
                }, this.toast.delay);
            }, 100);
        }
    });

    new Vue({
        el: '#app',
        data: {
            app: {
                name: 'Musitop',
                socket: null
            },
            isConnected: false,
            isMobile: (typeof window.orientation !== 'undefined'),
            isLoading: true,
            isPaused: true,
            isPlaying: false,
            sounds: {
                notification: new Audio('sounds/notification.mp3')
            },
            progressBarStyle: {
                transitionDuration: '0s',
                transform: 'translateX(-100%)'
            },
            player: null,
            song: {
                artist: 'Unknown artist',
                title: 'Unknown title',
                duration: 0,
                shouldStartAt: 0,
                startTimestamp: 0,
                hasBeenMarked: false
            },
            dynamicStyles: '',
            colors: {
                primary: 'grey',
                secondary: 'whitesmoke'
            },
            toaster: {
                stack: [],
                lastOne: {
                    timestamp: null,
                    message: ''
                }
            },
            options: {
                endpoint: 'https://musitop.io:1404',
                audioClientSide: false,
                audioServerSide: false,
                keyboardTriggers: {
                    good: ['MediaTrackPrevious', 'ArrowUp'],
                    bad: ['MediaStop'],
                    next: ['MediaTrackNext', 'ArrowRight'],
                    pause: [' ', 'MediaPlayPause']
                },
                modal: {
                    isOpened: false
                },
                canUpdate: true,
                doSoundNotifications: true,
                doToastNotifications: true,
                doAutoplay: false
            }
        },
        methods: {
            initSocket: function () {
                this.notify('Socket', 'client side connecting...');
                this.socket = io(this.options.endpoint);
                this.socket.on('metadata', this.onMetadata);
                this.socket.on('music was', this.onMusicWas);
                this.socket.on('options', this.onOptions);
                this.socket.on('error', this.onError);
                this.socket.on('disconnect', this.onDisconnect);
                this.socket.on('connect', this.onConnection);
                this.socket.on('pause', this.pauseResume);
            },
            onMetadata: function (metadata) {
                // avoid bothering this client with other clients data refresh
                if (metadata.startTimestamp === this.song.startTimestamp) {
                    this.notify('Socket', 'received same metadata infos');
                    return;
                }
                this.notify('Socket', 'received fresh metadata infos');
                this.notify('info', metadata);
                this.song.artist = metadata.albumartist[0];
                this.song.title = metadata.title;
                this.song.duration = Math.round(metadata.duration);
                this.song.startTimestamp = metadata.startTimestamp;
                this.song.endTimestamp = metadata.startTimestamp + this.song.duration;
                this.song.hasBeenMarked = false;
                this.song.stream = this.options.endpoint + metadata.stream + '?t=' + metadata.startTimestamp;
                this.updateCover(metadata.picture[0]); // specific process for covers
                this.resetProgressBar();
                this.updatePlayer();
            },
            onMusicWas: function (musicWas) {
                this.notify('Client', 'Server said that music was "' + musicWas + '"');
                if (musicWas === 'good') {
                    this.notify('Will keep', this.song.artist + ' - ' + this.song.title, 'success');
                    this.song.hasBeenMarked = true;
                } else if (musicWas === 'bad') {
                    this.notify('Deleting', this.song.artist + ' - ' + this.song.title, 'alert');
                    this.song.hasBeenMarked = true;
                } else if (musicWas === 'next') {
                    this.notify('Skip', 'Loading next song...', 'info');
                    setTimeout(() => {
                        this.isLoading = true;
                    }, 100);
                } else if (musicWas === 'pause') {
                    this.notify('Pause', 'Was asked by server', 'info');
                } else {
                    this.notify('Client', 'Server said that music was "' + musicWas + '" ?!?', 'info');
                }
            },
            onDisconnect: function () {
                this.notify('Socket', 'client side disconnected');
            },
            onError: function (e) {
                this.notify('Error', 'Client error, see logs', 'error');
                this.notify('error', e);
            },
            onConnection: function () {
                this.notify('Socket', 'client side connection init');
                this.isConnected = true;
            },
            onOptions: function (options) {
                if (!this.options.canUpdate) {
                    return;
                }
                this.notify('Socket', 'received fresh options');
                this.notify('info', options);
                this.options.audioClientSide = options.audioClientSide;
                this.options.audioServerSide = !options.audioClientSide;
                if (this.options.audioClientSide && !this.player) {
                    this.initPlayer();
                }
            },
            updatePlayer: function () {
                var shouldStartAt = Math.round(new Date().getTime() / 1000) - this.song.startTimestamp;
                shouldStartAt = shouldStartAt <= 5 ? 0 : shouldStartAt; // if should start song at 1 or 3 seconds, it's stupid
                this.song.shouldStartAt = shouldStartAt;
                // this.notify('info', 'song shouldStartAt : ' + shouldStartAt + ' seconds');
                if (this.options.audioClientSide) {
                    this.player.autoplay = this.options.doAutoplay;
                    if (this.player.src != this.song.stream) {
                        this.player.src = this.song.stream;
                    }
                    this.player.currentTime = this.song.shouldStartAt;
                } else {
                    this.isLoading = false;
                    this.updateProgressBar();
                }
            },
            getDataUrlFromArrayBuffer: function (arrayBuffer) {
                // Obtain a blob: URL for the image data.
                var arrayBufferView = new Uint8Array(arrayBuffer);
                var blob = new Blob([arrayBufferView], {
                    type: 'image/jpeg'
                });
                var urlCreator = window.URL || window.webkitURL;
                return urlCreator.createObjectURL(blob);
            },
            updateCover: function (cover) {
                var dataUrl = cover ? this.getDataUrlFromArrayBuffer(cover.data) : 'icons/no-cover.svg';
                this.song.cover = dataUrl;
                this.getColorPaletteFromCover();
            },
            getColorPaletteFromCover: function () {
                this.dynamicStyles = '';
                var img = document.querySelector('.gradient-overlay img');
                img.onload = () => {
                    this.notify('info', 'cover image loaded');
                    var target = document.querySelectorAll('.gradient-overlay'); // why querySelectorAll
                    target[0].style = '';
                    if (!target.length) {
                        this.notify('warning', 'no target to apply Grade');
                        return;
                    }
                    Grade(target);
                    // flatten Grade applied style
                    target[0].setAttribute('style', target[0].getAttribute('style').replace(/\n|\s+/g, ''));
                    // get the colors
                    var colors = target[0].style.backgroundImage.match(/(rgb\([\d]+,\s[\d]+,\s[\d]+\))/g); // to use [0] ?
                    if (!colors || colors.length !== 2) {
                        this.notify('warning', 'no colors retrieved from Grade');
                        return;
                    }
                    this.notify('Grade', 'got colors from cover : "' + colors[0] + '" & "' + colors[1] + '"');
                    this.colors.primary = colors[0];
                    this.colors.secondary = colors[1];
                    this.dynamicStyles = '<style>';
                    this.dynamicStyles += '.color-primary { color: ' + this.colors.primary + '}';
                    this.dynamicStyles += '.color-secondary { color: ' + this.colors.secondary + '}';
                    this.dynamicStyles += '.stroke-primary { stroke: ' + this.colors.primary + '}';
                    this.dynamicStyles += '.stroke-secondary { stroke: ' + this.colors.secondary + '}';
                    this.dynamicStyles += '</style>';
                };
            },
            updateStatus: function (e) {
                if (this.options.audioClientSide) {
                    // this.notify('Client', e.type, 'info');
                    if (e.type === 'canplay') {
                        this.isLoading = false;
                        this.updateProgressBar();
                    } else if (!this.isLoading) {
                        this.isPaused = this.player.paused;
                        this.isPlaying = !this.player.paused;
                    }
                } else if (this.options.audioServerSide) {
                    this.isLoading = false;
                    this.updateProgressBar();
                } else {
                    this.notify('Error', 'non handled case in updateStatus', 'error');
                }
            },
            resetProgressBar: function () {
                this.progressBarStyle.transitionDuration = '0s';
                this.progressBarStyle.transform = 'translateX(-100%)';
            },
            updateProgressBar: function () {
                // this.notify('shouldStartAt', this.song.shouldStartAt);
                var percentDoneAtInit = Math.round(this.song.shouldStartAt / this.song.duration * 10000) / 100;
                // this.notify('percentDoneAtInit', percentDoneAtInit);
                var secondsLeft = Math.round(this.song.duration - this.song.shouldStartAt);
                // this.notify('secondsLeft', secondsLeft);
                this.progressBarStyle.transitionDuration = '0s';
                setTimeout(() => {
                    this.progressBarStyle.transitionDuration = secondsLeft + 's';
                }, 300);
                this.progressBarStyle.transform = 'translateX(-' + (100 - percentDoneAtInit) + '%)';
                setTimeout(() => {
                    this.progressBarStyle.transform = 'translateX(0%)';
                }, 900);
            },
            getTimestamp: function () {
                return Math.round(new Date().getTime() / 1000);
            },
            initPlayer: function () {
                if (this.options.audioServerSide) {
                    return;
                }
                this.player = document.querySelector('audio');
                this.player.autoplay = this.options.doAutoplay;
                this.player.addEventListener('ended', this.nextSong);
                this.player.addEventListener('pause', this.updateStatus);
                this.player.addEventListener('play', this.updateStatus);
                this.player.addEventListener('canplay', this.updateStatus);
            },
            initKeyboard: function () {
                document.body.addEventListener('keyup', this.handleKeyboard);
            },
            handleKeyboard: function (event) {
                // this.notify('info', 'received keyup "' + event.key + '"');
                this.socket.emit('event', event.key);
                if (this.options.keyboardTriggers.good.indexOf(event.key) !== -1) { // <
                    this.musicIs('good');
                } else if (this.options.keyboardTriggers.bad.indexOf(event.key) !== -1) { // [ ]
                    this.musicIs('bad');
                } else if (this.options.keyboardTriggers.next.indexOf(event.key) !== -1) { // >
                    this.nextSong();
                } else if (this.options.keyboardTriggers.pause.indexOf(event.key) !== -1) { // [>]
                    this.pauseResume();
                } else {
                    this.notify('info', 'key "' + event.key + '" is not handled yet');
                }
            },
            musicIs: function (musicIs) {
                this.socket.emit('music is', musicIs);
            },
            nextSong: function () {
                this.isLoading = true;
                // set player time to 0 for next song
                if (this.options.audioClientSide) {
                    this.player.pause();
                    this.player.currentTime = 0;
                }
                this.socket.emit('music is', 'next');
            },
            pauseResume: function () {
                if (this.options.audioClientSide) {
                    if (this.player.paused) {
                        this.updatePlayer();
                        this.player.play();
                        this.player.autoplay = true;
                        this.notify('info', 'song  was paused, resuming...');
                    } else {
                        this.player.pause();
                        this.player.autoplay = false;
                        this.notify('info', 'song  was playing, do pause');
                    }
                } else if (this.options.audioServerSide) {
                    this.options.audioServerSide = false;
                    this.options.audioClientSide = true;
                    this.options.canUpdate = false;
                    this.initPlayer();
                    this.updatePlayer();
                } else {
                    this.notify('Error', 'non handled case in pauseResume', 'error');
                }
            },
            notify: function (action, message, type, withSound) {
                /* eslint-disable no-console */
                if (type && this.options.doToastNotifications) {
                    if (['success', 'info', 'alert'].indexOf(type) !== -1) {
                        this.toast(type, action, message);
                    } else {
                        this.toast('alert', 'Error', 'cannot toast type "' + type + '"');
                        console.error('cannot toast type "' + type + '"');
                    }
                }
                if (withSound && this.options.doSoundNotifications) {
                    this.sounds.notification.play();
                }
                if (console[action]) {
                    console[action](message);
                } else {
                    // in order to align logs :p
                    while (action.length < 9) {
                        action += ' ';
                    }
                    console.log(action + ' : ' + message);
                }
                /* eslint-enable no-console */
            },
            toast: function (type, title, message, delay) {
                var shouldNotToast = false;
                // check if toast is a twin of last one
                if (this.toaster.lastOne.timestamp) {
                    var secondsSinceLastOne = this.getTimestamp() - this.toaster.lastOne.timestamp;
                    var contentVaryWithLastOne = (type + title + message) !== this.toaster.lastOne.message;
                    shouldNotToast = (secondsSinceLastOne <= 2) && !contentVaryWithLastOne;
                }
                // avoid toasting if needed
                if (shouldNotToast) {
                    return;
                }
                // do toast
                this.toaster.stack.push({
                    type: type,
                    title: title,
                    message: message,
                    delay: (delay || 4000)
                });
                // to check with the next one
                this.toaster.lastOne.timestamp = this.getTimestamp();
                this.toaster.lastOne.message = (type + title + message);
            },
            initServiceWorker: function () {
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.register('service-worker.js').then((registration) => {
                        // Registration was successful
                        this.notify('Info', 'ServiceWorker registration successful with scope');
                        console.log(registration.scope); // eslint-disable-line no-console
                    }).catch((err) => {
                        // registration failed :(
                        this.notify('Error', 'ServiceWorker registration failed');
                        console.error(err); // eslint-disable-line no-console
                    });
                }
            },
            cron: function () {
                // console.log('in cron');
                if (this.isPlaying && !this.song.hasBeenMarked) {
                    var songEndIn = (this.song.endTimestamp - this.getTimestamp());
                    // console.log('song end in ', songEndIn, 'seconds');
                    if ([34, 21, 13, 8, 5].indexOf(songEndIn) !== -1) {
                        this.notify('Hey', 'Song end in ' + songEndIn + ' seconds', 'info', true);
                    }
                }
            }
        },
        mounted() {
            this.notify('info', this.app.name + ' init');
            this.initSocket();
            this.initKeyboard();
            this.initServiceWorker();
            setInterval(this.cron, 1000);
        }
    });
};
