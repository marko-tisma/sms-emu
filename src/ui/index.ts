import { Sms } from "./sms";
import "./style.css";

const romUrl = 'http://localhost:3000/rom/ZEX/zexdoc.sms';
// const romUrl = 'http://localhost:3000/rom/sonic.sms';
// const romUrl = 'http://localhost:3000/rom/z80test/z80doc.asm';
start(romUrl);
let sms;

async function start(romUrl: string) {
    const rom = await loadRomFromServer(romUrl);
    console.log(rom.length);
    sms = new Sms(rom);
    sms.animationRequest = requestAnimationFrame(sms.runFrame);
}

async function loadRomFromServer(url: string) {
  const response = await fetch(url, {mode: 'no-cors'});
  const blob = await response.blob();
  return new Uint8Array(await blob.arrayBuffer());
}
