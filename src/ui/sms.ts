import { Bus } from "../bus";
import { Cartridge } from "../cartridge";
import { Cpu } from "../cpu";
import { Vdp } from "../vdp";
import { Debugger } from "./debugger";

import "./style.css";

// const romUrl = 'http://localhost:3000/rom/test/zexdoc.out';
// const romUrl = 'http://localhost:3000/rom/test/HelloWorld.sms';
// const romUrl = 'http://localhost:3000/rom/ZEX/zexdoc.sms';
const romUrl = 'http://localhost:3000/rom/bios13.sms';
// const romUrl = 'http://localhost:3000/rom/jpbios.sms';
// const romUrl = 'http://localhost:3000/rom/smsproto.sms';
// const romUrl = 'http://localhost:3000/rom/alex_kidd_bios.sms'
// const romUrl = 'http://localhost:3000/rom/sonbios.sms';
// const romUrl = 'http://localhost:3000/rom/sonic.sms';
// const romUrl = 'http://localhost:3000/rom/z80test/z80doc.asm';
let sms;
start(romUrl);

async function start(romUrl: string) {
	const rom = await loadRomFromServer(romUrl);
	console.log(rom.length);
	sms = new Sms(rom);
	sms.animationRequest = requestAnimationFrame(sms.runFrame);
}

async function loadRomFromServer(url: string) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`File ${url} doesn't exist`);
	}
	const blob = await response.blob();
	return new Uint8Array(await blob.arrayBuffer());
}
export class Sms {
	static CPU_CLOCK = 3579540;
	// static TSTATES_PER_FRAME = Math.ceil(Sms.CPU_CLOCK / 60);
	static TSTATES_PER_FRAME = 59736;

	cpu: Cpu;
	bus: Bus;
	vdp: Vdp;
	debugger: Debugger;

	animationRequest = 0;
	running = false;

	canvas: HTMLCanvasElement;

	keyMask = 0xff;
	tstatesFromLastFrame = 0;

	constructor(rom: Uint8Array) {
		this.canvas = document.querySelector('#screen')!;
		this.vdp = new Vdp(this.canvas);
		this.bus = new Bus(new Cartridge(rom), this.vdp);
		this.cpu = new Cpu(this.bus);
		this.debugger = new Debugger(this);
		this.debugger.breakpoints.add(0);
		this.running = true;
		this.initKeyListeners();
		this.bus.out(0xdc, this.keyMask);
		this.bus.out(0xdd, this.keyMask);
		this.bus.out(0x3e, 0xc0);
	}

	runFrame = (timestamp: DOMHighResTimeStamp) => {
		if (!this.running) return;
		let tstatesElapsed = this.tstatesFromLastFrame;
		while (tstatesElapsed < Sms.TSTATES_PER_FRAME) {
			if (this.debugger.breakpoints.has(this.cpu.pc)) {
				this.running = false;
				this.debugger.update();
				return;
			}
			const tstates = this.cpu.step();
			tstatesElapsed += tstates;
			this.vdp.runOld(tstates);
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
				case 'ArrowUp':
				case 'w':
					this.keyMask &= ~1;
					break;
				case 'ArrowDown':
				case 's':
					this.keyMask &= ~2;
					break;
				case 'ArrowLeft':
				case 'a':
					this.keyMask &= ~4;
					break;
				case 'ArrowRight':
				case 'd':
					this.keyMask &= ~8;
					break;
				case 'x':
				case ' ':
					this.keyMask &= ~16;
					break;
				case 'z':
					this.keyMask &= ~32;
					break;
				default:
					break;
			}
			this.bus.out(0xdc, this.keyMask);
		});
		document.addEventListener('keyup', (e) => {
			switch (e.key) {
				case 'ArrowUp':
				case 'w':
					this.keyMask |= 1;
					break;
				case 'ArrowDown':
				case 's':
					this.keyMask |= 2;
					break;
				case 'ArrowLeft':
				case 'a':
					this.keyMask |= 4;
					break;
				case 'ArrowRight':
				case 'd':
					this.keyMask |= 8;
					break;
				case 'x':
				case ' ':
					this.keyMask |= 16;
					break;
				case 'z':
					this.keyMask |= 32;
					break;
				default:
					break;
			}
			this.bus.out(0xdc, this.keyMask);
		});
	}
}