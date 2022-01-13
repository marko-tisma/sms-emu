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
	vdp: Vdp;
	debugger: Debugger;

	animationRequest = 0;
	running = false;

	constructor(rom: Uint8Array) {
		this.vdp = new Vdp(document.querySelector('#screen')!);
		const bus = new Bus(new Cartridge(rom), this.vdp);
		this.cpu = new Cpu(bus);
		this.debugger = new Debugger(this);
		this.debugger.breakpoints.add(0);
		this.running = true;
	}

	runFrame = (timestamp: DOMHighResTimeStamp) => {
		if (!this.running) return;
		let tstatesElapsed = 0;
		while (tstatesElapsed < Sms.TSTATES_PER_FRAME) {
			if (this.debugger.breakpoints.has(this.cpu.pc)) {
				this.running = false;
				this.debugger.update();
				return;
			}
			const tstates = this.cpu.step();
			tstatesElapsed += tstates;
			this.vdp.run(tstates);
		}
		console.log(`elapsed: ${performance.now() - timestamp}`);
		this.animationRequest = requestAnimationFrame(this.runFrame);
	}
}