import * as THREE from 'three';

const portalHalfTurn = new THREE.Matrix4().makeRotationY(Math.PI);
const portalMatrix = new THREE.Matrix4();
const portalTransform = new THREE.Matrix4();
const portalInverse = new THREE.Matrix4();

function createPortal(THREE, scene, camera, { position, rotation = [0, 0, 0], color, wall, width = 1.5, height = 2.5 }) {
	const portal = new THREE.Group();
	portal.position.set(...position);
	portal.rotation.set(...rotation);

	const aspect = width / height;
	const targetHeight = 1024;
	const targetWidth = Math.round(targetHeight * aspect);
	const renderTarget = new THREE.WebGLRenderTarget(targetWidth, targetHeight, {
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		depthBuffer: true,
	});
	renderTarget.texture.colorSpace = THREE.SRGBColorSpace;

	const surfaceMaterial = new THREE.ShaderMaterial({
		uniforms: {
			portalTexture: { value: renderTarget.texture },
			portalColor: { value: new THREE.Color(color) },
			resolution: { value: new THREE.Vector2(targetWidth, targetHeight) },
			portalViewProjection: { value: new THREE.Matrix4() },
		},
		vertexShader: `
			varying vec2 vUv;
			varying vec4 vPortalClipPosition;
			uniform mat4 portalViewProjection;
			void main() {
				vUv = uv;
				vec4 worldPosition = modelMatrix * vec4(position, 1.0);
				vPortalClipPosition = portalViewProjection * worldPosition;
				gl_Position = projectionMatrix * viewMatrix * worldPosition;
			}
		`,
		fragmentShader: `
			uniform sampler2D portalTexture;
			uniform vec3 portalColor;
			uniform vec2 resolution;
			varying vec2 vUv;
			varying vec4 vPortalClipPosition;
			void main() {
				vec2 portalUv = vPortalClipPosition.xy / vPortalClipPosition.w * 0.5 + 0.5;
				vec3 view = texture2D(portalTexture, portalUv).rgb;
				vec2 edgeDistance = min(vUv, 1.0 - vUv) * resolution;
				float edge = 1.0 - smoothstep(0.0, 18.0, min(edgeDistance.x, edgeDistance.y));
				gl_FragColor = vec4(mix(view, portalColor, edge * 0.22), 1.0);
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
		camera: new THREE.PerspectiveCamera(camera.fov, aspect, camera.near, camera.far),
		destination: null,
	};
}

export function createPortalPair(THREE, scene, camera, { eastWall, northWall }) {
	const tealPortal = createPortal(THREE, scene, camera, {
		position: [0, 1.6, -6.46],
		color: 0x46e0d0,
		wall: northWall,
	});
	const amberPortal = createPortal(THREE, scene, camera, {
		position: [9.46, 1.6, 1.2],
		rotation: [0, -Math.PI / 2, 0],
		color: 0xf29a52,
		wall: eastWall,
	});
	tealPortal.destination = amberPortal;
	amberPortal.destination = tealPortal;
	return [tealPortal, amberPortal];
}

export function renderPortals(renderer, camera, portals, avatar) {
	camera.updateMatrixWorld(true);
	for (const portal of portals) {
		const { destination, renderTarget, camera: portalCamera } = portal;
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
		const wallWasVisible = destination.wall.visible;
		const avatarWasVisible = avatar.visible;
		try {
			for (const linkedPortal of portals) linkedPortal.surface.visible = false;
			destination.wall.visible = false;
			avatar.visible = true;
			renderer.setRenderTarget(renderTarget);
			renderer.clear();
			renderer.render(portal.group.parent, portalCamera);
		} finally {
			renderer.setRenderTarget(previousTarget);
			destination.wall.visible = wallWasVisible;
			avatar.visible = avatarWasVisible;
			portals.forEach((linkedPortal, index) => {
				linkedPortal.surface.visible = surfaceVisibility[index];
			});
		}
	}
}
