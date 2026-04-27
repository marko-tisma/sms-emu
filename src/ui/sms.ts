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
	timing: Timing;
	tstatesFromLastFrame = 0;
	animationRequestId = 0;
	lastTimestamp = 0;
	tstatesPerMs: number;

	constructor(
		rom: Uint8Array, videoMode: VideoMode,   
		frameBuffer: Uint8ClampedArray, drawFrame: Function,
		audioBuffer: Float32Array, playAudio: Function, sampleRate=44100
	) {
		this.timing = videoMode === VideoMode.NTSC ? Sms.ntscTiming : Sms.palTiming;
		this.tstatesPerMs = this.timing.tstatesPerFrame * this.timing.fps / 1000;
		this.vdp = new Vdp(videoMode, frameBuffer, drawFrame, this.timing);
		this.sound = new Sound(sampleRate, audioBuffer, playAudio, this.timing);
		this.bus = new Bus(new Cartridge(rom), this.vdp, this.sound);
		this.cpu = new Cpu(this.bus);
		this.debugger = new Debugger(this);
		this.joystick = new Joystick(this);
	}

	emulateFrame = (timestamp: DOMHighResTimeStamp): void => {
		if (!this.running) return;

		if (this.lastTimestamp === 0) {
			this.lastTimestamp = timestamp;
			this.animationRequestId = requestAnimationFrame(this.emulateFrame);
			return;
		}

		let deltaMs = timestamp - this.lastTimestamp;
		this.lastTimestamp = timestamp;

		// Cap to avoid spiral of death after tab suspension or long pauses
		const maxMs = 1000 / this.timing.fps * 2;
		if (deltaMs > maxMs) deltaMs = maxMs;

		const tstatesToEmulate = deltaMs * this.tstatesPerMs + this.tstatesFromLastFrame;
		let tstatesElapsed = 0;
		while (tstatesElapsed < tstatesToEmulate) {
			if (this.debugger.breakpoints.has(this.cpu.pc)) {
				this.debugger.startDebug();
				return;
			}

			const tstates = this.cpu.step();
			tstatesElapsed += tstates;
			this.cpu.bus.sound.update(tstates);
			this.cpu.bus.vdp.update(tstates);
		}
		this.tstatesFromLastFrame = tstatesElapsed - tstatesToEmulate;
		this.updateFps(timestamp);
		this.animationRequestId = requestAnimationFrame(this.emulateFrame);
	}

	run(): void {
		if (this.running) return;
		this.running = true;
		this.lastTimestamp = 0;
		this.tstatesFromLastFrame = 0;
		this.debugger.hideDebugUi();
		this.animationRequestId = requestAnimationFrame(this.emulateFrame);
	}

	updateFps(frameStart: DOMHighResTimeStamp): void {
		const fps = 1000 / Math.max(1000 / this.timing.fps, performance.now() - frameStart);
		document.querySelector('#fps')!.innerHTML = `FPS: ${fps.toString().substring(0, 5)}`;
	}

}