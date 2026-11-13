export async function createPhysics(THREE, initJolt, scene, player) {
	const Jolt = await initJolt();
	const settings = new Jolt.JoltSettings();
	const objectLayerFilter = new Jolt.ObjectLayerPairFilterTable(2);
	objectLayerFilter.EnableCollision(0, 1);
	objectLayerFilter.EnableCollision(1, 1);

	const broadPhaseStatic = new Jolt.BroadPhaseLayer(0);
	const broadPhaseMoving = new Jolt.BroadPhaseLayer(1);
	const broadPhaseFilter = new Jolt.BroadPhaseLayerInterfaceTable(2, 2);
	broadPhaseFilter.MapObjectToBroadPhaseLayer(0, broadPhaseStatic);
	broadPhaseFilter.MapObjectToBroadPhaseLayer(1, broadPhaseMoving);
	settings.mObjectLayerPairFilter = objectLayerFilter;
	settings.mBroadPhaseLayerInterface = broadPhaseFilter;
	settings.mObjectVsBroadPhaseLayerFilter = new Jolt.ObjectVsBroadPhaseLayerFilterTable(
		broadPhaseFilter,
		2,
		objectLayerFilter,
		2,
	);

	const jolt = new Jolt.JoltInterface(settings);
	Jolt.destroy(settings);
	const bodyInterface = jolt.GetPhysicsSystem().GetBodyInterface();
	const dynamicBodies = [];
	const physicsMeshes = [];
	let playerBody = null;

	scene.traverse((mesh) => {
		if (!mesh.isMesh || !mesh.userData.physics) return;

		const { mass, restitution, shape: shapeType, height, radius, lockRotation, gunCollider } = mesh.userData.physics;
		const parameters = mesh.geometry.parameters;
		let shape = null;
		let compoundSettings = null;
		let compoundResult = null;
		if (shapeType === 'capsule') {
			if (gunCollider) {
				compoundSettings = new Jolt.StaticCompoundShapeSettings();
				const capsuleSettings = new Jolt.CapsuleShapeSettings(height / 2 - radius, radius, null);
				const origin = new Jolt.Vec3(0, 0, 0);
				const identity = new Jolt.Quat(0, 0, 0, 1);
				compoundSettings.AddShape(origin, identity, capsuleSettings, 0);

				const gunPosition = new Jolt.Vec3(...gunCollider.position);
				const gunRotation = new Jolt.Quat(
					0,
					Math.sin(gunCollider.rotationY / 2),
					0,
					Math.cos(gunCollider.rotationY / 2),
				);
				const gunHalfExtents = new Jolt.Vec3(...gunCollider.halfExtents);
				const gunSettings = new Jolt.BoxShapeSettings(gunHalfExtents, 0.02, null);
				compoundSettings.AddShape(gunPosition, gunRotation, gunSettings, 0);
				compoundResult = compoundSettings.Create();
				if (!compoundResult.IsValid()) throw new Error(`Unable to create player compound shape: ${compoundResult.GetError()}`);
				shape = compoundResult.Get();
			} else {
				shape = new Jolt.CapsuleShape(height / 2 - radius, radius, null);
			}
		} else if (mesh.geometry.type === 'SphereGeometry') {
			shape = new Jolt.SphereShape(parameters.radius, null);
		} else if (mesh.geometry.type === 'BoxGeometry') {
			const halfWidth = parameters.width / 2;
			const halfHeight = parameters.height / 2;
			const halfDepth = parameters.depth / 2;
			shape = new Jolt.BoxShape(
				new Jolt.Vec3(halfWidth, halfHeight, halfDepth),
				0.05 * Math.min(halfWidth, halfHeight, halfDepth),
				null,
			);
		}
		if (!shape) return;

		const position = new Jolt.Vec3(mesh.position.x, mesh.position.y, mesh.position.z);
		const rotation = new Jolt.Quat(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
		const isDynamic = mass > 0;
		const motionType = isDynamic ? Jolt.EMotionType_Dynamic : Jolt.EMotionType_Static;
		const layer = isDynamic ? 1 : 0;
		const bodySettings = new Jolt.BodyCreationSettings(shape, position, rotation, motionType, layer);
		bodySettings.mRestitution = restitution;
		if (lockRotation) {
			bodySettings.mAllowedDOFs = Jolt.EAllowedDOFs_TranslationX
				| Jolt.EAllowedDOFs_TranslationY
				| Jolt.EAllowedDOFs_TranslationZ
				| Jolt.EAllowedDOFs_RotationY;
		}
		const body = bodyInterface.CreateBody(bodySettings);
		bodyInterface.AddBody(body.GetID(), Jolt.EActivation_Activate);
		physicsMeshes.push(mesh);

		if (isDynamic) {
			dynamicBodies.push({ mesh, body });
			if (mesh === player) playerBody = body;
		}
	});

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
		let jumped = false;
		if (playerBody) {
			const rotation = new Jolt.Quat(0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2));
			const angularVelocity = new Jolt.Vec3(0, 0, 0);
			bodyInterface.SetRotation(playerBody.GetID(), rotation, Jolt.EActivation_Activate);
			bodyInterface.SetAngularVelocity(playerBody.GetID(), angularVelocity);
			Jolt.destroy(rotation);
			Jolt.destroy(angularVelocity);

			const currentVelocity = bodyInterface.GetLinearVelocity(playerBody.GetID());
			let verticalVelocity = currentVelocity.GetY();
			if (jump && isPlayerGrounded() && Math.abs(verticalVelocity) < 0.5) {
				verticalVelocity = 6.5;
				jumped = true;
			}
			const velocity = new Jolt.Vec3(moveX * 5, verticalVelocity, moveZ * 5);
			bodyInterface.SetLinearVelocity(playerBody.GetID(), velocity);
			if (moveX !== 0 || moveZ !== 0 || jumped) bodyInterface.ActivateBody(playerBody.GetID());
			Jolt.destroy(currentVelocity);
			Jolt.destroy(velocity);
		}

		jolt.Step(delta, delta > 1 / 55 ? 2 : 1);
		for (const { mesh, body } of dynamicBodies) {
			const position = body.GetPosition();
			const rotation = body.GetRotation();
			mesh.position.set(position.GetX(), position.GetY(), position.GetZ());
			mesh.quaternion.set(rotation.GetX(), rotation.GetY(), rotation.GetZ(), rotation.GetW());
		}
		return jumped;
	}

	return { step };
}