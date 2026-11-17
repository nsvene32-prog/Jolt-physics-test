export const JOLT_VERSION = '0.23.0';

const JOLT_URL = `https://cdn.jsdelivr.net/npm/jolt-physics@${JOLT_VERSION}/dist/jolt-physics.wasm-compat.js?v=20261117-1`;
let joltInitialization;

export function initializeJolt() {
	if (!joltInitialization) {
		joltInitialization = import(JOLT_URL)
			.then((module) => {
				const initializer = typeof module.default === 'function' ? module.default : module.default?.default;
				if (typeof initializer !== 'function') throw new TypeError(`Jolt ${JOLT_VERSION} did not export an initializer function`);
				return initializer();
			})
			.catch((error) => {
				joltInitialization = null;
				throw error;
			});
	}
	return joltInitialization;
}

export function createJoltWorld(Jolt) {
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

	const world = new Jolt.JoltInterface(settings);
	Jolt.destroy(settings);
	return { world, bodyInterface: world.GetPhysicsSystem().GetBodyInterface() };
}

export function createJoltShape(Jolt, mesh) {
	const { shape: shapeType, height, radius, gunCollider } = mesh.userData.physics;
	const parameters = mesh.geometry.parameters;

	if (shapeType === 'capsule') {
		if (!gunCollider) return new Jolt.CapsuleShape(height / 2 - radius, radius, null);

		const compoundSettings = new Jolt.StaticCompoundShapeSettings();
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
		const compoundResult = compoundSettings.Create();
		if (!compoundResult.IsValid()) throw new Error(`Unable to create player compound shape: ${compoundResult.GetError()}`);
		return compoundResult.Get();
	}

	if (mesh.geometry.type === 'SphereGeometry') return new Jolt.SphereShape(parameters.radius, null);
	if (mesh.geometry.type === 'BoxGeometry') {
		const halfWidth = parameters.width / 2;
		const halfHeight = parameters.height / 2;
		const halfDepth = parameters.depth / 2;
		return new Jolt.BoxShape(
			new Jolt.Vec3(halfWidth, halfHeight, halfDepth),
			0.05 * Math.min(halfWidth, halfHeight, halfDepth),
			null,
		);
	}

	return null;
}

export function createJoltBody(Jolt, bodyInterface, mesh) {
	const physics = mesh.userData.physics;
	const shape = createJoltShape(Jolt, mesh);
	if (!shape) return null;

	const position = new Jolt.Vec3(mesh.position.x, mesh.position.y, mesh.position.z);
	const rotation = new Jolt.Quat(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
	const isDynamic = physics.mass > 0;
	const motionType = isDynamic ? Jolt.EMotionType_Dynamic : Jolt.EMotionType_Static;
	const layer = isDynamic ? 1 : 0;
	const settings = new Jolt.BodyCreationSettings(shape, position, rotation, motionType, layer);
	settings.mRestitution = physics.restitution;
	if (physics.lockRotation) {
		settings.mAllowedDOFs = Jolt.EAllowedDOFs_TranslationX
			| Jolt.EAllowedDOFs_TranslationY
			| Jolt.EAllowedDOFs_TranslationZ
			| Jolt.EAllowedDOFs_RotationY;
	}

	const body = bodyInterface.CreateBody(settings);
	if (!body) throw new Error(`Unable to create physics body for ${mesh.name || mesh.geometry.type}`);
	bodyInterface.AddBody(body.GetID(), Jolt.EActivation_Activate);
	return { body, isDynamic };
}

export async function createJoltSimulation(scene) {
	const Jolt = await initializeJolt();
	const { world, bodyInterface } = createJoltWorld(Jolt);
	const bodiesByMesh = new WeakMap();
	const dynamicBodies = [];
	const physicsMeshes = [];

	scene.traverse((mesh) => {
		if (!mesh.isMesh || !mesh.userData.physics) return;
		const result = createJoltBody(Jolt, bodyInterface, mesh);
		if (!result) return;
		bodiesByMesh.set(mesh, result.body);
		physicsMeshes.push(mesh);
		if (result.isDynamic) dynamicBodies.push({ mesh, body: result.body });
	});

	function getBody(mesh) {
		const body = bodiesByMesh.get(mesh);
		if (!body) throw new Error(`No Jolt body registered for ${mesh.name || 'mesh'}`);
		return body;
	}

	return {
		physicsMeshes,
		getVerticalVelocity(mesh) {
			const velocity = bodyInterface.GetLinearVelocity(getBody(mesh).GetID());
			try {
				return velocity.GetY();
			} finally {
				Jolt.destroy(velocity);
			}
		},
		setYaw(mesh, yaw) {
			const rotation = new Jolt.Quat(0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2));
			const angularVelocity = new Jolt.Vec3(0, 0, 0);
			try {
				bodyInterface.SetRotation(getBody(mesh).GetID(), rotation, Jolt.EActivation_Activate);
				bodyInterface.SetAngularVelocity(getBody(mesh).GetID(), angularVelocity);
			} finally {
				Jolt.destroy(rotation);
				Jolt.destroy(angularVelocity);
			}
		},
		setVelocity(mesh, x, y, z) {
			const velocity = new Jolt.Vec3(x, y, z);
			try {
				const bodyId = getBody(mesh).GetID();
				bodyInterface.SetLinearVelocity(bodyId, velocity);
				bodyInterface.ActivateBody(bodyId);
			} finally {
				Jolt.destroy(velocity);
			}
		},
		step(delta) {
			world.Step(Math.min(delta, 1 / 30), delta > 1 / 55 ? 2 : 1);
			for (const { mesh, body } of dynamicBodies) {
				const position = body.GetPosition();
				const rotation = body.GetRotation();
				try {
					mesh.position.set(position.GetX(), position.GetY(), position.GetZ());
					mesh.quaternion.set(rotation.GetX(), rotation.GetY(), rotation.GetZ(), rotation.GetW());
				} finally {
					Jolt.destroy(position);
					Jolt.destroy(rotation);
				}
			}
		},
	};
}