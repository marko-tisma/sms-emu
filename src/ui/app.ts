import "../../style.css";
import { Sms } from "./sms";

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
// const romUrl = 'http://localhost:3000/rom/astroforce.sms'
// const romUrl = 'http://localhost:3000/rom/bad_apple.sms'
// const romUrl = 'http://localhost:3000/rom/4MB_Test.sms'
// const romUrl = 'http://localhost:3000/rom/cycle_counter.sms'
// const romUrl = 'http://localhost:3000/rom/vcounter_test.sms'
// const romUrl = 'http://localhost:3000/rom/wonder3_2.sms'
// const romUrl = 'http://localhost:3000/rom/road.sms'
// const romUrl = 'http://localhost:3000/rom/aladdin.sms'
// const romUrl = 'http://localhost:3000/rom/ultima4.sms'
// const romUrl = 'http://localhost:3000/rom/miracle_warriors.sms'
// const romUrl = 'http://localhost:3000/rom/outrun.sms'
const romUrl = 'http://localhost:3000/rom/lion.sms'
// const romUrl = 'http://localhost:3000/rom/DevSound.sms'
// const romUrl = 'http://localhost:3000/rom/outrun2.sms'
// const romUrl = 'http://localhost:3000/rom/mortal_kombat2.sms'
// const romUrl = 'http://localhost:3000/rom/battleoutrun.sms'
// const romUrl = 'http://localhost:3000/rom/sonbios.sms';
// const romUrl = 'http://localhost:3000/rom/sonic1.sms';
// const romUrl = 'http://localhost:3000/rom/sonic2.sms';
// const romUrl = 'http://localhost:3000/rom/addams.sms';
// const romUrl = 'http://localhost:3000/rom/jim.sms';
// const romUrl = 'http://localhost:3000/rom/lemmings.sms';
// const romUrl = 'http://localhost:3000/rom/hang_on.sms';
// const romUrl = 'http://localhost:3000/rom/sagaia.sms';
// const romUrl = 'http://localhost:3000/rom/altered_beast.sms';
// const romUrl = 'http://localhost:3000/rom/SMSTestSuite.sms';
// const romUrl = 'http://localhost:3000/rom/alex.sms';
// const romUrl = 'http://localhost:3000/rom/spiderman.sms';

