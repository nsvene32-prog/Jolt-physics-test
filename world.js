import { createPortalPair } from './portals.js';

export function createWorld(THREE, camera) {
	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0x9ab5bb);
	scene.fog = new THREE.Fog(0x9ab5bb, 20, 42);

	scene.add(new THREE.HemisphereLight(0xe4f3ef, 0x4c4941, 2.1));

	const sun = new THREE.DirectionalLight(0xffe6bc, 3.2);
	sun.position.set(-5, 11, 7);
	sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048);
	sun.shadow.camera.left = -12;
	sun.shadow.camera.right = 12;
	sun.shadow.camera.top = 12;
	sun.shadow.camera.bottom = -12;
	scene.add(sun);

	const floor = new THREE.Mesh(
		new THREE.BoxGeometry(20, 0.6, 14),
		new THREE.MeshStandardMaterial({ color: 0x52686a, roughness: 0.82 }),
	);
	floor.position.y = -0.3;
	floor.receiveShadow = true;
	floor.userData.physics = { mass: 0, restitution: 0.05 };
	scene.add(floor);

	const grid = new THREE.GridHelper(20, 20, 0xb9c9b9, 0x809394);
	grid.position.y = 0.012;
	scene.add(grid);

	function addBox({ size, position, color, mass = 1, restitution = 0.1 }) {
		const mesh = new THREE.Mesh(
			new THREE.BoxGeometry(...size),
			new THREE.MeshStandardMaterial({ color, roughness: 0.62 }),
		);
		mesh.position.set(...position);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.userData.physics = { mass, restitution };
		scene.add(mesh);
		return mesh;
	}

	addBox({ size: [1.35, 1.35, 1.35], position: [-2.2, 2.6, 0], color: 0xd2754c });
	addBox({ size: [1.15, 2, 1.15], position: [1.8, 3.4, -0.5], color: 0xe7bd65, restitution: 0.18 });
	addBox({ size: [1, 1, 1], position: [-4.6, 1.5, -2.8], color: 0x4c8792 });
	addBox({ size: [1, 1, 1], position: [-4.6, 2.6, -2.8], color: 0xe8c65c });
	addBox({ size: [1.4, 0.8, 1.4], position: [4.1, 1.7, -3.2], color: 0x8e7560 });
	addBox({ size: [0.8, 1.5, 0.8], position: [4.4, 2.8, 2.8], color: 0x5e829e });
	addBox({ size: [1.1, 1.1, 1.1], position: [-4.8, 2, 3.2], color: 0x9a6c85 });
	addBox({ size: [0.5, 3, 14], position: [-9.75, 1.5, 0], color: 0x52686a, mass: 0 });
	const eastWall = addBox({ size: [0.5, 3, 14], position: [9.75, 1.5, 0], color: 0x52686a, mass: 0 });
	const northWall = addBox({ size: [20, 3, 0.5], position: [0, 1.5, -6.75], color: 0x52686a, mass: 0 });
	addBox({ size: [20, 3, 0.5], position: [0, 1.5, 6.75], color: 0x52686a, mass: 0 });

	const portals = createPortalPair(THREE, scene, camera, { eastWall, northWall });

	const sphere = new THREE.Mesh(
		new THREE.SphereGeometry(0.72, 32, 24),
		new THREE.MeshStandardMaterial({ color: 0x4b8f91, roughness: 0.35, metalness: 0.08 }),
	);
	sphere.position.set(0.3, 5, 1.8);
	sphere.castShadow = true;
	sphere.receiveShadow = true;
	sphere.userData.physics = { mass: 1.2, restitution: 0.35 };
	scene.add(sphere);

	const player = new THREE.Mesh(
		new THREE.BoxGeometry(1.1, 1.1, 1.1),
		new THREE.MeshStandardMaterial({ color: 0xe45f56, roughness: 0.48, metalness: 0.04 }),
	);
	player.position.set(0, 1.2, 0);
	player.castShadow = true;
	player.receiveShadow = true;
	player.visible = false;
	player.userData.physics = { mass: 2, restitution: 0.08 };
	scene.add(player);

	const avatar = new THREE.Group();
	avatar.name = 'Chell';
	scene.add(avatar);

	return { scene, player, avatar, portals };
}