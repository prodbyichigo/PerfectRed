// Pretty standard
// Chalk.js wasnt working so we wil use this to color our stuff

function stdcout(txt, color='white') {
    color = color.toLowerCase();

    const colorMap = {
        black: '\x1b[30m',
        red: '\x1b[31m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        magenta: '\x1b[35m',
        cyan: '\x1b[36m',
        white: '\x1b[37m',

        brightblack: '\x1b[90m',
        brightred: '\x1b[91m',
        brightgreen: '\x1b[92m',
        brightyellow: '\x1b[93m',
        brightblue: '\x1b[94m',
        brightmagenta: '\x1b[95m',
        brightcyan: '\x1b[96m',
        brightwhite: '\x1b[97m',

        reset: '\x1b[0m'
    };

    const keywords = ['[Server]', '[Database]'];
    for (const kw of keywords) {
        txt = txt.split(kw).join(colorMap.brightcyan + kw + colorMap[color] || colorMap.white);
    }

    if (colorMap[color]) {
        console.log(colorMap[color] + txt + colorMap.reset);
    } else {
        console.log(colorMap.brightred + 'Critical Code error in', __filename, '!', ': stdcout used incorrectly!' + colorMap.reset);
    }
}

module.exports = stdcout;
