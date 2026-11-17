import { createJoltSimulation } from './jolt-wrapper.js';

export async function createPhysics(THREE, scene, player) {
	const simulation = await createJoltSimulation(scene);
	if (!scene.getObjectById(player.id)) throw new Error('Player mesh is not part of the physics scene');
	const { physicsMeshes } = simulation;
	const playerBounds = new THREE.Box3();
	const supportBounds = new THREE.Box3();

	function isPlayerGrounded() {
		playerBounds.setFromObject(player);
		for (const mesh of physicsMeshes) {
			if (mesh === player) continue;
			supportBounds.setFromObject(mesh);
			const verticalGap = playerBounds.min.y - supportBounds.max.y;
			if (verticalGap < -0.1 || verticalGap > 0.16) continue;
			const overlapsX = playerBounds.max.x > supportBounds.min.x + 0.02 && playerBounds.min.x < supportBounds.max.x - 0.02;
			const overlapsZ = playerBounds.max.z > supportBounds.min.z + 0.02 && playerBounds.min.z < supportBounds.max.z - 0.02;
			if (overlapsX && overlapsZ) return true;
		}
		return false;
	}

	function step(delta, { moveX, moveZ, jump, yaw = 0 }) {
		simulation.setYaw(player, yaw);
		let verticalVelocity = simulation.getVerticalVelocity(player);
		let jumped = false;
		if (jump && isPlayerGrounded() && Math.abs(verticalVelocity) < 0.5) {
			verticalVelocity = 6.5;
			jumped = true;
		}
		simulation.setVelocity(player, moveX * 5, verticalVelocity, moveZ * 5);
		simulation.step(delta);
		return jumped;
	}

	return { step };
}