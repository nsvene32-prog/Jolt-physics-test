import * as THREE from 'three';
import initJolt from 'jolt-physics';
import { createWorld } from './world.js';
import { createPhysics } from './physics.js';
import { renderPortals } from './portals.js';

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

const { scene, player, portals } = createWorld(THREE, camera);

window.addEventListener('resize', () => {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
});

let yaw = 0;
let pitch = 0;
let touchPointerId = null;
let previousTouchX = 0;
let previousTouchY = 0;

renderer.domElement.addEventListener('click', () => {
	if (window.matchMedia('(pointer: fine)').matches && document.pointerLockElement !== renderer.domElement) {
		renderer.domElement.requestPointerLock();
	}
});

document.addEventListener('mousemove', (event) => {
	if (document.pointerLockElement !== renderer.domElement) return;
	yaw -= event.movementX * 0.0025;
	pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.0025, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
});

renderer.domElement.addEventListener('pointerdown', (event) => {
	if (event.pointerType !== 'touch') return;
	touchPointerId = event.pointerId;
	previousTouchX = event.clientX;
	previousTouchY = event.clientY;
	renderer.domElement.setPointerCapture(event.pointerId);
});

renderer.domElement.addEventListener('pointermove', (event) => {
	if (event.pointerId !== touchPointerId) return;
	const deltaX = event.clientX - previousTouchX;
	const deltaY = event.clientY - previousTouchY;
	previousTouchX = event.clientX;
	previousTouchY = event.clientY;
	yaw -= deltaX * 0.004;
	pitch = THREE.MathUtils.clamp(pitch - deltaY * 0.004, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
});

const endTouchLook = (event) => {
	if (event.pointerId === touchPointerId) touchPointerId = null;
};
renderer.domElement.addEventListener('pointerup', endTouchLook);
renderer.domElement.addEventListener('pointercancel', endTouchLook);

async function start() {
	const physics = await createPhysics(THREE, initJolt, scene, player);
	const pressedKeys = new Set();
	const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
	const lookKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
	let jumpQueued = false;

	window.addEventListener('keydown', (event) => {
		if (event.code === 'Space') {
			event.preventDefault();
			if (!pressedKeys.has(event.code)) jumpQueued = true;
			pressedKeys.add(event.code);
			return;
		}
		if (!movementKeys.has(event.code) && !lookKeys.has(event.code)) return;
		event.preventDefault();
		pressedKeys.add(event.code);
	});
	window.addEventListener('keyup', (event) => pressedKeys.delete(event.code));
	window.addEventListener('blur', () => pressedKeys.clear());

	let previousTime = performance.now();
	function animate(now) {
		requestAnimationFrame(animate);
		const delta = Math.min((now - previousTime) / 1000, 1 / 30);
		previousTime = now;

		const turnSpeed = 1.8 * delta;
		if (pressedKeys.has('ArrowLeft')) yaw += turnSpeed;
		if (pressedKeys.has('ArrowRight')) yaw -= turnSpeed;
		if (pressedKeys.has('ArrowUp')) pitch = Math.min(Math.PI / 2 - 0.05, pitch + turnSpeed);
		if (pressedKeys.has('ArrowDown')) pitch = Math.max(-Math.PI / 2 + 0.05, pitch - turnSpeed);

		const strafe = Number(pressedKeys.has('KeyD')) - Number(pressedKeys.has('KeyA'));
		const forward = Number(pressedKeys.has('KeyW')) - Number(pressedKeys.has('KeyS'));
		const moveLength = Math.hypot(strafe, forward) || 1;
		const moveX = (strafe * Math.cos(yaw) - forward * Math.sin(yaw)) / moveLength;
		const moveZ = (-strafe * Math.sin(yaw) - forward * Math.cos(yaw)) / moveLength;
		const jumped = physics.step(delta, { moveX, moveZ, jump: jumpQueued });
		if (jumped) jumpQueued = false;

		camera.position.set(player.position.x, player.position.y + 0.18, player.position.z);
		camera.rotation.set(pitch, yaw, 0, 'YXZ');
		renderPortals(renderer, camera, portals);
		renderer.render(scene, camera);
	}

	requestAnimationFrame(animate);
}

start().catch((error) => console.error('Unable to start Jolt physics:', error));