export function createControls(THREE, canvas) {
	const pressedKeys = new Set();
	const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
	const lookKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
	let yaw = 0;
	let pitch = 0;
	let touchPointerId = null;
	let previousTouchX = 0;
	let previousTouchY = 0;
	let jumpQueued = false;
	let joystickX = 0;
	let joystickY = 0;
	let joystickPointerId = null;

	canvas.addEventListener('click', () => {
		if (window.matchMedia('(pointer: fine)').matches && document.pointerLockElement !== canvas) {
			canvas.requestPointerLock();
		}
	});

	document.addEventListener('mousemove', (event) => {
		if (document.pointerLockElement !== canvas) return;
		yaw -= event.movementX * 0.0025;
		pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.0025, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
	});

	canvas.addEventListener('pointerdown', (event) => {
		if (event.pointerType !== 'touch') return;
		touchPointerId = event.pointerId;
		previousTouchX = event.clientX;
		previousTouchY = event.clientY;
		canvas.setPointerCapture(event.pointerId);
	});

	canvas.addEventListener('pointermove', (event) => {
		if (event.pointerId !== touchPointerId) return;
		const deltaX = event.clientX - previousTouchX;
		const deltaY = event.clientY - previousTouchY;
		previousTouchX = event.clientX;
		previousTouchY = event.clientY;
		yaw -= deltaX * 0.004;
		pitch = THREE.MathUtils.clamp(pitch - deltaY * 0.004, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
	});

	const endTouchLook = (event) => {
		if (event.pointerId === touchPointerId) touchPointerId = null;
	};
	canvas.addEventListener('pointerup', endTouchLook);
	canvas.addEventListener('pointercancel', endTouchLook);

	window.addEventListener('keydown', (event) => {
		if (event.code === 'Space') {
			event.preventDefault();
			if (!pressedKeys.has(event.code)) jumpQueued = true;
			pressedKeys.add(event.code);
			return;
		}
		if (!movementKeys.has(event.code) && !lookKeys.has(event.code)) return;
		event.preventDefault();
		pressedKeys.add(event.code);
	});
	window.addEventListener('keyup', (event) => pressedKeys.delete(event.code));

	function resetJoystick() {
		joystickX = 0;
		joystickY = 0;
		joystickPointerId = null;
		if (joystickThumb) joystickThumb.style.transform = 'translate(-50%, -50%)';
	}

	let joystickThumb = null;
	if (window.matchMedia('(pointer: coarse)').matches) {
		const joystick = document.createElement('div');
		joystick.className = 'mobile-joystick';
		joystick.setAttribute('role', 'group');
		joystick.setAttribute('aria-label', 'Movement joystick');
		joystickThumb = document.createElement('div');
		joystickThumb.className = 'mobile-joystick-thumb';
		joystick.append(joystickThumb);
		document.body.append(joystick);

		const updateJoystick = (event) => {
			const bounds = joystick.getBoundingClientRect();
			const maxDistance = (bounds.width - joystickThumb.offsetWidth) / 2;
			let offsetX = event.clientX - (bounds.left + bounds.width / 2);
			let offsetY = event.clientY - (bounds.top + bounds.height / 2);
			const distance = Math.hypot(offsetX, offsetY);
			if (distance > maxDistance) {
				offsetX *= maxDistance / distance;
				offsetY *= maxDistance / distance;
			}
			joystickX = offsetX / maxDistance;
			joystickY = -offsetY / maxDistance;
			joystickThumb.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
		};

		joystick.addEventListener('pointerdown', (event) => {
			event.preventDefault();
			if (joystickPointerId !== null) return;
			joystickPointerId = event.pointerId;
			joystick.setPointerCapture(event.pointerId);
			updateJoystick(event);
		});
		joystick.addEventListener('pointermove', (event) => {
			if (event.pointerId === joystickPointerId) updateJoystick(event);
		});
		joystick.addEventListener('pointerup', (event) => {
			if (event.pointerId === joystickPointerId) resetJoystick();
		});
		joystick.addEventListener('pointercancel', (event) => {
			if (event.pointerId === joystickPointerId) resetJoystick();
		});

		const jumpButton = document.createElement('button');
		jumpButton.className = 'mobile-jump-button';
		jumpButton.type = 'button';
		jumpButton.textContent = 'Jump';
		jumpButton.setAttribute('aria-label', 'Jump');
		jumpButton.addEventListener('pointerdown', (event) => {
			event.preventDefault();
			jumpQueued = true;
		});
		document.body.append(jumpButton);
	}

	window.addEventListener('blur', () => {
		pressedKeys.clear();
		resetJoystick();
		touchPointerId = null;
	});

	return {
		update(delta) {
			const turnSpeed = 1.8 * delta;
			if (pressedKeys.has('ArrowLeft')) yaw += turnSpeed;
			if (pressedKeys.has('ArrowRight')) yaw -= turnSpeed;
			if (pressedKeys.has('ArrowUp')) pitch = Math.min(Math.PI / 2 - 0.05, pitch + turnSpeed);
			if (pressedKeys.has('ArrowDown')) pitch = Math.max(-Math.PI / 2 + 0.05, pitch - turnSpeed);

			let strafe = Number(pressedKeys.has('KeyD')) - Number(pressedKeys.has('KeyA')) + joystickX;
			let forward = Number(pressedKeys.has('KeyW')) - Number(pressedKeys.has('KeyS')) + joystickY;
			const moveLength = Math.hypot(strafe, forward);
			if (moveLength > 1) {
				strafe /= moveLength;
				forward /= moveLength;
			}

			return {
				yaw,
				pitch,
				moveX: strafe * Math.cos(yaw) - forward * Math.sin(yaw),
				moveZ: -strafe * Math.sin(yaw) - forward * Math.cos(yaw),
				jump: jumpQueued,
			};
		},
		clearJump() {
			jumpQueued = false;
		},
	};
}