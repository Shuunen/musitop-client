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
                name: 'Musitop'
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
            socket: null,
            song: {
                uid: 666,
                artist: '',
                title: '',
                duration: 0,
                hasBeenMarked: false,
                waitingForNext: true,
                canPlay: false
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
                endpoint: {
                    address: '',
                    port: 666
                },
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
                doAutoplay: false,
                debugActive: false
            }
        },
        methods: {
            initSocket: function () {
                this.notify('Socket', 'client side connecting...');
                this.socket = io(this.options.endpoint.address + ':' + this.options.endpoint.port);
                this.socket.on('metadata', this.onMetadata);
                this.socket.on('music was', this.onMusicWas);
                this.socket.on('options', this.onOptions);
                this.socket.on('error', this.onError);
                this.socket.on('disconnect', this.onDisconnect);
                this.socket.on('connect', this.onConnection);
                this.socket.on('pause', this.pauseResume);
            },
            onMetadata: function (metadata) {
                // avoid bothering this client with other clients getting metadata
                if (metadata.uid === this.song.uid) {
                    return;
                }
                this.notify('Socket', 'received fresh metadata infos');
                this.notify('info', metadata);
                this.song.uid = metadata.uid;
                this.song.artist = metadata.albumartist[0];
                this.song.title = metadata.title;
                this.song.duration = Math.round(metadata.duration);
                this.song.canPlay = false;
                this.song.hasBeenMarked = false;
                this.song.waitingForNext = false;
                this.song.stream = this.options.endpoint.address + ':' + this.options.endpoint.port + metadata.stream + '?t=' + metadata.uid;
                this.updateCover(metadata.picture[0]); // specific process for covers
                this.resetProgressBar();
                this.setPlayerSource();
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
                    this.song.waitingForNext = true;
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
                // to get options only once
                this.options.canUpdate = false;
            },
            setPlayerSource: function () {
                if (this.options.audioClientSide) {
                    if (this.player.src != this.song.stream) {
                        // console.debug('currentTime = 0');
                        this.player.currentTime = 0;
                        // console.debug('set player.src');
                        this.player.src = this.song.stream;
                    }
                } else {
                    this.isLoading = false;
                    this.setProgressBar();
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
                    // this.notify('info', 'cover image loaded');
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
                    // this.notify('Grade', 'got colors from cover : "' + colors[0] + '" & "' + colors[1] + '"');
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
            updateStatus: function (event) {
                if (this.options.audioClientSide) {
                    // this.notify('Client', e.type, 'info');
                    if (event.type === 'canplay' && !this.song.waitingForNext) {
                        this.isLoading = false;
                        this.song.canPlay = true;
                        if (this.options.doAutoplay) {
                            // console.debug('player.play (canplay)');
                            this.player.play();
                        }
                    } else if (!this.isLoading) {
                        this.isPaused = this.player.paused;
                        this.isPlaying = !this.player.paused;
                    }
                } else if (this.options.audioServerSide) {
                    this.isLoading = false;
                }
                this.setProgressBar('updateStatus');
            },
            resetProgressBar: function () {
                this.progressBarStyle.transitionDuration = '0s';
                this.progressBarStyle.transform = 'translateX(-100%)';
            },
            setProgressBar: function (from) {
                // this.notify('Info', 'in setProgressBar from "' + from + '"');
                var secondsLeft = this.getSecondsLeft();
                var percentPlayed = Math.round((this.song.duration - secondsLeft) / this.song.duration * 10000) / 100;
                percentPlayed -= 2; // because
                this.progressBarStyle.transitionDuration = '0s';
                this.progressBarStyle.transform = 'translateX(-' + (100 - percentPlayed) + '%)';
                // this.notify('Info', 'percentPlayed : ' + percentPlayed + '%');
                setTimeout(() => {
                    this.progressBarStyle.transitionDuration = secondsLeft + 's';
                }, 300);
                setTimeout(() => {
                    this.progressBarStyle.transform = 'translateX(0%)';
                }, 900);
            },
            musicJumpTo: function (event) {
                var total = Math.round(event.target.getBoundingClientRect().width);
                var selection = Math.round(event.x - 50);
                // console.log('selection / total : ' + selection + '/' + total + ' = ' + Math.round(selection / total * 100));
                var percent = selection / total;
                var start = Math.round(percent * this.song.duration);
                // console.debug('currentTime = ' + start);
                this.player.currentTime = start;
                this.setProgressBar('musicJumpTo');
            },
            getTimestamp: function () {
                return Math.round(new Date().getTime() / 1000);
            },
            initPlayer: function () {
                if (this.player || this.options.audioServerSide) {
                    return;
                }
                this.player = document.querySelector('audio');
                this.player.autoplay = false; // leave native autoplay deactivated
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
            getWebId: function () {
                var id = '';
                id += navigator.userAgent.match(/Chrome\/(\d\d)/)[0].replace('/', ' ');
                id += ' (' + navigator.platform + ')';
                id += ' [' + navigator.language + ']';
                return id;
            },
            musicIs: function (musicIs) {
                this.socket.emit('music is', musicIs);
            },
            nextSong: function (event) {
                this.isLoading = true;
                this.song.waitingForNext = true;
                this.resetProgressBar();
                if (this.player) {
                    // console.debug('pause (nextSong)');
                    this.player.pause();
                    // console.debug('currentTime = 0 (nextSong)');
                    this.player.currentTime = 0;
                }
                this.socket.emit('music is', 'next');
                this.socket.emit('event', 'next asked from ' + this.getWebId() + ' because of ' + event.type);
            },
            pauseResume: function () {
                if (this.options.audioClientSide) {
                    if (this.player.paused) {
                        this.options.doAutoplay = true;
                        // console.debug('player.play (pauseResume)');
                        this.player.play();
                        this.notify('info', 'song  was paused, resuming...');
                    } else {
                        // console.debug('player.pause (pauseResume)');
                        this.player.pause();
                        this.options.doAutoplay = false;
                        this.notify('info', 'song  was playing, do pause');
                    }
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
                if (console[action.toLowerCase()]) {
                    console[action.toLowerCase()](message);
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

                if (document.location.protocol.indexOf('https') === -1) {
                    // avoid error when trying to init a service worker on non https connection
                    return;
                }

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
                    var secondsLeft = this.getSecondsLeft();
                    if ([34, 21, 13, 8, 5].indexOf(secondsLeft) !== -1) {
                        this.notify('Hey', 'Song end in ' + secondsLeft + ' seconds', 'info', true);
                    }
                }
            },
            updateEndpointAddress: function () {
                var doPointToHttps = this.options.endpoint.address.indexOf('https') !== -1;
                this.options.endpoint.port = doPointToHttps ? 1444 : 1404;
                this.initSocket();
            },
            guessDefaultEndpoint: function () {

                var host = document.location.hostname; // "192.168.31.12" | "musitop.io" | "shuunen.github.io"
                var protocol = document.location.protocol; // "http:" | "https:"
                if (host === 'shuunen.github.io') {
                    // if user is using github hosted client, we can imagine server is on his localhost : musitop.io
                    // and serving https content, no other choice if you use https shuunen.github.io
                    // you need to use https distant server, and if you want to use http shuunen.github.io, you can't :D
                    this.options.endpoint.address = 'https://musitop.io';
                } else {
                    // if user is using is own client, he can either use https or http version
                    this.options.endpoint.address = protocol + '//' + host;
                }

                this.updateEndpointAddress();
            },
            getSecondsLeft: function () {
                return Math.round(this.song.duration - this.player.currentTime);
            }
        },
        mounted() {
            this.notify('info', this.app.name + ' init');
            this.guessDefaultEndpoint();
            this.initKeyboard();
            this.initServiceWorker();
            setInterval(this.cron, 1000);
        }
    });
};
