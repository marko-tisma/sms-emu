import { Sms } from "./sms";

enum Button {
    UP, DOWN, LEFT, RIGHT, A, B
}

export class Joystick {

    // Bit set to 0 while button is pressed and to 1 otherwise
    pressedState = 0xff;
    port = 0xdc;

    pauseButtons = new Set(['p', 'Enter']);

    keyMap: { [key: string]: Button } = {
        'ArrowUp': Button.UP,
        'ArrowDown': Button.DOWN,
        'ArrowLeft': Button.LEFT,
        'ArrowRight': Button.RIGHT,
        'z': Button.A,
        ' ': Button.A,
        'x': Button.B,
    }

    private buttonStateBit: { [key in Button]: number } = {
        [Button.UP]: 0,
        [Button.DOWN]: 1,
        [Button.LEFT]: 2,
        [Button.RIGHT]: 3,
        [Button.A]: 4,
        [Button.B]: 5,
    }

    constructor(private sms: Sms) { }

    press(key: string): void {
        if (this.pauseButtons.has(key)) this.sms.cpu.pausePressed = true;
        const button = this.keyMap[key];
        if (button === undefined) return;
        this.pressedState &= ~(1 << this.buttonStateBit[button]);
        this.sms.bus.out(this.port, this.pressedState);
    }

    release(key: string): void {
        const button = this.keyMap[key];
        if (button === undefined) return;
        this.pressedState |= 1 << this.buttonStateBit[button];
        this.sms.bus.out(this.port, this.pressedState);
    }

}