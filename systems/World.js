export class World {
    constructor(scene) {
        this.scene = scene;
        this.gridSize = 1000;
        this.ghostWall = null;

        // --- Procedural Spawner Properties ---
        this.asteroids = [];
        this.matterPerAsteroid = 500;
        // High density: 100,000 Matter = 200 Asteroids minimum
        this.minTotalMatter = 100000; 
        this.worldSeed = 12345; 
        
        // Assumes GLTFLoader is available via <script> or global THREE
        this.loader = typeof THREE.GLTFLoader !== 'undefined' ? new THREE.GLTFLoader() : null;
    }

    init() {
        this._createLights();
        this._createGrid();
        this._createGround();
        this._createStars();
        this._createGhostCursor();

        // Trigger the high-density generation
        this._generateAsteroids();
    }

    _generateAsteroids() {
        let spawnedMatter = 0;
        let currentSeed = this.worldSeed;

        // Seeded random helper
        const seededRandom = () => {
            const x = Math.sin(currentSeed++) * 10000;
            return x - Math.floor(x);
        };

        while (spawnedMatter < this.minTotalMatter) {
            // common (90%) = Cluster | rare (10%) = Solo
            const isCluster = seededRandom() > 0.1;

            if (isCluster) {
                const clusterSize = Math.floor(seededRandom() * 10) + 5; 
                const centerX = (seededRandom() - 0.5) * (this.gridSize * 0.9);
                const centerZ = (seededRandom() - 0.5) * (this.gridSize * 0.9);

                for (let i = 0; i < clusterSize; i++) {
                    const offX = (seededRandom() - 0.5) * 80;
                    const offZ = (seededRandom() - 0.5) * 80;
                    this._spawnAsteroid(centerX + offX, centerZ + offZ, seededRandom);
                    spawnedMatter += this.matterPerAsteroid;
                    
                    if (spawnedMatter >= this.minTotalMatter) break;
                }
            } else {
                const x = (seededRandom() - 0.5) * (this.gridSize * 0.9);
                const z = (seededRandom() - 0.5) * (this.gridSize * 0.9);
                this._spawnAsteroid(x, z, seededRandom);
                spawnedMatter += this.matterPerAsteroid;
            }
        }
        console.log(`Asteroid generation complete. Total Matter: ${spawnedMatter}`);
    }

    _spawnAsteroid(x, z, rng) {
        // 1. Setup Placeholder (Primitive)
        const size = rng() * 6 + 2; 
        const geometry = new THREE.IcosahedronGeometry(size, 0);
        const material = new THREE.MeshPhongMaterial({ 
            color: 0x555555,
            flatShading: true 
        });
        const asteroid = new THREE.Mesh(geometry, material);
        
        asteroid.position.set(x, size / 2, z);
        asteroid.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
        asteroid.userData = { matter: this.matterPerAsteroid };
        
        this.scene.add(asteroid);
        this.asteroids.push(asteroid);

        // 2. Asset Integration (Dynamic Swapping)
        // Ensure asteroid_1.glb is in: [YourProject]/assets/asteroid_1.glb
        if (this.loader) {
            this.loader.load('./assets/asteroid_1.glb', (gltf) => {
                const model = gltf.scene;
                
                // Copy transform from placeholder
                model.position.copy(asteroid.position);
                model.rotation.copy(asteroid.rotation);
                
                // Apply the procedural scale
                model.scale.set(size, size, size);

                // Credit: whynomakethings on itch.io (Swap placeholder for model)
                this.scene.remove(asteroid);
                this.scene.add(model);
            }, undefined, (error) => {
                console.warn("Could not load GLB. Ensure you are using a local server.", error);
            });
        }
    }

    _createLights() {
        const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
        directionalLight.position.set(200, 300, 100);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);
    }

    _createGrid() {
        const gridDivisions = 100;
        const gridHelper = new THREE.GridHelper(this.gridSize, gridDivisions, 0x00ffff, 0x444444);
        gridHelper.material.transparent = true;
        gridHelper.material.opacity = 0.3;
        gridHelper.position.y = 0.05;
        this.scene.add(gridHelper);
    }

    _createGround() {
        const planeGeometry = new THREE.PlaneGeometry(this.gridSize, this.gridSize);
        const planeMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x0a0a0a, 
            side: THREE.DoubleSide, 
            depthWrite: false 
        });
        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        plane.rotation.x = -Math.PI / 2;
        plane.receiveShadow = true;
        this.scene.add(plane);
    }

    _createStars() {
        const starGeometry = new THREE.BufferGeometry();
        const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.7 });
        const starVertices = [];
        for (let i = 0; i < 10000; i++) {
            const x = (Math.random() - 0.5) * 2000;
            const y = (Math.random() - 0.5) * 2000;
            const z = (Math.random() - 0.5) * 2000;
            starVertices.push(x, y, z);
        }
        starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
        const stars = new THREE.Points(starGeometry, starMaterial);
        this.scene.add(stars);
    }

    _createGhostCursor() {
        const geo = new THREE.BoxGeometry(10, 10, 10);
        const mat = new THREE.MeshPhongMaterial({ 
            color: 0x00ff00, 
            transparent: true, 
            opacity: 0.5 
        });
        this.ghostWall = new THREE.Mesh(geo, mat);
        this.ghostWall.position.y = 5; 
        this.ghostWall.visible = false;
        this.scene.add(this.ghostWall);
    }
}