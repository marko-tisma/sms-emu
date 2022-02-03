import { Bus } from "../bus";
import { Cartridge } from "../cartridge";
import { Cpu } from "../cpu";
import { Sound } from "../sound";
import { Vdp } from "../vdp";
import { Controller } from "./controller";
import { Debugger } from "./debugger";


export class Sms {

	// Timing information taken from https://www.smspower.org/forums/8161-SMSDisplayTiming
	static readonly CPU_CLOCK = 3579545;
	static readonly TSTATES_PER_FRAME = 59736;

	cpu: Cpu;
	bus: Bus;
	sound: Sound;
	vdp: Vdp;

	debugger: Debugger;
	controller: Controller;

	running = false;
	tstatesFromLastFrame = 0;
	animationRequestId = 0;

	constructor(
		rom: Uint8Array, frameBuffer: Uint8ClampedArray, drawFrame: Function,
		audioBuffer: Float32Array, playAudio: Function, sampleRate=44100
	) {
		this.vdp = new Vdp(frameBuffer, drawFrame);
		this.sound = new Sound(audioBuffer, playAudio, sampleRate);
		this.bus = new Bus(new Cartridge(rom), this.vdp, this.sound);
		this.cpu = new Cpu(this.bus);
		this.debugger = new Debugger(this);
		this.controller = new Controller(this);
	}

	emulateFrame = (timestamp: DOMHighResTimeStamp): void => {
		if (!this.running) return;

		let tstatesElapsed = this.tstatesFromLastFrame;
		while (tstatesElapsed < Sms.TSTATES_PER_FRAME) {
			if (this.debugger.breakpoints.has(this.cpu.pc)) {
				this.debugger.startDebug();
				return;
			}

			const tstates = this.cpu.step();
			tstatesElapsed += tstates;
			this.cpu.bus.sound.update(tstates);
			this.cpu.bus.vdp.update(tstates);
		}
		this.tstatesFromLastFrame = tstatesElapsed - Sms.TSTATES_PER_FRAME;
		this.updateFps(timestamp);

		this.animationRequestId = requestAnimationFrame(this.emulateFrame);
	}

	run(): void {
		if (this.running) return;
		this.running = true;
		this.debugger.hideDebugUi();
		this.animationRequestId = requestAnimationFrame(this.emulateFrame);
	}

	updateFps(frameStart: DOMHighResTimeStamp): void {
		const fps = 1000 / Math.max(1000 / 60, performance.now() - frameStart);
		document.querySelector('#fps')!.innerHTML = `FPS: ${fps.toString().substring(0, 5)}`;
	}

}