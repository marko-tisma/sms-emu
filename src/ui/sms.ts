import { Bus } from "../bus";
import { Cartridge } from "../cartridge";
import { Cpu } from "../cpu";
import { Vdp } from "../vdp";
import { Debugger } from "./debugger";

import "./style.css";

// const romUrl = 'http://localhost:3000/rom/test/zexdoc.out';
// const romUrl = 'http://localhost:3000/rom/test/HelloWorld.sms';
const romUrl = 'http://localhost:3000/rom/ZEX/zexdoc.sms';
// const romUrl = 'http://localhost:3000/rom/bios13.sms';
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
	static TSTATES_PER_FRAME = Math.floor(Sms.CPU_CLOCK / 60);

	cpu: Cpu;
	vdp: Vdp;

	canvas: HTMLCanvasElement;
	imageData: ImageData;
	width = 256;
	height = 192;
	canvasScale = 2;
	debugger: Debugger;

	animationRequest = 0;

	constructor(rom: Uint8Array) {
		this.canvas = document.querySelector('#screen')!;
		this.canvas.width = this.width * this.canvasScale;
		this.canvas.height = this.height * this.canvasScale;
		const ctx = this.canvas.getContext('2d')!;
		this.imageData = ctx.createImageData(this.width, this.height);
		this.imageData.data.fill(0xff);
		ctx.putImageData(this.imageData, 0, 0);
		ctx.drawImage(ctx.canvas, 0, 0, ctx.canvas.width * this.canvasScale, ctx.canvas.height * this.canvasScale);
		this.vdp = new Vdp(this.imageData.data);
		const bus = new Bus(new Cartridge(rom), this.vdp);
		this.cpu = new Cpu(bus);
		this.debugger = new Debugger(this);
		this.debugger.breakpoints.add(0);
	}

	runFrame = (timestamp: DOMHighResTimeStamp) => {
		let tstatesElapsed = 0;
		while (tstatesElapsed < Sms.TSTATES_PER_FRAME) {
			if (this.debugger.breakpoints.has(this.cpu.pc)) {
				cancelAnimationFrame(this.animationRequest);
				this.debugger.update();
				return;
			}
			const tstates = this.cpu.step();
			tstatesElapsed += tstates;
			this.vdp.run(tstates);
		}
		this.renderFrame();
		console.log(`elapsed: ${performance.now() - timestamp}`);
		this.animationRequest = requestAnimationFrame(this.runFrame);
	}

	renderFrame() {
		const ctx = this.canvas.getContext('2d')!;
		ctx.putImageData(this.imageData, 0, 0);
		ctx.drawImage(ctx.canvas, 0, 0, ctx.canvas.width * this.canvasScale, ctx.canvas.height * this.canvasScale);
	}

}