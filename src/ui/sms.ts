import { Cpu } from "../cpu";
import { Controller } from "./controller";
import { Debugger } from "./debugger";

export class Sms {

    // Timing information taken from https://www.smspower.org/forums/8161-SMSDisplayTiming
    static readonly CPU_CLOCK = 3579545;
	static readonly FPS = 59.9224;
	static readonly TSTATES_PER_FRAME = Math.round(Sms.CPU_CLOCK / Sms.FPS);

	debugger: Debugger;
	controller: Controller;

	running = false;
	tstatesFromLastFrame = 0;

	constructor(public cpu: Cpu) {
		this.debugger = new Debugger(this);
		this.controller = new Controller(cpu);
	}

	runFrame = (timestamp: DOMHighResTimeStamp) => {
		if (!this.running) return;

		let tstatesElapsed = this.tstatesFromLastFrame;
		while (tstatesElapsed < Sms.TSTATES_PER_FRAME) {
			if (this.debugger.checkBreakpoint(this.cpu.pc)) return;

			const tstates = this.cpu.step();
			tstatesElapsed += tstates;

			this.cpu.bus.sound.update(tstates);
			this.cpu.bus.vdp.update(tstates);
		}
		this.tstatesFromLastFrame = tstatesElapsed - Sms.TSTATES_PER_FRAME;
		this.updateFps(timestamp);

		requestAnimationFrame(this.runFrame);
	}

	updateFps(frameStart: DOMHighResTimeStamp) {
		const fps = 1000 / Math.max(1000 / 60, performance.now() - frameStart);
		document.querySelector('#fps')!.innerHTML = `FPS: ${fps.toString().substring(0, 5)}`;
	}

}