# Musitop client

It will allow you to listen & control a [Musitop](https://github.com/Shuunen/musitop) server.

<img src="http://imgur.com/7d8HRLUl.png" width="640">

## Huge thanks

* Anastasya-Bolshakova : for [pretty icons](https://www.iconfinder.com/nastu_bol)
* Csspin : for [loader inspiration](https://github.com/webkul/csspin)
* Es-lint : for [keeping the code clean](http://eslint.org/)
* Google Lighthouse : for giving good insights about [web app optimization](https://developers.google.com/web/tools/lighthouse/)
* Grade : for the [color extraction lib](https://github.com/benhowdle89/grade)
* Icons-Mind : for [pretty icons](https://www.iconfinder.com/iconsmind)
* Jason Csizmadi : for [design inspiration](https://dribbble.com/shots/1012466-Tyco-Music-player)
* Paomedia : for [pretty icons](https://www.iconfinder.com/paomedia)
* Socket IO : for their [web socket lib that's great to use](http://socket.io/) <3
* SvgOmg : for their [amazing web app to optimize svg](https://jakearchibald.github.io/svgomg/) <3
* VueJs : for their [amazing javascript framework](https://vuejs.org/) <3


## Still to do

* handle media session https://developers.google.com/web/updates/2017/02/media-session
* configure Service Worker that responds with a 200 when offline
* manifest should contains background_color, theme_color & icons at least 192px
* add meta name theme-color tag
* try to re-use img tag (actually 3 img with v-bind:src)
* create vue components if needed
* handle case when MediaNext (for example) is pressed on the web client but will also trigger system
* handle case when server shut down, avoid letting client playing or loading
* improve mobile experience, FPS when rendering
* handle last music action, like a dropdown that will act on n-1 song : was good, was bad
* add options modal to let user choose : audio output [client|none|server], playing songs from [good|test] folder
* add a gif demo usage
* add desktop notifications like http://singhharkirat.com/notification-logger/