const app = async () => {
	const romNames = [
		'asterix.sms',
		'lion.sms',
		'sonic1.sms',
	];
	const defaultRomName = 'sonic1.sms';
	let currentRomName = defaultRomName;
	let currentRom = await fetchRom(defaultRomName);

	let canvas = <HTMLCanvasElement>document.querySelector('#screen');
	let widthPixels = 256;
	let heightPixels = 192;
	let canvasScale = 3;
	let ctx = canvas.getContext('2d')!;
	let imageData = ctx.createImageData(widthPixels, heightPixels);

	let audioCtx = new window.AudioContext;
	let audioSource: AudioBufferSourceNode;
	let sampleRate = 44100;
	let bufferSize = sampleRate;
	let audioBuffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
	let soundEnabled = false;

	initUi();
	let sms = new Sms(
		currentRom, imageData.data, drawFrame,
		audioBuffer.getChannelData(0), playAudio, sampleRate
	);

	function playAudio(): void {
		if (!soundEnabled) return;
		let audioSource = audioCtx.createBufferSource();
		audioSource.buffer = audioBuffer;
		audioSource.connect(audioCtx.destination);
		audioSource.start(0);
	}

	function stopAudio(): void {
		if (audioSource) audioSource.stop();
	}

	function drawFrame(): void {
		const ctx = canvas.getContext('2d')!;
		ctx.putImageData(imageData, 0, 0);
		ctx.drawImage(
			ctx.canvas, 0, 0,
			ctx.canvas.width * canvasScale,
			ctx.canvas.height * canvasScale
		);
	}

	function initUi(): void {
		initRomList();
		initButtons();
		initScreen();
		initKeyListeners();
		document.getElementById('rom_name')!.innerText = `ROM: ${defaultRomName}`;
	}

	function initScreen(): void {
		canvas.width = widthPixels * canvasScale;
		canvas.height = heightPixels * canvasScale;
		ctx.imageSmoothingEnabled = false;
		imageData = ctx.createImageData(widthPixels, heightPixels);
		imageData.data.fill(0xff);
		drawFrame();
		canvas.addEventListener('click', (e) => {
			const count = e.detail;
			if (count === 2) canvas.requestFullscreen();
		});
	}

	function initKeyListeners(): void {
		document.addEventListener('keydown', (e) => {
			sms.controller.press(e.key);
		});
		document.addEventListener('keyup', (e) => {
			sms.controller.release(e.key);
		});
	}

	function initButtons(): void {
		document.getElementById('start')?.addEventListener('click', () => {
			sms.run();
		});
		document.querySelector('#reset')?.addEventListener('click', () => {
			loadRom(currentRom, currentRomName);
		});
		document.querySelector('#toggle_sound')!.addEventListener('click', () => {
			toggleSound();
		});
		document.querySelector('#browse_rom')?.addEventListener('click', () => {
			browseRom();
		});
		document.querySelector('#debug')!.addEventListener('click', () => {
			sms.debugger.startDebug();
			stopAudio();
		});
		document.querySelector('#step')!.addEventListener('click', () => {
			sms.debugger.step();
		});
		document.querySelector('#continue')!.addEventListener('click', () => {
			sms.debugger.continue();
		});
		document.querySelector('#show_mem')!.addEventListener('change', (e: Event) => {
			sms.debugger.showMemory(e);
		});
		document.querySelectorAll("button").forEach(item => {
			item.addEventListener('focus', () => {
				item.blur();
			});
		});
	}

	function toggleSound(): void {
		soundEnabled = !soundEnabled;
		const toggleSound = document.querySelector('#toggle_sound')!;
		if (soundEnabled) toggleSound.classList.remove('red');
		else toggleSound.classList.add('red');
	}

	function loadRom(rom: Uint8Array, name: string): void {
		if (sms.running) {
			sms.running = false;
			cancelAnimationFrame(sms.animationRequestId);
		}
		stopAudio();
		sms = new Sms(
			rom, imageData.data, drawFrame,
			audioBuffer.getChannelData(0), playAudio, sampleRate
		);
		document.getElementById('rom_name')!.innerText = `ROM: ${name}`;
		currentRom = rom;
		currentRomName = name;
		sms.run();
	}

	function initRomList(): void {
		const romList = <HTMLDivElement>document.querySelector('#rom_list')!;
		romNames.forEach(romName => {
			const li = document.createElement('li');
			li.innerText = romName;
			li.addEventListener('click', async () => {
				const rom = await fetchRom(romName);
				loadRom(rom, romName);
			});
			romList.appendChild(li);
		});

		document.querySelector("#select_rom > button")?.addEventListener('click', () => {
			toggleRomList();
		});

		document.addEventListener('click', (e: Event) => {
			if (!(e.target as Element).matches('#select_rom > button')) {
				romList.style.display = 'none';
			}
		});
	}

	function toggleRomList(): void {
		const romList = <HTMLDivElement>document.querySelector('#rom_list')!;
		if (!romList.style.display || romList.style.display === 'none') {
			romList.style.display = 'block';
		}
		else {
			romList.style.display = 'none';
		}
	}

	function browseRom(): void {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.sms';
		input.addEventListener('change', async () => {
			if (input.files && input.files[0]) {
				const file = input.files[0];
				const buffer = await file.arrayBuffer();
				loadRom(new Uint8Array(buffer), file.name);
			}
		});
		input.dispatchEvent(new MouseEvent('click'));
	}

	async function fetchRom(romName: string) {
		const url = `http://localhost:3000/rom/${romName}`;
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`File ${url} doesn't exist`);
		}
		const blob = await response.blob();
		return new Uint8Array(await blob.arrayBuffer());
	}
}

app();

