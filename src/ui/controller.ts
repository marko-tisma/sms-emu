import { Cpu } from "../cpu";

enum Button {
    UP, DOWN, LEFT, RIGHT, A, B
}

export class Controller {

    // Bit set to 0 while button is pressed and to 1 otherwise
    pressedState = 0xff;

    constructor(private cpu: Cpu) {
        this.initListeners();
    }

    buttonBit: {[key in Button]: number} = {
        [Button.UP]: 0,
        [Button.DOWN]: 1,
        [Button.LEFT]: 2,
        [Button.RIGHT]: 3,
        [Button.A]: 4,
        [Button.B]: 5,
    } 

    keyMap: {[key: string]: Button} = {
        'ArrowUp': Button.UP,
        'ArrowDown': Button.DOWN,
        'ArrowLeft': Button.LEFT,
        'ArrowRight': Button.RIGHT,
        'z': Button.A,
        ' ': Button.A,
        'x': Button.B,
    }

    initListeners() {
        document.addEventListener('keydown', (e) => {
            const key = e.key;
            if (!this.keyMap[key]) return;
            const button = this.keyMap[key];
            this.pressed(button);
        });
        document.addEventListener('keyup', (e) => {
            const key = e.key;
            if (!this.keyMap[key]) return;
            const button = this.keyMap[key];
            this.released(button);
        });
    }

    pressed(button: Button) {
        const mask = ~(1 << this.buttonBit[button]);
        this.pressedState &= mask;
        this.outState();
    }

    released(button: Button) {
        const mask = 1 << this.buttonBit[button];
        this.pressedState |= mask;
        this.outState();
    }

    outState() {
        this.cpu.bus.out(0xdc, this.pressedState);
    }

}