const colors = require('./constants').colors;
const states = require('./constants').states;
const easymidi = require('easymidi');
const EventEmitter = require('events');


class LaunchpadManager extends EventEmitter {
    constructor(portNames) {
        super();

        this.pages = [];
        this.addPage();
        this.activePage = 0;

        this.input = new easymidi.Input(portNames.input);
        this.output = new easymidi.Output(portNames.output);

        this.input.on('noteon', (params) => {
            this.buttonPressHandler(params)
        });
        this.input.on('cc', (params) => {
            this.buttonPressHandler(params)

        });
    }

    buttonPressHandler(params) {
        let button, state;

        if (params.controller) {
            button = 'T' + (params.controller - 104);
            state = params.value ? "buttonPressed" : "buttonReleased";
        } else {
            state = params.velocity ? "buttonPressed" : "buttonReleased";
            button = params.note % 10 < 9 ?
                '' + ((params.note / 10 << 0) - 1) + (params.note % 10 - 1) :
                'R' + ((params.note / 10 << 0) - 1);
        }
        this.emit(state, button);
        this.emit(button, state);
    }

    buttonToNote(button) {
        if (button[0] == 'T')
            return parseInt(button[1]) + 104;

        if (button[0] == 'R')
            button = button[1] + 8;

        return parseInt(button) + 11;
    }

    addPage() {
        let page = {};

        for (let x = 0; x < 9; x++) {
            let xx = x == 8 ? "R" : x;

            for (let y = 0; y < 9; y++) {
                let yy = y == 8 ? "T" : y;

                page["" + x + y] = {
                    state: states.normal,
                    color: 0,
                    color2: 0
                };
            }
        }
        delete page.TR;

        this.pages.push(page);
        return this.pages.length - 1;
    }

    set(options) {
        options.page = options.page || this.activePage;

        Object.assign(this.pages[options.page][options.button], options);
        this.activePage == options.page && this.sendButton(options.page, options.button);
    }

    sendButton(page, button) {
        const data = this.pages[page][button];
        switch (data.state) {
            case states.normal:
                this.setColor(button, data.color);
                break;

            case states.flash:
                this.flashColor(button, data.color, data.color2)
                break;

            case states.pulse:
                this.pulseColor(button, data.color, data.color2)
                break;

            case states.rgb:
            	this.setRgbColor(button, data.color);
            	break;

            default:
                break;
        }
    }

    setActivePage(page) {
        this.activePage = page;
        Object.keys(this.pages[page]).forEach(button => {
            this.sendButton(page, button);
        });
    }

    sendSysEx(bytes) {
        const message = [240, 0, 32, 41, 2, 16];
        bytes.forEach(byte => message.push(byte));
        message.push(247);
        this.output.send('sysex', message);
    }

    sendMidi(button, state, color, color2) {
        button = '' + button;

        color2 && this.sendMidi(button, states.normal, color2);

        const mode = button[0] === 'T' ? 'cc' : 'noteon';
        const data = {
            channel: state
        };
        if (mode === 'cc') {
            data.value = color;
            data.controller = this.buttonToNote(button);
        } else {
            data.velocity = color;
            data.note = this.buttonToNote(button);
        }

        this.output.send(mode, data);
    }

    flashColor(button, color, color2) {
        this.sendMidi(button, states.flash, color, color2);
    }

    pulseColor(button, color, color2) {
        this.sendMidi(button, states.pulse, color, color2);
    }

    setRgbColor(button, rgb) {
        this.sendSysEx([11, this.buttonToNote(button), rgb[0], rgb[1], rgb[2]]);
    }

    setColor(button, color) {
        this.sendMidi(button, states.normal, color);
    }

    turnOff(button) {
        this.sendMidi(button, states.normal, colors.off);
    }
}

module.exports = LaunchpadManager;