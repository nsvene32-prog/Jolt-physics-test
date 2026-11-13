import * as THREE from 'three';

const portalHalfTurn = new THREE.Matrix4().makeRotationY(Math.PI);
const portalMatrix = new THREE.Matrix4();
const portalTransform = new THREE.Matrix4();
const portalInverse = new THREE.Matrix4();
const portalTargetHeight = 1024;

function createPortal(THREE, scene, camera, { position, rotation = [0, 0, 0], wall, width = 1.5, height = 2.5 }) {
	const portal = new THREE.Group();
	portal.position.set(...position);
	portal.rotation.set(...rotation);

	const targetWidth = Math.round(portalTargetHeight * camera.aspect);
	const renderTarget = new THREE.WebGLRenderTarget(targetWidth, portalTargetHeight, {
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		depthBuffer: true,
	});
	renderTarget.texture.colorSpace = THREE.SRGBColorSpace;
	const nestedRenderTarget = new THREE.WebGLRenderTarget(targetWidth, portalTargetHeight, {
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		depthBuffer: true,
	});
	nestedRenderTarget.texture.colorSpace = THREE.SRGBColorSpace;

	const surfaceMaterial = new THREE.ShaderMaterial({
		uniforms: {
			portalTexture: { value: renderTarget.texture },
			portalViewProjection: { value: new THREE.Matrix4() },
		},
		vertexShader: `
			varying vec4 vPortalClipPosition;
			uniform mat4 portalViewProjection;
			void main() {
				vec4 worldPosition = modelMatrix * vec4(position, 1.0);
				vPortalClipPosition = portalViewProjection * worldPosition;
				gl_Position = projectionMatrix * viewMatrix * worldPosition;
			}
		`,
		fragmentShader: `
			uniform sampler2D portalTexture;
			varying vec4 vPortalClipPosition;
			void main() {
				float clipW = abs(vPortalClipPosition.w) < 0.0001
					? (vPortalClipPosition.w < 0.0 ? -0.0001 : 0.0001)
					: vPortalClipPosition.w;
				vec2 portalUv = vPortalClipPosition.xy / clipW * 0.5 + 0.5;
				vec2 safePortalUv = clamp(portalUv, vec2(0.001), vec2(0.999));
				gl_FragColor = texture2D(portalTexture, safePortalUv);
			}
		`,
		side: THREE.DoubleSide,
		toneMapped: false,
	});
	const surface = new THREE.Mesh(new THREE.CircleGeometry(1, 96), surfaceMaterial);
	surface.scale.set(width / 2, height / 2, 1);
	surface.position.z = 0.01;
	portal.add(surface);
	scene.add(portal);

	return {
		group: portal,
		surface,
		wall,
		renderTarget,
		nestedRenderTarget,
		camera: new THREE.PerspectiveCamera(camera.fov, camera.aspect, camera.near, camera.far),
		nestedCamera: new THREE.PerspectiveCamera(camera.fov, camera.aspect, camera.near, camera.far),
		destination: null,
	};
}

export function createPortalPair(THREE, scene, camera, { eastWall, northWall }) {
	const tealPortal = createPortal(THREE, scene, camera, {
		position: [0, 1.6, -6.46],
		wall: northWall,
	});
	const amberPortal = createPortal(THREE, scene, camera, {
		position: [9.46, 1.6, 1.2],
		rotation: [0, -Math.PI / 2, 0],
		wall: eastWall,
	});
	tealPortal.destination = amberPortal;
	amberPortal.destination = tealPortal;
	return [tealPortal, amberPortal];
}

export function resizePortals(portals, aspect) {
	const targetWidth = Math.max(1, Math.round(portalTargetHeight * aspect));
	for (const portal of portals) {
		portal.renderTarget.setSize(targetWidth, portalTargetHeight);
		portal.nestedRenderTarget.setSize(targetWidth, portalTargetHeight);
		portal.camera.aspect = aspect;
		portal.camera.updateProjectionMatrix();
		portal.nestedCamera.aspect = aspect;
		portal.nestedCamera.updateProjectionMatrix();
	}
}

