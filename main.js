import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import initJolt from 'https://cdn.jsdelivr.net/npm/jolt-physics@0.36.0/dist/jolt-physics.wasm-compat.js?v=20261113';
import { createWorld } from './world.js';
import { createPhysics } from './physics.js';
import { renderPortals, resizePortals } from './portals.js';
import { createControls } from './controls.js';

const ASSET_VERSION = Date.now();
const assetUrl = (path) => `${path}?v=${ASSET_VERSION}`;

async function loadSafeGltf(loader, path) {
	const url = assetUrl(path);
	const response = await fetch(url, { cache: 'no-store' });
	if (!response.ok) {
		throw new Error(`Failed to fetch GLTF asset: ${path} (${response.status})`);
	}
	const buffer = await response.arrayBuffer();
	const markerText = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buffer));
	if (markerText.includes('KHR_texture_basisu') || markerText.includes('image/ktx2')) {
		throw new Error(`Blocked Basis/KTX2 asset: ${path}`);
	}
	return loader.loadAsync(url);
}

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

const { scene, player, avatar, portals, props } = createWorld(THREE, camera);
camera.layers.enable(1);
scene.add(camera);

const viewModel = new THREE.Group();
viewModel.name = 'FirstPersonViewModel';
viewModel.position.set(0.28, -0.24, -0.42);
viewModel.rotation.y = Math.PI;
viewModel.layers.set(1);
camera.add(viewModel);

const portalGunHolder = new THREE.Group();
portalGunHolder.name = 'PortalGunWorldModel';
portalGunHolder.position.set(0.24, 1.08, 0.08);
portalGunHolder.rotation.y = Math.PI;
avatar.add(portalGunHolder);

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
let animationActions = {};
let activeLocomotionAction = null;
let jumpAnimationPlaying = false;
let characterHeight = 1.75;
let viewModelCollisionObjects = [];
let previousTime = performance.now();
let portalErrorReported = false;
const viewModelBounds = new THREE.Box3();
const colliderBounds = new THREE.Box3();

function playLocomotionAnimation(name) {
	const nextAction = animationActions[name];
	if (!nextAction || nextAction === activeLocomotionAction) return;
	nextAction.reset().play();
	if (activeLocomotionAction) activeLocomotionAction.crossFadeTo(nextAction, 0.2, false);
	activeLocomotionAction = nextAction;
}

function keepViewModelClearOfWalls() {
	viewModel.position.set(0.28, -0.24, -0.42);
	viewModel.visible = true;
	viewModel.updateWorldMatrix(true, true);
	for (let step = 0; step < 32; step += 1) {
		viewModelBounds.setFromObject(viewModel);
		const intersectsCollider = viewModelCollisionObjects.some((object) => {
			object.updateWorldMatrix(true, false);
			colliderBounds.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);
			return viewModelBounds.intersectsBox(colliderBounds);
		});
		if (!intersectsCollider) break;
		viewModel.position.z += 0.025;
		viewModel.updateWorldMatrix(true, true);
	}
	viewModelBounds.setFromObject(viewModel);
	viewModel.visible = !viewModelCollisionObjects.some((object) => {
		object.updateWorldMatrix(true, false);
		colliderBounds.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);
		return viewModelBounds.intersectsBox(colliderBounds);
	});
}

camera.position.set(player.position.x, player.position.y + characterHeight * 0.4, player.position.z);

