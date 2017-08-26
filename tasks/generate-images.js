
const jimp = require('jimp')
const extension = 'png'
// $ will be replaced with the numeric size
const files = [
    {
        sizes: [192, 144, 96, 72, 48, 36],
        name: 'android-$x$'
    },
    {
        sizes: [512, 192],
        name: 'android-$x$'
    },
    {
        sizes: [32, 16],
        name: 'favicon-$x$'
    }
]
const inputLogo = 'icons/logo-2.png'
const outputDir = 'static/img/icons'

// TODO : should also handle favicon generation

jimp.read(inputLogo)
    .then(logo => {

        files.forEach(file => {
            let logoClone = logo.clone()
            file.sizes.forEach(size => logoClone.resize(size, size).write(outputDir + '/' + file.name.replace(/\$/g, size) + '.' + extension))
        })
    })
    .catch(err => console.error(err)) // eslint-disable-line no-console
