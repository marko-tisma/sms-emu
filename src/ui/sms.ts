import { Bus } from "../bus";
import { Cartridge } from "../cartridge";
import { Cpu } from "../cpu";
import { Vdp } from "../vdp";
import { Debugger } from "./debugger";

export class Sms {
	// Timing information taken from https://www.smspower.org/forums/8161-SMSDisplayTiming
	static readonly CPU_CLOCK_NTSC = 3579545;
	static readonly FPS_NTSC = 59.9224;
	static readonly TSTATES_PER_FRAME = Math.round(Sms.CPU_CLOCK_NTSC / Sms.FPS_NTSC);

	cpu: Cpu;
	bus: Bus;
	vdp: Vdp;
	debugger: Debugger;

	running = false;
	animationRequest = 0;
	controllerMaskA = 0xff;
	tstatesFromLastFrame = 0;
	canvas: HTMLCanvasElement;

	constructor(rom: Uint8Array) {
		this.canvas = document.querySelector('#screen')!;
		this.vdp = new Vdp(this.canvas);
		this.bus = new Bus(new Cartridge(rom), this.vdp);
		this.cpu = new Cpu(this.bus);
		this.debugger = new Debugger(this);
		this.debugger.breakpoints.add(0);
		this.initKeyListeners();
		this.running = true;
	}

	runFrame = (timestamp: DOMHighResTimeStamp) => {
		if (!this.running) return;
		let tstatesElapsed = this.tstatesFromLastFrame;
		while (tstatesElapsed < Sms.TSTATES_PER_FRAME) {
			if (this.debugger.breakpoints.has(this.cpu.pc)) {
				this.running = false;
				this.debugger.showDebug();
				this.debugger.update();
				return;
			}
			const tstates = this.cpu.step();
			tstatesElapsed += tstates;
			this.vdp.update(tstates);
		}
		this.tstatesFromLastFrame = tstatesElapsed - Sms.TSTATES_PER_FRAME;
		const fps = 1000 / Math.max(1000 / 60, performance.now() - timestamp);
		document.querySelector('#fps')!.innerHTML = `FPS: ${fps.toString().substring(0, 5)}`;
		// console.log(`elapsed: ${performance.now() - timestamp}`);
		this.animationRequest = requestAnimationFrame(this.runFrame);
	}

	initKeyListeners() {
		document.addEventListener('keydown', (e) => {
			switch (e.key) {
				case 'p':
					this.cpu.resetRequested = true;
					break;
				case 'ArrowUp':
				case 'w':
					this.controllerMaskA &= ~1;
					break;
				case 'ArrowDown':
				case 's':
					this.controllerMaskA &= ~2;
					break;
				case 'ArrowLeft':
				case 'a':
					this.controllerMaskA &= ~4;
					break;
				case 'ArrowRight':
				case 'd':
					this.controllerMaskA &= ~8;
					break;
				case 'x':
				case ' ':
					this.controllerMaskA &= ~16;
					break;
				case 'z':
					this.controllerMaskA &= ~32;
					break;
				default:
					break;
			}
			this.bus.out(0xdc, this.controllerMaskA);
		});

		document.addEventListener('keyup', (e) => {
			switch (e.key) {
				case 'ArrowUp':
				case 'w':
					this.controllerMaskA |= 1;
					break;
				case 'ArrowDown':
				case 's':
					this.controllerMaskA |= 2;
					break;
				case 'ArrowLeft':
				case 'a':
					this.controllerMaskA |= 4;
					break;
				case 'ArrowRight':
				case 'd':
					this.controllerMaskA |= 8;
					break;
				case 'x':
				case ' ':
					this.controllerMaskA |= 16;
					break;
				case 'z':
					this.controllerMaskA |= 32;
					break;
				default:
					break;
			}
			this.bus.out(0xdc, this.controllerMaskA);
		});
	}
}