function animate(now) {
	requestAnimationFrame(animate);
	const delta = Math.min((now - previousTime) / 1000, 1 / 30);
	previousTime = now;

	const input = controls.update(delta);
	let jumped = false;
	if (physics) {
		jumped = physics.step(delta, input);
		if (jumped) controls.clearJump();
	}
	if (jumped && animationActions.jump) {
		const jumpAction = animationActions.jump;
		jumpAction.reset().play();
		if (activeLocomotionAction) activeLocomotionAction.crossFadeTo(jumpAction, 0.08, false);
		jumpAnimationPlaying = true;
	}

	avatar.position.set(player.position.x, player.position.y - characterHeight / 2, player.position.z);
	avatar.rotation.y = input.yaw;
	const strafe = input.moveX * Math.cos(input.yaw) - input.moveZ * Math.sin(input.yaw);
	const forward = -input.moveX * Math.sin(input.yaw) - input.moveZ * Math.cos(input.yaw);
	if (!jumpAnimationPlaying) {
		const moving = Math.hypot(input.moveX, input.moveZ) > 0.1;
		const animationName = !moving ? 'idle'
			: Math.abs(strafe) > Math.abs(forward) ? (strafe < 0 ? 'left' : 'right')
			: 'run';
		playLocomotionAnimation(animationName);
	}
	characterMixer?.update(delta);
	camera.position.set(player.position.x, player.position.y + characterHeight * 0.4, player.position.z);
	camera.rotation.set(input.pitch, input.yaw, 0, 'YXZ');
	keepViewModelClearOfWalls();
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
	const propAssets = await Promise.all([
		loadSafeGltf(loader, './assets/models/props/radio_compressed.glb'),
		loadSafeGltf(loader, './assets/models/props/Portal_Companion_Cube_compressed.glb'),
	]);
	const propModels = {
		radio: propAssets[0].scene,
		weightedCube: propAssets[1].scene,
	};
	for (const collider of props) {
		const model = propModels[collider.userData.propModel].clone(true);
		const bounds = new THREE.Box3().setFromObject(model);
		const center = bounds.getCenter(new THREE.Vector3());
		const modelSize = bounds.getSize(new THREE.Vector3());
		const targetSize = new THREE.Vector3(
			collider.geometry.parameters.width,
			collider.geometry.parameters.height,
			collider.geometry.parameters.depth,
		);
		const scale = Math.min(targetSize.x / modelSize.x, targetSize.y / modelSize.y, targetSize.z / modelSize.z);
		model.scale.setScalar(scale);
		model.position.copy(center.multiplyScalar(-scale));
		model.traverse((object) => {
			if (object.isMesh) object.castShadow = object.receiveShadow = true;
		});
		collider.add(model);
	}

	const portalGun = await loadSafeGltf(loader, './assets/models/props/portal_gun%202.glb');
	const portalGunModel = portalGun.scene;
	const gunBounds = new THREE.Box3().setFromObject(portalGunModel);
	const gunSize = gunBounds.getSize(new THREE.Vector3());
	if (gunSize.z <= 0) throw new Error('Portal gun model has no measurable length');
	const gunScale = 0.62 / gunSize.z;
	const gunCenter = gunBounds.getCenter(new THREE.Vector3());
	portalGunModel.scale.setScalar(gunScale);
	portalGunModel.position.copy(gunCenter.multiplyScalar(-gunScale));
	portalGunModel.traverse((object) => object.layers.set(1));
	viewModel.add(portalGunModel);
	const portalGunWorldModel = portalGunModel.clone(true);
	portalGunWorldModel.traverse((object) => object.layers.set(0));
	portalGunHolder.add(portalGunWorldModel);

	viewModelCollisionObjects = [];
	scene.traverse((object) => {
		if (!object.isMesh || !object.userData.physics || object === player) return;
		object.geometry.computeBoundingBox();
		viewModelCollisionObjects.push(object);
	});

	const character = await loadSafeGltf(loader, './assets/chell/chell.glb');
	const characterModel = character.scene;
	characterModel.rotation.y = Math.PI;
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
		gunCollider: {
			halfExtents: [gunSize.x * gunScale / 2, gunSize.y * gunScale / 2, gunSize.z * gunScale / 2],
			position: [
				portalGunHolder.position.x,
				portalGunHolder.position.y - characterHeight / 2 - 0.03,
				portalGunHolder.position.z,
			],
			rotationY: Math.PI,
		},
	};
	characterModel.traverse((object) => {
		if (!object.isMesh) return;
		object.castShadow = true;
		object.receiveShadow = true;
	});
	avatar.add(characterModel);
	characterMixer = new THREE.AnimationMixer(characterModel);
	const animationFiles = {
		idle: './assets/chell/animations/StandingIdle.glb',
		run: './assets/chell/animations/StationaryRunning.glb',
		left: './assets/chell/animations/LeftStrafe.glb',
		right: './assets/chell/animations/RightStrafe.glb',
		jump: './assets/chell/animations/Jump.glb',
	};
	const animationEntries = await Promise.all(Object.entries(animationFiles).map(async ([name, path]) => {
		const animationAsset = await loadSafeGltf(loader, path);
		const clip = animationAsset.animations[0];
		if (!clip) throw new Error(`Animation file has no clip: ${path}`);
		if (name === 'idle') {
			clip.tracks = clip.tracks.filter((track) => !track.name.startsWith('root.quaternion'));
			for (const track of clip.tracks) track.name = track.name.replace('playerqc_skeleton', 'player.qc_skeleton');
		}
		return [name, clip];
	}));
	animationActions = Object.fromEntries(animationEntries.map(([name, clip]) => [name, characterMixer.clipAction(clip)]));
	for (const [name, action] of Object.entries(animationActions)) {
		if (name === 'jump') {
			action.setLoop(THREE.LoopOnce, 1);
			action.clampWhenFinished = true;
		} else {
			action.setLoop(THREE.LoopRepeat, Infinity);
		}
	}
	characterMixer.addEventListener('finished', (event) => {
		if (event.action !== animationActions.jump) return;
		jumpAnimationPlaying = false;
		activeLocomotionAction = null;
	});
	playLocomotionAnimation('idle');

	physics = await createPhysics(THREE, initJolt, scene, player);
}

start().catch((error) => {
	console.error('Unable to start Jolt physics:', error);
	startupError.textContent = `Startup error: ${error.message}`;
	startupError.hidden = false;
});