export function renderPortals(renderer, camera, portals, avatar) {
	camera.updateMatrixWorld(true);
	for (const portal of portals) {
		const { destination, renderTarget, nestedRenderTarget, camera: portalCamera, nestedCamera } = portal;
		portal.group.updateWorldMatrix(true, false);
		destination.group.updateWorldMatrix(true, false);
		portalInverse.copy(portal.group.matrixWorld).invert();
		portalTransform.copy(destination.group.matrixWorld)
			.multiply(portalHalfTurn)
			.multiply(portalInverse);
		portalMatrix.copy(portalTransform).multiply(camera.matrixWorld);
		portalMatrix.decompose(portalCamera.position, portalCamera.quaternion, portalCamera.scale);
		portalCamera.fov = camera.fov;
		portalCamera.near = camera.near;
		portalCamera.far = camera.far;
		portalCamera.updateProjectionMatrix();
		portalCamera.updateMatrixWorld(true);
		portalCamera.matrixWorldInverse.copy(portalCamera.matrixWorld).invert();
		portal.surface.material.uniforms.portalViewProjection.value
			.copy(portalCamera.projectionMatrix)
			.multiply(portalCamera.matrixWorldInverse)
			.multiply(portalTransform);

		const previousTarget = renderer.getRenderTarget();
		const surfaceVisibility = portals.map((linkedPortal) => linkedPortal.surface.visible);
		const wallVisibility = portals.map((linkedPortal) => linkedPortal.wall.visible);
		const avatarWasVisible = avatar.visible;
		const destinationTexture = destination.surface.material.uniforms.portalTexture.value;
		const destinationViewProjection = destination.surface.material.uniforms.portalViewProjection.value;
		const previousDestinationViewProjection = destinationViewProjection.clone();
		try {
			for (const linkedPortal of portals) linkedPortal.surface.visible = false;
			avatar.visible = true;

			const nestedDestination = destination.destination;
			destination.group.updateWorldMatrix(true, false);
			nestedDestination.group.updateWorldMatrix(true, false);
			portalInverse.copy(destination.group.matrixWorld).invert();
			portalTransform.copy(nestedDestination.group.matrixWorld)
				.multiply(portalHalfTurn)
				.multiply(portalInverse);
			portalMatrix.copy(portalTransform).multiply(portalCamera.matrixWorld);
			portalMatrix.decompose(nestedCamera.position, nestedCamera.quaternion, nestedCamera.scale);
			nestedCamera.fov = portalCamera.fov;
			nestedCamera.near = portalCamera.near;
			nestedCamera.far = portalCamera.far;
			nestedCamera.updateProjectionMatrix();
			nestedCamera.updateMatrixWorld(true);
			nestedCamera.matrixWorldInverse.copy(nestedCamera.matrixWorld).invert();
			destinationViewProjection
				.copy(nestedCamera.projectionMatrix)
				.multiply(nestedCamera.matrixWorldInverse)
				.multiply(portalTransform);

			nestedDestination.wall.visible = false;
			renderer.setRenderTarget(nestedRenderTarget);
			renderer.clear();
			renderer.render(portal.group.parent, nestedCamera);

			destination.surface.material.uniforms.portalTexture.value = nestedRenderTarget.texture;
			destination.surface.visible = true;
			destination.wall.visible = false;
			renderer.setRenderTarget(renderTarget);
			renderer.clear();
			renderer.render(portal.group.parent, portalCamera);
		} finally {
			renderer.setRenderTarget(previousTarget);
			destination.surface.material.uniforms.portalTexture.value = destinationTexture;
			destinationViewProjection.copy(previousDestinationViewProjection);
			portals.forEach((linkedPortal, index) => {
				linkedPortal.wall.visible = wallVisibility[index];
			});
			avatar.visible = avatarWasVisible;
			portals.forEach((linkedPortal, index) => {
				linkedPortal.surface.visible = surfaceVisibility[index];
			});
		}
	}
}
