export class GridSystem {
    constructor(scene, camera, input, world, resourceManager) {
        this.scene = scene;
        this.camera = camera;
        this.input = input;
        this.world = world;
        this.resourceManager = resourceManager;
        this.raycaster = new THREE.Raycaster();
        this.gridSize = 10;
        
        this.placedWalls = {}; 
        this.placedFloors = {}; 
        
        // Structures
        this.resources = []; 
        this.solarArrays = []; 
        this.storagePads = []; 
        this.asteroids = []; 
        
        // Phase 2 Furniture
        this.beds = [];
        this.lounges = [];

        this.constructionJobs = [];
        this.deconstructionJobs = []; 

        this.wallOrientation = 'H';
        this.oxygenSystem = null;

        this.lastRotatePress = false;
        this.hasWarnedLoader = false; 

        this.costs = {
            'build': 5, 'door': 5, 'airlock': 15, 'floor': 2,
            'solar': 25, 'storage': 10, 'o2': 15,
            'food': 10, 'water': 10, 'asteroid': 0,
            'bed': 8, 'lounge': 8
        };

        // --- OPTIMIZATION: Cached Materials ---
        // Create the ghost material ONCE here, instead of 60 times a second
        this.ghostMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x00ff00, 
            transparent: true, 
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            depthWrite: false, 
            depthTest: false,
            side: THREE.DoubleSide
        });
        // Mark as cached so we don't accidentally dispose it
        this.ghostMaterial.userData = { isCached: true };

        // --- GLB Loader Setup ---
        this.loader = typeof THREE.GLTFLoader !== 'undefined' ? new THREE.GLTFLoader() : null;
        this.modelCache = {}; 
        
        this.assets = {
            'wall_pillar': './assets/wall_pillar.glb',
            'wall_segment': './assets/wall_segment.glb',
            'floor': './assets/floor.glb',
            'water': './assets/water_dispenser.glb',
            'food': './assets/food_dispenser.glb',
            'o2': './assets/oxygen_generator.glb',
            'solar': './assets/solar_panel.glb',
            'storage': './assets/storage_pad.glb',
            'asteroid': './assets/asteroid_1.glb',
            'bed': './assets/bed.glb',
            'door': './assets/door.glb',
            'airlock': './assets/airlock.glb'
        };
    }

    setOxygenSystem(os) {
        this.oxygenSystem = os;
    }

    update(dt) {
        if (this.solarArrays.length > 0) {
            this.resourceManager.generateEnergy(5 * dt * this.solarArrays.length);
        }

        const rotatePressed = this.input.keys.r;
        if (rotatePressed && !this.lastRotatePress) {
            if (this.input.activeTool === 'build' || this.input.activeTool === 'door' || this.input.activeTool === 'airlock') {
                this.wallOrientation = this.wallOrientation === 'H' ? 'V' : 'H';
            }
        }
        this.lastRotatePress = rotatePressed;

        const ghost = this.world.ghostWall;

        if (!this.input.activeTool) {
            if (ghost) ghost.visible = false;
            if (this.oxygenSystem) this._updateFloorColors(false);
            return;
        }

        const intersect = this._getGridIntersection();
        if (!intersect) { 
            if(ghost) ghost.visible = false; 
            return; 
        }

        const snapX = Math.floor(intersect.point.x / this.gridSize) * this.gridSize + 5;
        const snapZ = Math.floor(intersect.point.z / this.gridSize) * this.gridSize + 5;
        
        this._updateGhost(snapX, snapZ);

        if (this.oxygenSystem) {
            const showO2 = this.input.activeTool === 'o2' || this.input.activeTool === 'o2_sensor';
            this._updateFloorColors(showO2);
        }

        if (this.input.isLeftClicked) {
            this._handleToolClick(snapX, snapZ);
        }
    }

    _handleToolClick(x, z) {
        const tool = this.input.activeTool;
        
        if (tool === 'delete') {
            this._markForDeconstruction(x, z);
            return;
        }

        const cost = this.costs[tool] || 0;
        if (!this.resourceManager.hasMatter(cost)) return; 

        let success = false;

        if (tool === 'build') success = this._addConstruction(x, z, 'wall');
        else if (tool === 'door') success = this._addConstruction(x, z, 'door');
        else if (tool === 'airlock') success = this._addConstruction(x, z, 'airlock');
        else if (tool === 'floor') success = this._placeFloor(x, z);
        else if (['food', 'water', 'o2'].includes(tool)) success = this._placeResource(x, z, tool);
        else if (tool === 'solar') success = this._placeSolar(x, z);
        else if (tool === 'storage') success = this._placeStorage(x, z);
        else if (tool === 'asteroid') success = this._placeAsteroid(x, z);
        else if (tool === 'bed') success = this._placeBed(x, z);
        else if (tool === 'lounge') success = this._placeLounge(x, z);

        if (success) {
            this.resourceManager.deductMatter(cost);
        }
    }

    _markForDeconstruction(x, z) {
        if (this.deconstructionJobs.find(j => j.x === x && j.z === z)) return;

        let target = null;
        let category = '';

        if (this.placedWalls[`${x},${z}`]) {
            target = this.placedWalls[`${x},${z}`];
            category = 'wall';
        }
        else {
             const findObj = (arr) => arr.find(i => i.x === x && i.z === z);
             const r = findObj(this.resources);
             const s = findObj(this.solarArrays);
             const p = findObj(this.storagePads);
             const b = findObj(this.beds);
             const l = findObj(this.lounges);
             
             if (r) { target = r; category = 'resource'; }
             else if (s) { target = s; category = 'solar'; }
             else if (p) { target = p; category = 'storage'; }
             else if (b) { target = b; category = 'bed'; }
             else if (l) { target = l; category = 'lounge'; }
        }

        if (target) {
            const applyRed = (obj) => {
                if (obj.traverse) {
                    obj.traverse(c => { if(c.isMesh) c.material.color.setHex(0xff0000); });
                }
            };

            if (target.group) applyRed(target.group);
            else if (target.mesh) applyRed(target.mesh);

            const job = { x, z, type: 'deconstruct', target, category, isComplete: false };
            this.deconstructionJobs.push(job);
        }
    }

    completeJob(job) {
        if (job.type === 'deconstruct') {
            this._removeAt(job.x, job.z);
            job.isComplete = true;
            this.deconstructionJobs = this.deconstructionJobs.filter(j => j !== job);
        } else {
            job.isComplete = true;
            this._refreshWallConnections(job.x, job.z);
        }
    }

    _removeAt(x, z) {
        if (this.placedWalls[`${x},${z}`]) {
            this.scene.remove(this.placedWalls[`${x},${z}`].group);
            delete this.placedWalls[`${x},${z}`];
        }
        if (this.placedFloors[`${x},${z}`]) {
            this.scene.remove(this.placedFloors[`${x},${z}`].group);
            delete this.placedFloors[`${x},${z}`];
        }

        const area = [[10,0], [-10,0], [0,10], [0,-10]];
        area.forEach(n => {
            this._refreshWallConnections(x + n[0], z + n[1]);
            this._refreshFloorConnections(x + n[0], z + n[1]);
        });

        const removeObj = (arr) => {
            const idx = arr.findIndex(r => r.x === x && r.z === z);
            if (idx !== -1) {
                const obj = arr[idx].group || arr[idx].mesh;
                this.scene.remove(obj);
                arr.splice(idx, 1);
            }
        };

        removeObj(this.resources);
        removeObj(this.solarArrays);
        removeObj(this.storagePads);
        removeObj(this.asteroids);
        removeObj(this.beds);
        removeObj(this.lounges);
    }
    
    _updateFloorColors(showHeatMap) {
        for (const key in this.placedFloors) {
            const floorData = this.placedFloors[key];
            floorData.group.traverse((child) => {
                if (child.isMesh) {
                    if (showHeatMap) {
                        const [x, z] = key.split(',').map(Number);
                        const o2Level = this.oxygenSystem.getO2At(x, z);
                        const t = o2Level / 100;
                        const r = t < 0.5 ? 1.0 : 1.0 - (t - 0.5) * 2;
                        const g = t < 0.5 ? t * 2 : 1.0;
                        child.material.color.setRGB(r, g, 0.0);
                    } else {
                        child.material.color.setHex(0xaaaaaa);
                    }
                }
            });
        }
    }

    // --- HELPER: Load Model with Fallback ---
    _loadModel(key, parentGroup, materialOverride, transform = {}) {
        const applyTransformAndMat = (obj) => {
            if (transform.pos) obj.position.set(transform.pos.x, transform.pos.y, transform.pos.z);
            if (transform.rot) obj.rotation.set(transform.rot.x, transform.rot.y, transform.rot.z);
            if (transform.scale) obj.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);

            if (materialOverride) {
                obj.traverse((child) => {
                    if (child.isMesh) {
                        // Note: cloning creates a new material instance that must be disposed later!
                        // In _updateGhost, we pass the single cached material, so avoiding cloning here is tricky unless handled
                        // For static structures, cloning is fine. For ghosts, we reuse.
                        child.material = materialOverride; 
                    }
                });
            }
            parentGroup.add(obj);
        };

        if (!this.loader) {
            if (!this.hasWarnedLoader) {
                console.warn("GLTFLoader not found!");
                this.hasWarnedLoader = true;
            }
            const geo = new THREE.BoxGeometry(1, 1, 1);
            const mat = materialOverride ? materialOverride : new THREE.MeshPhongMaterial({ color: 0x888888 });
            const mesh = new THREE.Mesh(geo, mat);
            applyTransformAndMat(mesh);
            return;
        }

        const url = this.assets[key];
        if (!url) return;

        if (this.modelCache[key]) {
            const clone = this.modelCache[key].clone();
            applyTransformAndMat(clone);
        } else {
            this.loader.load(url, (gltf) => {
                this.modelCache[key] = gltf.scene;
                const clone = gltf.scene.clone();
                applyTransformAndMat(clone);
            }, undefined, (err) => {
                const geo = new THREE.BoxGeometry(1, 1, 1);
                const mat = new THREE.MeshPhongMaterial({ color: 0xff0000 }); 
                const mesh = new THREE.Mesh(geo, mat);
                applyTransformAndMat(mesh);
            });
        }
    }

    _addConstruction(x, z, type) {
        const key = `${x},${z}`;
        if (this.placedWalls[key]) return false;

        const wallGroup = new THREE.Group();
        wallGroup.position.set(x, 5, z); 
        this.scene.add(wallGroup);

        const job = { 
            x, z, 
            type: type, 
            group: wallGroup, 
            isComplete: false,
            isDoor: type === 'door',
            isAirlock: type === 'airlock',
            isWall: type === 'wall'
        };
        
        this.placedWalls[key] = job;
        this.constructionJobs.push(job);

        const area = [[0,0], [10,0], [-10,0], [0,10], [0,-10]];
        area.forEach(n => {
            this._refreshWallConnections(x + n[0], z + n[1]);
            this._refreshFloorConnections(x + n[0], z + n[1]);
        });
        return true;
    }

    _refreshWallConnections(x, z) {
        const job = this.placedWalls[`${x},${z}`];
        if (!job) return;

        // Note: For placed walls, we don't dispose the materials aggressively because they are persistent
        // until deconstructed.
        while(job.group.children.length > 0) job.group.remove(job.group.children[0]);

        // Colors
        let color = 0xaaaaaa; 
        if (job.type === 'door') color = 0x00ffff;
        if (job.type === 'airlock') color = 0xff4500; 
        
        if (!job.isComplete) color = 0xffff00;

        const mat = new THREE.MeshPhongMaterial({ 
            color: color, 
            transparent: job.isComplete && (job.isDoor || job.isAirlock) ? true : false, 
            opacity: job.isComplete && (job.isDoor || job.isAirlock) ? 0.4 : 1.0 
        });

        this._buildWallMeshes(x, z, job.group, mat, job.type);
    }

    _buildWallMeshes(x, z, group, material, type) {
        const neighbors = {
            N: !!this.placedWalls[`${x},${z - 10}`],
            S: !!this.placedWalls[`${x},${z + 10}`],
            E: !!this.placedWalls[`${x + 10},${z}`],
            W: !!this.placedWalls[`${x - 10},${z}`]
        };

        this._loadModel('wall_pillar', group, material, {
            scale: { x: 2.1, y: 5, z: 2.1 }, 
            pos: { x: 0, y: 0, z: 0 }
        });

        const addBranch = (rx, rz, w, d, rotY = 0) => {
            let assetKey = 'wall_segment';
            if (type === 'door') assetKey = 'door';
            if (type === 'airlock') assetKey = 'airlock';

            this._loadModel(assetKey, group, material, {
                pos: { x: rx, y: 0, z: rz },
                scale: { x: w, y: 5, z: d }, 
                rot: { x: 0, y: rotY, z: 0 }
            });
        };

        const hasAny = neighbors.N || neighbors.S || neighbors.E || neighbors.W;

        if (!hasAny) {
            if (this.wallOrientation === 'H') addBranch(0, 0, 10, 1.5, 0);
            else addBranch(0, 0, 1.5, 10, 0);
        } else {
            if (neighbors.N) addBranch(0, -2.5, 1.5, 5.0, 0);
            if (neighbors.S) addBranch(0, 2.5, 1.5, 5.0, 0);
            if (neighbors.E) addBranch(2.5, 0, 5.0, 1.5, 0);
            if (neighbors.W) addBranch(-2.5, 0, 5.0, 1.5, 0);
        }
    }

    _placeFloor(x, z) {
        const key = `${x},${z}`;
        if (this.placedFloors[key]) return false;

        const floorGroup = new THREE.Group();
        floorGroup.position.set(x, 0.05, z);
        this.scene.add(floorGroup);

        this.placedFloors[key] = { group: floorGroup };
        
        const area = [[0,0], [10,0], [-10,0], [0,10], [0,-10]];
        area.forEach(n => this._refreshFloorConnections(x + n[0], z + n[1]));
        return true;
    }

    _refreshFloorConnections(x, z) {
        const floorData = this.placedFloors[`${x},${z}`];
        if (!floorData) return;

        const group = floorData.group;
        while(group.children.length > 0) group.remove(group.children[0]);

        this._loadModel('floor', group, null, {
            scale: { x: 10, y: 1, z: 10 }, 
            pos: { x: 0, y: 0, z: 0 }
        });

        const check = [
            { dx: 10, dz: 0, w: 4, d: 10, ox: 5, oz: 0 },
            { dx: -10, dz: 0, w: 4, d: 10, ox: -5, oz: 0 },
            { dx: 0, dz: 10, w: 10, d: 4, ox: 0, oz: 5 },
            { dx: 0, dz: -10, w: 10, d: 4, ox: 0, oz: -5 }
        ];

        check.forEach(side => {
            if (this.placedWalls[`${x + side.dx},${z + side.dz}`]) {
                this._loadModel('floor', group, null, {
                    scale: { x: side.w, y: 1, z: side.d },
                    pos: { x: side.ox, y: -0.01, z: side.oz }
                });
            }
        });
    }

    // --- MEMORY FIX: Proper Disposal Helper ---
    _disposeGroup(group) {
        while(group.children.length > 0) {
            const child = group.children[0];
            group.remove(child);
            
            // Dispose of GPU resources
            if (child.isMesh) {
                if (child.geometry) child.geometry.dispose();
                
                // Only dispose if it's not our cached/shared ghost material
                if (child.material && !child.material.userData.isCached) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }
        }
    }

    _updateGhost(x, z) {
        const ghost = this.world.ghostWall;
        if (!ghost) return;
        ghost.visible = true; 
        
        if (ghost.isMesh) ghost.material.visible = false;

        // Clean up previous frame's geometry/material SAFELY
        this._disposeGroup(ghost);

        const tool = this.input.activeTool;
        ghost.scale.set(1, 1, 1);
        ghost.rotation.set(0, 0, 0);

        // REUSE CACHED MATERIAL
        const ghostMat = this.ghostMaterial;

        // Reset default color
        ghostMat.color.setHex(0x00ff00);

        if (tool === 'build' || tool === 'door' || tool === 'airlock') {
            ghost.position.set(x, 5, z);
            if (tool === 'airlock') ghostMat.color.setHex(0xff4500); 
            if (tool === 'door') ghostMat.color.setHex(0x00ffff);
            this._buildWallMeshes(x, z, ghost, ghostMat, tool);

        } else if (tool === 'floor') {
            ghost.position.set(x, 0.1, z);
            this._loadModel('floor', ghost, ghostMat, { scale: { x: 10, y: 1, z: 10 } });

        } else if (tool === 'solar') {
             ghost.position.set(x, 0.5, z);
             this._loadModel('solar', ghost, ghostMat, { scale: { x: 3, y: 3, z: 3 } });

        } else if (tool === 'storage') {
            ghost.position.set(x, 0.25, z);
            this._loadModel('storage', ghost, ghostMat, { scale: { x: 3, y: 3, z: 3 } });

        } else if (tool === 'asteroid') {
            ghost.position.set(x, 3, z);
            this._loadModel('asteroid', ghost, ghostMat, { scale: { x: 2, y: 2, z: 2 } });

        } else if (tool === 'bed') {
            ghost.position.set(x, 1, z);
            this._loadModel('bed', ghost, ghostMat, { scale: { x: 2, y: 2, z: 2 } });

        } else if (tool === 'lounge') {
            ghost.position.set(x, 1.5, z);
            this._loadModel('lounge', ghost, ghostMat, { scale: { x: 2, y: 2, z: 2 } });

        } else if (['food', 'water', 'o2'].includes(tool)) {
            ghost.position.set(x, 1.5, z);
            if (tool === 'water') ghostMat.color.setHex(0x1d4ed8);
            if (tool === 'food') ghostMat.color.setHex(0xa16207);
            if (tool === 'o2') ghostMat.color.setHex(0x00ffff);
            
            this._loadModel(tool, ghost, ghostMat, { scale: { x: 2.5, y: 2.5, z: 2.5 } });
        }
    }

    _getGridIntersection() {
        const mouse = new THREE.Vector2((this.input.mouseX / window.innerWidth) * 2 - 1, -(this.input.mouseY / window.innerHeight) * 2 + 1);
        this.raycaster.setFromCamera(mouse, this.camera);
        return this.raycaster.intersectObjects(this.scene.children, true).find(i => i.object.type === "Mesh" && i.object.parent !== this.world.ghostWall && i.object !== this.world.ghostWall);
    }
    
    _placeResource(x, z, type) {
        if (this._isOccupied(x, z)) return false;
        
        const group = new THREE.Group();
        group.position.set(x, 1.5, z);
        this.scene.add(group);
        
        this._loadModel(type, group, null, { scale: { x: 2.5, y: 2.5, z: 2.5 } });

        this.resources.push({ x, z, type, group });
        return true;
    }

    _placeSolar(x, z) {
        if (this._isOccupied(x, z)) return false;

        const group = new THREE.Group();
        group.position.set(x, 0.5, z);
        this.scene.add(group);

        this._loadModel('solar', group, null, { scale: { x: 3, y: 3, z: 3 } });
        
        this.solarArrays.push({ x, z, group });
        return true;
    }

    _placeStorage(x, z) {
        if (this._isOccupied(x, z)) return false;

        const group = new THREE.Group();
        group.position.set(x, 0.25, z);
        this.scene.add(group);

        this._loadModel('storage', group, null, { scale: { x: 3, y: 3, z: 3 } });

        this.storagePads.push({ x, z, group });
        return true;
    }

    _placeAsteroid(x, z) {
        if (this._isOccupied(x, z)) return false;

        const group = new THREE.Group();
        group.position.set(x, 3, z);
        this.scene.add(group);

        this._loadModel('asteroid', group, null, { 
            scale: { x: 2, y: 2, z: 2 },
            rot: { x: Math.random()*Math.PI, y: Math.random()*Math.PI, z: Math.random()*Math.PI }
        });

        this.asteroids.push({ x, z, group, matterRemaining: 500 }); 
        return true;
    }

    _placeBed(x, z) {
        if (this._isOccupied(x, z)) return false;

        const group = new THREE.Group();
        group.position.set(x, 1, z);
        this.scene.add(group);

        this._loadModel('bed', group, null, { scale: { x: 2, y: 2, z: 2 } });

        this.beds.push({ x, z, group });
        return true;
    }

    _placeLounge(x, z) {
        if (this._isOccupied(x, z)) return false;

        const group = new THREE.Group();
        group.position.set(x, 1.5, z);
        this.scene.add(group);

        this._loadModel('lounge', group, null, { scale: { x: 2, y: 2, z: 2 } });

        this.lounges.push({ x, z, group });
        return true;
    }

    _isOccupied(x, z) {
        const chk = (arr) => arr.find(i => i.x === x && i.z === z);
        return chk(this.resources) || chk(this.solarArrays) || chk(this.storagePads) || chk(this.asteroids) || chk(this.beds) || chk(this.lounges) || this.placedWalls[`${x},${z}`];
    }

    isBlocked(x, z) {
        const wall = this.placedWalls[`${x},${z}`];
        if (wall) {
            if (!wall.isComplete) return true; 
            if (wall.isWall) return true; 
        }
        return false;
    }
}