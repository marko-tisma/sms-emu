import { Bus } from "../bus";
import { Cartridge } from "../cartridge";
import { Cpu } from "../cpu";
import { Sound } from "../sound";
import { Vdp } from "../vdp";
import { Sms } from "./sms";
import "./style.css";

// const romUrl = 'http://localhost:3000/rom/test/zexdoc.out';
// const romUrl = 'http://localhost:3000/rom/test/HelloWorld.sms';
// const romUrl = 'http://localhost:3000/rom/ZEX/zexdoc.sms';
// const romUrl = 'http://localhost:3000/rom/ZEX/zexall.sms';
// const romUrl = 'http://localhost:3000/rom/VDPTEST.sms';
// const romUrl = 'http://localhost:3000/rom/phantasy_star.sms';
// const romUrl = 'http://localhost:3000/rom/bart.sms';
// const romUrl = 'http://localhost:3000/rom/Not_Only_Words.sms';
// const romUrl = 'http://localhost:3000/rom/pfrdetect.sms';
// const romUrl = 'http://localhost:3000/rom/bios13.sms';
// const romUrl = 'http://localhost:3000/rom/jpbios.sms';
// const romUrl = 'http://localhost:3000/rom/smsproto.sms';
// const romUrl = 'http://localhost:3000/rom/alex_kidd_bios.sms'
// const romUrl = 'http://localhost:3000/rom/speedball.sms'
// const romUrl = 'http://localhost:3000/rom/wonder.sms'
// const romUrl = 'http://localhost:3000/rom/wonder_monster.sms'


// const romUrl = 'http://localhost:3000/rom/wonder_monster2.sms'
// const romUrl = 'http://localhost:3000/rom/wonder3.sms'
// const romUrl = 'http://localhost:3000/rom/asterix.sms'
// const romUrl = 'http://localhost:3000/rom/4MB_Test.sms'
// const romUrl = 'http://localhost:3000/rom/cycle_counter.sms'
// const romUrl = 'http://localhost:3000/rom/vcounter_test.sms'
// const romUrl = 'http://localhost:3000/rom/wonder3_2.sms'
// const romUrl = 'http://localhost:3000/rom/road.sms'
// const romUrl = 'http://localhost:3000/rom/aladdin.sms'
// const romUrl = 'http://localhost:3000/rom/ultima4.sms'
// const romUrl = 'http://localhost:3000/rom/miracle_warriors.sms'
// const romUrl = 'http://localhost:3000/rom/outrun.sms'
// const romUrl = 'http://localhost:3000/rom/outrun5.sms'
// const romUrl = 'http://localhost:3000/rom/mortal_kombat2.sms'
// const romUrl = 'http://localhost:3000/rom/battleoutrun.sms'
// const romUrl = 'http://localhost:3000/rom/sonbios.sms';
const romUrl = 'http://localhost:3000/rom/sonic1.sms';
// const romUrl = 'http://localhost:3000/rom/sonic2.sms';
// const romUrl = 'http://localhost:3000/rom/jim.sms';
// const romUrl = 'http://localhost:3000/rom/SMSTestSuite.sms';
// const romUrl = 'http://localhost:3000/rom/alex.sms';
// const romUrl = 'http://localhost:3000/rom/z80test/z80doc.asm';
let sms;
start();

async function start() {
	const rom = await loadRomFromServer(romUrl);
	console.log(rom.length);
	const cartridge = new Cartridge(rom);
	const vdp = new Vdp(document.querySelector('#screen')!);
	const sound = new Sound(new window.AudioContext);
	const bus = new Bus(cartridge, vdp, sound);
	const cpu = new Cpu(bus);
	sms = new Sms(cpu);
    sms.running = true;
	requestAnimationFrame(sms.runFrame);
}

async function loadRomFromServer(url: string) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`File ${url} doesn't exist`);
	}
	const blob = await response.blob();
	return new Uint8Array(await blob.arrayBuffer());
}