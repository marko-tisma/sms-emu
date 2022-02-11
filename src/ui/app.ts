import "../../style.css";
import { Sms, VideoMode } from "./sms";

const app = async () => {
	let currentRomName = 'astroforce.sms'
	let currentRomData = await fetchRomData(currentRomName);

	let videoMode = VideoMode.NTSC;
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
	setVideoMode(videoMode);
	let sms = new Sms(
		currentRomData, videoMode, imageData.data, drawFrame,
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
		ctx.putImageData(imageData, 0, 0);
		ctx.drawImage(
			ctx.canvas, 0, 0,
			ctx.canvas.width * canvasScale,
			ctx.canvas.height * canvasScale
		);
	}

	function setVideoMode(mode: VideoMode) {
		videoMode = mode;
		document.getElementById('toggle_video_mode')!.innerText = `mode: ${VideoMode[videoMode]}`;
	}

	function initUi(): void {
		initButtons();
		initScreen();
		initKeyListeners();
		document.getElementById('rom_name')!.innerText = `ROM: ${currentRomName}`
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
			if (count === 2) {
				if (document.fullscreenElement === null) {
					canvas.requestFullscreen();
				}
				else {
					document.exitFullscreen();
				}
			}
		});
	}

	function initKeyListeners(): void {
		document.addEventListener('keydown', (e) => {
			sms.joystick.press(e.key);
		});
		document.addEventListener('keyup', (e) => {
			sms.joystick.release(e.key);
		});
		document.addEventListener('keydown', (e) => {
			if (
				e.key === ' ' || 
				e.key === 'ArrowUp' ||
				e.key === 'ArrowDown' ||
				e.key === 'ArrowLeft' ||
				e.key === 'ArrowRight'
			) {
				e.preventDefault();
			} 
		});
	}

	function initButtons(): void {
		document.querySelector('#toggle_video_mode')?.addEventListener('click', () => {
			toggleMode();
		});
		document.querySelector('#start')?.addEventListener('click', () => {
			sms.run();
		});
		document.querySelector('#reset')?.addEventListener('click', () => {
			loadRom(currentRomData, currentRomName);
		});
		document.querySelector('#toggle_sound')?.addEventListener('click', () => {
			toggleSound();
		});
		document.querySelector('#browse_rom')?.addEventListener('click', () => {
			browseRom();
		});
		document.querySelector('#debug')?.addEventListener('click', () => {
			sms.debugger.startDebug();
			stopAudio();
		});
		document.querySelector('#step')?.addEventListener('click', () => {
			sms.debugger.step();
		});
		document.querySelector('#continue')?.addEventListener('click', () => {
			sms.debugger.continue();
		});
		document.querySelector('#show_mem')?.addEventListener('change', (e: Event) => {
			sms.debugger.showMemory(e);
		});
		document.querySelectorAll("button").forEach(item => {
			item.addEventListener('focus', () => {
				item.blur();
			});
		});
	}

	function toggleMode(): void {
		setVideoMode(videoMode === VideoMode.NTSC ? VideoMode.PAL : VideoMode.NTSC);
		document.getElementById('toggle_video_mode')!.innerText = `mode: ${VideoMode[videoMode]}`;
		loadRom(currentRomData, currentRomName);
	}

	function toggleSound(): void {
		soundEnabled = !soundEnabled;
		const toggleSound = document.querySelector('#toggle_sound');
		if (soundEnabled) toggleSound?.classList.remove('red');
		else toggleSound?.classList.add('red');
	}

	function loadRom(rom: Uint8Array, name: string): void {
		if (sms.running) {
			sms.running = false;
			cancelAnimationFrame(sms.animationRequestId);
		}
		stopAudio();
		sms = new Sms(
			rom, videoMode, imageData.data, drawFrame,
			audioBuffer.getChannelData(0), playAudio, sampleRate
		);
		document.getElementById('rom_name')!.innerText = `ROM: ${name}`;
		currentRomData = rom;
		currentRomName = name;
		sms.run();
	}

	function browseRom(): void {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.sms';
		input.addEventListener('change', async () => {
			if (input.files && input.files[0]) {
				const file = input.files[0];
				const buffer = await file.arrayBuffer();
				setVideoMode(VideoMode.NTSC);
				loadRom(new Uint8Array(buffer), file.name);
			}
		});
		input.dispatchEvent(new MouseEvent('click'));
	}

	async function fetchRomData(name: string) {
		const url = `http://localhost:3000/rom/${name}`;
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`File ${url} doesn't exist`);
		}
		const blob = await response.blob();
		return new Uint8Array(await blob.arrayBuffer());
	}
}

app();

