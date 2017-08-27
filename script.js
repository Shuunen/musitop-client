window.onload = function () {

    Vue.component('toast', {
        props: ['toast'],
        template: '<div class="toast" v-bind:class="toast.type"><strong>{{ toast.title }}</strong><p>{{ toast.message }}</p></div>',
        mounted() {
            setTimeout(() => {
                this.$el.classList.toggle('visible')
                setTimeout(() => {
                    this.$el.classList.toggle('visible')
                    setTimeout(() => {
                        this.$el.remove()
                    }, 1000)
                }, this.toast.delay)
            }, 100)
        }
    })

    new Vue({
        el: '#app',
        data: {
            app: {
                name: 'Musitop',
                version: '3.4.1'
            },
            isConnected: false,
            isMobile: (typeof window.orientation !== 'undefined'),
            isLoading: true,
            isPaused: true,
            isPlaying: false,
            avoidNextSound: false,
            sounds: {
                notification: [new Audio('sounds/notification.mp3')],
                ok: [new Audio('sounds/robot-ok-01.mp3'), new Audio('sounds/male-ok-01.mp3'), new Audio('sounds/male-ok-02.mp3'), new Audio('sounds/female-ok-01.mp3'), new Audio('sounds/female-ok-02.mp3'), new Audio('sounds/female-ok-03.mp3')]
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
                album: '',
                title: '',
                duration: 0,
                hasBeenMarked: false,
                waitingForNext: true,
                canPlay: false
            },
            hasStartPreloading: false,
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
            },
            server: {
                version: '0.0.0'
            }
        },
        methods: {
            initSocket: function () {
                this.notify('Socket', 'client side connecting...')
                this.socket = io(this.options.endpoint.address + ':' + this.options.endpoint.port)
                this.socket.on('metadata', this.onMetadata)
                this.socket.on('palette', this.onPalette)
                this.socket.on('music was', this.onMusicWas)
                this.socket.on('options', this.onOptions)
                this.socket.on('error', this.onError)
                this.socket.on('disconnect', this.onDisconnect)
                this.socket.on('connect', this.onConnection)
                this.socket.on('pause', this.pauseResume)
            },
            onMetadata: function (metadata) {
                // avoid bothering this client with other clients getting metadata
                if (!metadata || metadata.uid === this.song.uid) {
                    return
                }
                this.notify('info', 'endpoint is ' + this.getEndpointUrl())
                this.notify('Socket', 'received fresh metadata infos')
                // this.notify('info', metadata);
                this.song.uid = metadata.uid
                this.song.artist = metadata.albumartist[0]
                this.song.title = metadata.title
                this.song.album = metadata.album
                this.song.duration = Math.round(metadata.duration)
                this.song.canPlay = false
                this.song.hasBeenMarked = false
                this.song.waitingForNext = false
                this.song.stream = this.urlTimestamped(metadata.stream)
                this.setPlayerSource(this.song.nextStream || this.song.stream) // if nextStream has been preloaded use this url
                this.song.nextStream = this.urlTimestamped(metadata.nextStream)
                this.song.cover = this.urlTimestamped('/cover.jpg')
                this.song.coverBlur = this.urlTimestamped('/cover-blurry.jpg')
                this.hasStartPreloading = false
                this.handleMediaSession()
                this.resetProgressBar()
                this.updateDynamicStyles()
            },
            urlTimestamped(url) {
                return this.getEndpointUrl() + url + '?t=' + this.getTimestamp()
            },
            handleMediaSession() {
                if ('mediaSession' in navigator) {
                    navigator.mediaSession.metadata = new MediaMetadata({
                        title: this.song.title,
                        artist: this.song.artist,
                        album: this.song.album,
                        artwork: [
                            /*
                            { src: 'https://dummyimage.com/96x96', sizes: '96x96', type: 'image/png' },
                            { src: 'https://dummyimage.com/128x128', sizes: '128x128', type: 'image/png' },
                            { src: 'https://dummyimage.com/192x192', sizes: '192x192', type: 'image/png' },
                            { src: 'https://dummyimage.com/384x384', sizes: '384x384', type: 'image/png' },
                            */
                            { src: this.urlTimestamped('/cover-256.jpg'), sizes: '256x256', type: 'image/jpeg' },
                            { src: this.urlTimestamped('/cover-512.jpg'), sizes: '512x512', type: 'image/jpeg' },
                        ]
                    })
                    navigator.mediaSession.setActionHandler('play', () => this.pauseResume())
                    navigator.mediaSession.setActionHandler('pause', () => this.pauseResume())
                    navigator.mediaSession.setActionHandler('nexttrack', () => this.nextSong())
                }
            },
            onPalette: function (palette) {
                if (palette && palette.Vibrant && palette.Vibrant._rgb) {
                    this.colors.primary = 'rgb(' + palette.Vibrant._rgb.join(',') + ')'
                } else {
                    this.colors.primary = 'black'
                }
                if (palette && palette.LightVibrant && palette.LightVibrant._rgb) {
                    this.colors.secondary = 'rgb(' + palette.LightVibrant._rgb.join(',') + ')'
                } else {
                    this.colors.secondary = 'snow'
                }
                if (palette && palette.LightMuted && palette.LightMuted._rgb) {
                    this.colors.bonus = 'rgb(' + palette.LightMuted._rgb.join(',') + ')'
                }
            },
            onMusicWas: function (musicWas) {
                this.notify('Client', 'Server said that music was "' + musicWas + '"')
                if (musicWas === 'good') {
                    this.notify('Will keep', this.song.artist + ' - ' + this.song.title, 'success', true)
                    this.song.hasBeenMarked = true
                } else if (musicWas === 'bad') {
                    this.notify('Deleting', this.song.artist + ' - ' + this.song.title, 'alert')
                    this.song.hasBeenMarked = true
                } else if (musicWas === 'next') {
                    this.notify('Skip', 'Loading next song...', 'info', true)
                    this.song.waitingForNext = true
                    setTimeout(() => {
                        this.isLoading = true
                    }, 100)
                } else if (musicWas === 'pause') {
                    this.notify('Pause', 'Was asked by server', 'info')
                } else {
                    this.notify('Client', 'Server said that music was "' + musicWas + '" ?!?', 'info')
                }
            },
            onDisconnect: function () {
                this.notify('Socket', 'client side disconnected')
            },
            onError: function (e) {
                this.notify('Error', 'Client error, see logs', 'error')
                this.notify('error', e)
            },
            onConnection: function () {
                this.notify('Socket', 'client side connection init')
                this.isConnected = true
                this.getServerVersion()
            },
            onOptions: function (options) {
                if (!this.options.canUpdate) {
                    return
                }
                this.notify('Socket', 'received fresh options')
                this.notify('info', options)
                this.options.audioClientSide = options.audioClientSide
                this.options.audioServerSide = !options.audioClientSide
                if (this.options.audioClientSide && !this.player) {
                    this.initPlayer()
                }
                // to get options only once
                this.options.canUpdate = false
            },
            setStorage: function () {
                this.notify('Storage', 'setStorage')
                localStorage.musitop = JSON.stringify({
                    endpoint: this.options.endpoint,
                    doSoundNotifications: this.options.doSoundNotifications,
                    doToastNotifications: this.options.doToastNotifications,
                    doAutoplay: this.options.doAutoplay,
                    debugActive: this.options.debugActive
                })
            },
            getStorage: function () {
                this.notify('Storage', 'getStorage')
                try {
                    var data = JSON.parse(localStorage.musitop)
                    this.options.endpoint = data.endpoint
                    this.updateEndpointAddress()
                    this.options.doSoundNotifications = data.doSoundNotifications
                    this.options.doToastNotifications = data.doToastNotifications
                    this.options.doAutoplay = data.doAutoplay
                    this.options.debugActive = data.debugActive
                } catch (error) {
                    this.notify('Storage', 'nothing to get from storage')
                    this.guessDefaultEndpoint()
                }
            },
            setPlayerSource: function (src) {
                if (this.options.audioClientSide) {
                    if (this.player.src != src) {
                        // console.debug('currentTime = 0');
                        this.player.currentTime = 0
                        // console.debug('set player.src');
                        this.player.src = src
                    }
                } else {
                    this.isLoading = false
                    this.setProgressBar()
                }
            },
            getEndpointUrl: function () {
                let endpoint = this.options.endpoint.address + ':' + this.options.endpoint.port
                return endpoint
            },
            updateDynamicStyles: function () {
                this.dynamicStyles = '<style>'
                this.dynamicStyles += '.color-primary { color: ' + this.colors.primary + '}'
                this.dynamicStyles += '.color-secondary { color: ' + this.colors.secondary + '}'
                this.dynamicStyles += '.stroke-primary { stroke: ' + this.colors.primary + '}'
                this.dynamicStyles += '.stroke-secondary { stroke: ' + this.colors.secondary + '}'
                this.dynamicStyles += '.cover-background { background-image: url(' + this.song.cover + ')}'
                this.dynamicStyles += '</style>'
            },
            updateStatus: function (event) {
                if (this.options.audioClientSide) {
                    // this.notify('Client', e.type, 'info');
                    if (event.type === 'play' && !this.hasStartPreloading) {
                        setTimeout(() => this.preloadNext(), 2000)
                    }
                    if (event.type === 'canplay' && !this.song.waitingForNext) {
                        this.isLoading = false
                        this.song.canPlay = true
                        if (this.options.doAutoplay) {
                            // console.debug('player.play (canplay)');
                            this.player.play()
                        }
                    } else if (!this.isLoading) {
                        this.isPaused = this.player.paused
                        this.isPlaying = !this.player.paused
                    }
                } else if (this.options.audioServerSide) {
                    this.isLoading = false
                }
                this.setProgressBar('updateStatus')
            },
            preloadNext: function () {
                if (!this.hasStartPreloading) {
                    this.notify('info', 'preloading next song...')
                    let preloader = document.querySelector('audio.preloader')
                    preloader.src = this.song.nextStream
                    this.hasStartPreloading = true
                }
            },
            resetProgressBar: function () {
                this.progressBarStyle.transitionDuration = '0s'
                this.progressBarStyle.transform = 'translateX(-100%)'
            },
            setProgressBar: function () {
                // this.notify('Info', 'in setProgressBar from "' + from + '"');
                var secondsLeft = this.getSecondsLeft()
                var secondsPassed = this.song.duration - secondsLeft
                var percentPlayed = Math.round(secondsPassed / this.song.duration * 10000) / 100
                // console.log('secondsPassed / duration : ' + secondsPassed + '/' + this.song.duration + ' = ' + percentPlayed + '%');
                // percentPlayed -= 2; // because
                this.progressBarStyle.transitionDuration = '0s'
                this.progressBarStyle.transform = 'translateX(-' + (100 - percentPlayed) + '%)'
                // this.notify('Info', 'percentPlayed : ' + percentPlayed + '%');
                setTimeout(() => {
                    this.progressBarStyle.transitionDuration = secondsLeft + 's'
                }, 300)
                setTimeout(() => {
                    this.progressBarStyle.transform = 'translateX(0%)'
                }, 900)
            },
            musicJumpTo: function (event) {
                var total = Math.round(event.target.getBoundingClientRect().width)
                var selection = Math.round(event.layerX)
                // console.log('selection / total : ' + selection + '/' + total + ' = ' + Math.round(selection / total * 100) + '%');
                var percent = selection / total
                var start = Math.round(percent * this.song.duration)
                // console.debug('currentTime = ' + start);
                this.player.currentTime = start
                setTimeout(() => {
                    this.setProgressBar('musicJumpTo')
                }, 100)
            },
            getTimestamp: function () {
                return Math.round(new Date().getTime() / 1000)
            },
            initPlayer: function () {
                if (this.player || this.options.audioServerSide) {
                    return
                }
                this.player = document.querySelector('audio')
                this.player.autoplay = false // leave native autoplay deactivated
                this.player.addEventListener('ended', this.nextSong)
                this.player.addEventListener('pause', this.updateStatus)
                this.player.addEventListener('play', this.updateStatus)
                this.player.addEventListener('canplay', this.updateStatus)
            },
            initKeyboard: function () {
                document.body.addEventListener('keyup', this.handleKeyboard)
            },
            handleKeyboard: function (event) {
                // this.notify('info', 'received keyup "' + event.key + '"');
                this.socket.emit('event', event.key)
                if (this.options.keyboardTriggers.good.indexOf(event.key) !== -1) { // <
                    this.musicIs('good')
                } else if (this.options.keyboardTriggers.bad.indexOf(event.key) !== -1) { // [ ]
                    this.musicIs('bad')
                } else if (this.options.keyboardTriggers.next.indexOf(event.key) !== -1) { // >
                    this.nextSong()
                } else if (this.options.keyboardTriggers.pause.indexOf(event.key) !== -1) { // [>]
                    this.pauseResume()
                } else {
                    this.notify('info', 'key "' + event.key + '" is not handled yet')
                }
            },
            getWebId: function () {
                var id = ''
                id += navigator.userAgent.match(/Chrome\/(\d\d)/)[0].replace('/', ' ')
                id += ' (' + navigator.platform + ')'
                id += ' [' + navigator.language + ']'
                return id
            },
            musicIs: function (musicIs) {
                if (musicIs === 'bad' || musicIs === 'next') {
                    this.isLoading = true
                    this.song.waitingForNext = true
                    this.resetProgressBar()
                    if (this.player) {
                        this.player.pause()
                    }
                }
                this.socket.emit('music is', musicIs)
            },
            nextSong: function (event) {
                this.avoidNextSound = true
                this.musicIs('next')
                let msg = 'next asked from ' + this.getWebId() + ' because of '
                msg += (event && event.type) ? event.type : 'unknown event'
                this.socket.emit('event', msg)
            },
            pauseResume: function () {
                if (this.options.audioClientSide) {
                    if (this.player.paused) {
                        this.options.doAutoplay = true
                        // console.debug('player.play (pauseResume)');
                        this.player.play()
                        this.notify('info', 'song  was paused, resuming...')
                        setTimeout(this.setProgressBar, 100)
                    } else {
                        // console.debug('player.pause (pauseResume)');
                        this.player.pause()
                        this.options.doAutoplay = false
                        this.notify('info', 'song  was playing, do pause')
                    }
                }
            },
            notify: function (action, message, type, withSound) {
                /* eslint-disable no-console */
                if (type && this.options.doToastNotifications) {
                    if (['success', 'info', 'alert'].indexOf(type) !== -1) {
                        this.toast(type, action, message)
                    } else {
                        this.toast('alert', 'Error', 'cannot toast type "' + type + '"')
                        console.error('cannot toast type "' + type + '"')
                    }
                }
                if (withSound && this.options.doSoundNotifications) {
                    if (this.avoidNextSound) {
                        this.avoidNextSound = false
                    } else {
                        if (action.indexOf('keep') !== -1 || message.indexOf('next') !== -1) {
                            this.playSound('ok')
                        } else {
                            this.playSound('notification')
                        }
                    }
                }
                if (console[action.toLowerCase()]) {
                    console[action.toLowerCase()](message)
                } else {
                    // in order to align logs :p
                    while (action.length < 9) {
                        action += ' '
                    }
                    console.log(action + ' : ' + message)
                }
                /* eslint-enable no-console */
            },
            toast: function (type, title, message, delay) {
                var shouldNotToast = false
                // check if toast is a twin of last one
                if (this.toaster.lastOne.timestamp) {
                    var secondsSinceLastOne = this.getTimestamp() - this.toaster.lastOne.timestamp
                    var contentVaryWithLastOne = (type + title + message) !== this.toaster.lastOne.message
                    shouldNotToast = (secondsSinceLastOne <= 2) && !contentVaryWithLastOne
                }
                // avoid toasting if needed
                if (shouldNotToast) {
                    return
                }
                // do toast
                this.toaster.stack.push({
                    type: type,
                    title: title,
                    message: message,
                    delay: (delay || 4000)
                })
                // to check with the next one
                this.toaster.lastOne.timestamp = this.getTimestamp()
                this.toaster.lastOne.message = (type + title + message)
            },
            initServiceWorker: function () {

                if (document.location.protocol.indexOf('https') === -1) {
                    // avoid error when trying to init a service worker on non https connection
                    return
                }

                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.register('service-worker.js').then((registration) => {
                        // Registration was successful
                        this.notify('Info', 'ServiceWorker registration successful with scope')
                        console.log(registration.scope) // eslint-disable-line no-console
                    }).catch((err) => {
                        // registration failed :(
                        this.notify('Error', 'ServiceWorker registration failed')
                        console.error(err) // eslint-disable-line no-console
                    })
                }
            },
            cron: function () {
                // console.log('in cron');
                if (this.isPlaying && !this.song.hasBeenMarked) {
                    var secondsLeft = this.getSecondsLeft()
                    if ([34, 21, 13, 8, 5].indexOf(secondsLeft) !== -1) {
                        this.notify('Hey', 'Song end in ' + secondsLeft + ' seconds', 'info', true)
                    }
                }
            },
            updateEndpointAddress: function () {
                var doPointToHttps = this.options.endpoint.address.indexOf('https') !== -1
                this.options.endpoint.port = doPointToHttps ? 1444 : 1404
                this.initSocket()
                this.setStorage()
            },
            guessDefaultEndpoint: function () {

                var host = document.location.hostname // "192.168.31.12" | "musitop.io" | "shuunen.github.io"
                var protocol = document.location.protocol // "http:" | "https:"
                if (host === 'shuunen.github.io') {
                    // if user is using github hosted client, we can imagine server is on his localhost : musitop.io
                    // and serving https content, no other choice if you use https shuunen.github.io
                    // you need to use https distant server, and if you want to use http shuunen.github.io, you can't :D
                    this.options.endpoint.address = 'https://musitop.io'
                } else {
                    // if user is using is own client, he can either use https or http version
                    this.options.endpoint.address = protocol + '//' + host
                }

                this.updateEndpointAddress()
            },
            getSecondsLeft: function () {
                try {
                    return Math.round(this.song.duration - this.player.currentTime)
                } catch (error) {
                    return 0
                }
            },
            getJson: function (url, success) {
                var request = new XMLHttpRequest()
                request.onload = (event) => {
                    var req = event.target
                    if (req.status >= 200 && req.status < 400) {
                        var data = JSON.parse(req.response)
                        success(data)
                    } else {
                        request.onerror()
                    }
                }
                request.onerror = () => {
                    this.notify('Error', 'GET ' + url + ' failed', 'alert')
                }
                url = this.getEndpointUrl() + url
                // this.notify('info', 'will get json from "' + url + '"');
                request.open('get', url, true)
                request.send()
            },
            getServerVersion: function () {
                // this.notify('info', data);
                this.getJson('/server/version', (data) => {
                    this.server.version = data.version
                })
            },
            updateServer: function () {
                this.getJson('/server/update', this.updateHandler)
            },
            updateClient: function () {
                this.getJson('/client/update', this.updateHandler)
            },
            updateHandler: function (data) {
                // this.notify('info', data);
                if (data.error) {
                    this.notify('Error', 'git pull failed', 'alert', true)
                    this.notify('Error', data.error)
                } else if (data.changes === 'none') {
                    this.notify('Info', this.firstCap(data.target) + ' already at latest version', 'info')
                } else if (data.changes) {
                    this.notify('Info', this.firstCap(data.target) + ' updated to latest version', 'success', true)
                    // this.getServerVersion(); // no need because if server update & restart, onConnection will getServerVersion
                    if (data.target === 'client') {
                        this.notify('Info', 'Restarting...', 'success')
                        setTimeout(this.restart, 2000)
                    }
                } else {
                    this.notify('Info', 'un-handled case in updateHandler')
                }
            },
            restart: function () {
                document.location.href = document.location.href
            },
            firstCap: function (str) {
                str = (str + '')
                str = str.toLowerCase()
                str = str[0].toUpperCase() + str.slice(1)
                return str
            },
            playSound: function (type) {
                this.pickOne(this.sounds[type]).play()
            },
            intBetween: (min, max) => Math.floor(Math.random() * (max - min + 1) + min),
            shuffle: (arr) => arr.sort(() => (4 * Math.random() > 2) ? 1 : -1),
            pickOne: function (arr) {
                return this.shuffle(arr)[this.intBetween(0, arr.length - 1)]
            }
        },
        mounted() {
            this.notify('info', this.app.name + ' init')
            this.getStorage()
            this.initKeyboard()
            this.initServiceWorker()
            setInterval(this.cron, 1000)
        }
    })
}
