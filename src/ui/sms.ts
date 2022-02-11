import { Bus } from "../bus";
import { Cartridge } from "../cartridge";
import { Cpu } from "../cpu";
import { Sound } from "../sound";
import { Vdp } from "../vdp";
import { Joystick } from "./joystick";
import { Debugger } from "./debugger";


export enum VideoMode {
	NTSC, PAL
}

export interface Timing {
	fps: number
	cpuClock: number,
	tstatesPerFrame: number,
	scanlinesPerFrame: number,
	tstatesPerScanline: number
}
export class Sms {

	// Timing information taken from https://www.smspower.org/forums/8161-SMSDisplayTiming
	static ntscTiming = {
		fps: 60,
		cpuClock: 3579545,
		tstatesPerFrame: 59736,
		scanlinesPerFrame: 262,
		tstatesPerScanline: 228,
	}

	static palTiming = {
		fps: 50,
		cpuClock: 3546895,
		tstatesPerFrame: 70937,
		scanlinesPerFrame: 313,
		tstatesPerScanline: 227
	}

	cpu: Cpu;
	bus: Bus;
	sound: Sound;
	vdp: Vdp;
	debugger: Debugger;
	joystick: Joystick;

	running = false;
	frameSpeed: number;
	timing: Timing;
	tstatesFromLastFrame = 0;
	animationRequestId = 0;

	constructor(
		rom: Uint8Array, videoMode: VideoMode,   
		frameBuffer: Uint8ClampedArray, drawFrame: Function,
		audioBuffer: Float32Array, playAudio: Function, sampleRate=44100
	) {
		this.timing = videoMode === VideoMode.NTSC ? Sms.ntscTiming : Sms.palTiming;
		this.frameSpeed = this.timing.fps / 60;
		this.vdp = new Vdp(videoMode, frameBuffer, drawFrame, this.timing);
		this.sound = new Sound(sampleRate, audioBuffer, playAudio, this.timing);
		this.bus = new Bus(new Cartridge(rom), this.vdp, this.sound);
		this.cpu = new Cpu(this.bus);
		this.debugger = new Debugger(this);
		this.joystick = new Joystick(this);
	}

	emulateFrame = (timestamp: DOMHighResTimeStamp): void => {
		if (!this.running) return;

		let tstatesElapsed = this.tstatesFromLastFrame;
		const tstatesThisFrame = this.timing.tstatesPerFrame * this.frameSpeed;
		while (tstatesElapsed < tstatesThisFrame) {
			if (this.debugger.breakpoints.has(this.cpu.pc)) {
				this.debugger.startDebug();
				return;
			}

			const tstates = this.cpu.step();
			tstatesElapsed += tstates;
			this.cpu.bus.sound.update(tstates);
			this.cpu.bus.vdp.update(tstates);
		}
		this.tstatesFromLastFrame = tstatesElapsed - tstatesThisFrame;
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
		const fps = 1000 / Math.max(1000 / this.timing.fps, performance.now() - frameStart);
		document.querySelector('#fps')!.innerHTML = `FPS: ${fps.toString().substring(0, 5)}`;
	}

}