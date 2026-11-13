export async function createPhysics(THREE, joltPhysics, scene, player) {
	const hadPlayerPhysics = Object.hasOwn(player.userData, 'physics');
	const playerPhysics = player.userData.physics;
	delete player.userData.physics;
	try {
		joltPhysics.addScene(scene);
	} finally {
		if (hadPlayerPhysics) player.userData.physics = playerPhysics;
	}

	const colliders = [];
	scene.traverse((mesh) => {
		if (mesh.isMesh && mesh.userData.physics && mesh !== player) colliders.push(mesh);
	});

	const playerBounds = new THREE.Box3();
	const colliderBounds = new THREE.Box3();
	let verticalVelocity = 0;
	let grounded = false;

	function getPlayerBounds() {
		player.updateWorldMatrix(true, false);
		return playerBounds.setFromObject(player);
	}

	function overlapsCollider(horizontalOnly = false) {
		getPlayerBounds();
		if (horizontalOnly) {
			playerBounds.min.y += 0.025;
			playerBounds.max.y -= 0.025;
		}
		return colliders.some((mesh) => {
			mesh.updateWorldMatrix(true, false);
			colliderBounds.setFromObject(mesh);
			return playerBounds.intersectsBox(colliderBounds);
		});
	}

	function isGrounded() {
		getPlayerBounds();
		return colliders.some((mesh) => {
			mesh.updateWorldMatrix(true, false);
			colliderBounds.setFromObject(mesh);
			const verticalGap = playerBounds.min.y - colliderBounds.max.y;
			const overlapsX = playerBounds.max.x > colliderBounds.min.x + 0.02
				&& playerBounds.min.x < colliderBounds.max.x - 0.02;
			const overlapsZ = playerBounds.max.z > colliderBounds.min.z + 0.02
				&& playerBounds.min.z < colliderBounds.max.z - 0.02;
			return verticalGap >= -0.08 && verticalGap <= 0.14 && overlapsX && overlapsZ;
		});
	}

	function step(delta, { moveX, moveZ, jump, yaw = 0 }) {
		const stepDelta = Math.min(delta, 1 / 30);
		player.rotation.y = yaw;

		const previousX = player.position.x;
		player.position.x += moveX * 5 * stepDelta;
		if (overlapsCollider(true)) player.position.x = previousX;

		const previousZ = player.position.z;
		player.position.z += moveZ * 5 * stepDelta;
		if (overlapsCollider(true)) player.position.z = previousZ;

		grounded = isGrounded();
		let jumped = false;
		if (jump && grounded) {
			verticalVelocity = 6.5;
			grounded = false;
			jumped = true;
		}

		const previousY = player.position.y;
		const previousBounds = getPlayerBounds().clone();
		verticalVelocity -= 18 * stepDelta;
		player.position.y += verticalVelocity * stepDelta;
		if (overlapsCollider()) {
			if (verticalVelocity < 0) {
				let landingHeight = -Infinity;
				for (const mesh of colliders) {
					mesh.updateWorldMatrix(true, false);
					colliderBounds.setFromObject(mesh);
					if (previousBounds.min.y >= colliderBounds.max.y - 0.12
						&& colliderBounds.max.y > landingHeight) landingHeight = colliderBounds.max.y;
				}
				player.position.y = Number.isFinite(landingHeight) ? landingHeight + playerBounds.getSize(new THREE.Vector3()).y / 2 : previousY;
				grounded = Number.isFinite(landingHeight);
			} else {
				player.position.y = previousY;
			}
			verticalVelocity = 0;
		}
		return jumped;
	}

	return { step };
}