import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import initJolt from 'jolt-physics';
import { createWorld } from './world.js';
import { createPhysics } from './physics.js';
import { renderPortals, resizePortals } from './portals.js';
import { createControls } from './controls.js';

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

const { scene, player, avatar, portals } = createWorld(THREE, camera);

window.addEventListener('resize', () => {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
	resizePortals(portals, camera.aspect);
});

const controls = createControls(THREE, renderer.domElement);
const startupError = document.createElement('div');
startupError.className = 'startup-error';
startupError.hidden = true;
document.body.append(startupError);

let physics = null;
let characterMixer = null;
let characterHeight = 1.75;
let previousTime = performance.now();
let portalErrorReported = false;

camera.position.set(player.position.x, player.position.y + characterHeight * 0.4, player.position.z);

function animate(now) {
	requestAnimationFrame(animate);
	const delta = Math.min((now - previousTime) / 1000, 1 / 30);
	previousTime = now;

	const input = controls.update(delta);
	if (physics) {
		const jumped = physics.step(delta, input);
		if (jumped) controls.clearJump();
	}

	avatar.position.set(player.position.x, player.position.y - characterHeight / 2, player.position.z);
	avatar.rotation.y = input.yaw;
	characterMixer?.update(delta);
	camera.position.set(player.position.x, player.position.y + characterHeight * 0.4, player.position.z);
	camera.rotation.set(input.pitch, input.yaw, 0, 'YXZ');
	renderer.render(scene, camera);
	try {
		renderPortals(renderer, camera, portals, avatar);
	} catch (error) {
		if (!portalErrorReported) {
			console.error('Unable to render portals:', error);
			portalErrorReported = true;
		}
	}
}

requestAnimationFrame(animate);

async function start() {
	const dracoLoader = new DRACOLoader();
	dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/libs/draco/');
	const loader = new GLTFLoader();
	loader.setDRACOLoader(dracoLoader);
	const character = await loader.loadAsync('./assets/chell/chell.glb');
	const characterModel = character.scene;
	const characterBounds = new THREE.Box3().setFromObject(characterModel);
	const sourceCharacterHeight = characterBounds.getSize(new THREE.Vector3()).y;
	if (sourceCharacterHeight <= 0) throw new Error('Chell model has no measurable height');
	characterModel.scale.setScalar(1.75 / sourceCharacterHeight);
	characterModel.updateMatrixWorld(true);
	characterBounds.setFromObject(characterModel);
	characterModel.position.x -= (characterBounds.min.x + characterBounds.max.x) / 2;
	characterModel.position.y -= characterBounds.min.y;
	characterModel.position.z -= (characterBounds.min.z + characterBounds.max.z) / 2;
	characterModel.updateMatrixWorld(true);
	characterBounds.setFromObject(characterModel);
	const characterSize = characterBounds.getSize(new THREE.Vector3());
	characterHeight = characterSize.y;
	const characterRadius = Math.min(characterSize.x, characterSize.z) * 0.5;
	player.geometry.dispose();
	player.geometry = new THREE.BoxGeometry(characterRadius * 2, characterHeight, characterRadius * 2);
	player.position.set(0, characterHeight / 2 + 0.03, 0);
	player.userData.physics = {
		mass: 2,
		restitution: 0.08,
		shape: 'capsule',
		height: characterHeight,
		radius: characterRadius,
		lockRotation: true,
	};
	characterModel.traverse((object) => {
		if (!object.isMesh) return;
		object.castShadow = true;
		object.receiveShadow = true;
	});
	avatar.add(characterModel);
	characterMixer = character.animations.length ? new THREE.AnimationMixer(characterModel) : null;
	characterMixer?.clipAction(character.animations[0]).play();

	physics = await createPhysics(THREE, initJolt, scene, player);
}

start().catch((error) => {
	console.error('Unable to start Jolt physics:', error);
	startupError.textContent = `Startup error: ${error.message}`;
	startupError.hidden = false;
});