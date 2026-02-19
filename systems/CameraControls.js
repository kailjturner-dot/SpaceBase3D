export class CameraControls {
    constructor(camera, input) {
        this.camera = camera;
        this.input = input;

        // Settings
        this.target = new THREE.Vector3(0, 0, 0);
        this.radius = 150;
        this.phi = Math.PI / 3;
        this.theta = Math.PI / 4;
        
        this.minRadius = 20;
        this.maxRadius = 500;
        this.orbitSpeed = 0.005;
        this.moveSpeed = 1.0;
    }

    update() {
        this._handleOrbit();
        this._handleZoom();
        this._handleMovement();
        this._updateCameraTransform();
    }

    _handleOrbit() {
        if (this.input.isRightClickDragging) {
            this.theta -= this.input.mouseDeltaX * this.orbitSpeed;
            this.phi -= this.input.mouseDeltaY * this.orbitSpeed;
            
            // Clamp vertical angle
            this.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, this.phi));
        }
    }

    _handleZoom() {
        if (this.input.scrollDelta !== 0) {
            this.radius += this.input.scrollDelta * 0.1;
            this.radius = Math.max(this.minRadius, Math.min(this.maxRadius, this.radius));
        }
    }

    _handleMovement() {
        // Get camera direction, flatten to XZ plane
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

        if (this.input.keys.w) this.target.addScaledVector(forward, this.moveSpeed);
        if (this.input.keys.s) this.target.addScaledVector(forward, -this.moveSpeed);
        if (this.input.keys.a) this.target.addScaledVector(right, -this.moveSpeed);
        if (this.input.keys.d) this.target.addScaledVector(right, this.moveSpeed);
    }

    _updateCameraTransform() {
        const x = this.target.x + this.radius * Math.sin(this.phi) * Math.sin(this.theta);
        const y = this.target.y + this.radius * Math.cos(this.phi);
        const z = this.target.z + this.radius * Math.sin(this.phi) * Math.cos(this.theta);

        this.camera.position.set(x, y, z);
        this.camera.lookAt(this.target);
    }
}