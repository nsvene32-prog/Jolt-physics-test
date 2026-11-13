export async function createPhysics(THREE, rapierPhysics, scene, player) {
	rapierPhysics.addScene(scene);

	const playerBody = player.userData.physics.body;
	playerBody.setEnabledRotations(false, false, false, true);
	const colliders = [];
	scene.traverse((mesh) => {
		if (mesh.isMesh && mesh.userData.physics && mesh !== player) colliders.push(mesh);
	});

	const playerBounds = new THREE.Box3();
	const colliderBounds = new THREE.Box3();
	function isGrounded() {
		playerBounds.setFromObject(player);
		return colliders.some((mesh) => {
			colliderBounds.setFromObject(mesh);
			const verticalGap = playerBounds.min.y - colliderBounds.max.y;
			const overlapsX = playerBounds.max.x > colliderBounds.min.x + 0.02
				&& playerBounds.min.x < colliderBounds.max.x - 0.02;
			const overlapsZ = playerBounds.max.z > colliderBounds.min.z + 0.02
				&& playerBounds.min.z < colliderBounds.max.z - 0.02;
			return verticalGap >= -0.08 && verticalGap <= 0.14 && overlapsX && overlapsZ;
		});
	}

	function step(_delta, { moveX, moveZ, jump, yaw = 0 }) {
		playerBody.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
		const verticalVelocity = playerBody.linvel().y;
		const jumped = jump && isGrounded() && Math.abs(verticalVelocity) < 0.5;
		playerBody.setLinvel(new THREE.Vector3(moveX * 5, jumped ? 6.5 : verticalVelocity, moveZ * 5), true);
		return jumped;
	}

	return { step };
}