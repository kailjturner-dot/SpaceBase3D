export class OxygenSystem {
    constructor(gridSystem, resourceManager) {
        this.gridSystem = gridSystem;
        this.resourceManager = resourceManager;
        this.o2Levels = {}; 
        this.sealedCells = new Set(); 
        this.updateTimer = 0;
        this.systemPowered = false; // Track power state persistently
    }

    update(dt, npcs) {
        this.updateTimer += dt;
        
        // 1. Periodic Checks (Geometry & Power) - runs every 0.5s
        if (this.updateTimer > 0.5) {
            const generators = this.gridSystem.resources.filter(r => r.type === 'o2');
            
            // A. Check Geometry (Seals) regardless of power
            // We need to know if the room is physically sealed to hold air.
            this._checkRoomSeals(generators);

            // B. Check Power
            // Power consumption: 2 Energy per generator per second
            // Calculated for the 0.5s interval
            if (generators.length > 0) {
                const energyCost = generators.length * 2 * 0.5; 
                this.systemPowered = this.resourceManager.consumeEnergy(energyCost);
            } else {
                this.systemPowered = false;
            }
            
            this.updateTimer = 0;
        }

        // 2. Adjust O2 Levels based on State
        for (const key in this.o2Levels) {
            if (this.sealedCells.has(key)) {
                // Case: Room is physically sealed
                if (this.systemPowered) {
                    // Powered: actively pump oxygen
                    this.o2Levels[key] = Math.min(100, this.o2Levels[key] + 15 * dt);
                } else {
                    // Unpowered: Room is sealed, so it HOLDS oxygen (no decay)
                    // We simply do nothing here, preserving the current value.
                }
            } else {
                // Case: Room is unsealed (Vacuum exposure)
                // "Slow down the rate of which o2 leaves"
                // Reduced decay rate from 5.0 to 0.5 for slower leaks
                this.o2Levels[key] = Math.max(0, this.o2Levels[key] - 0.5 * dt);
            }
        }
    }

    getO2At(x, z) {
        const key = `${x},${z}`;
        if (this.o2Levels[key] === undefined) {
            this.o2Levels[key] = 0; 
        }
        return this.o2Levels[key];
    }

    _checkRoomSeals(generators) {
        const newSealedSet = new Set();
        const grid = this.gridSystem;

        generators.forEach(maker => {
            const startKey = `${maker.x},${maker.z}`;
            // If the generator itself has no floor or is walled over, skip
            if (!grid.placedFloors[startKey]) return;
            if (newSealedSet.has(startKey)) return;

            // BFS Flood Fill
            const queue = [startKey];
            const roomVisited = new Set(); // Local to this room attempt
            roomVisited.add(startKey);
            
            let isSealed = true;
            const roomCells = [];
            let head = 0;

            while (head < queue.length) {
                const curr = queue[head++];
                roomCells.push(curr);

                // Fail-safe: Room too big (or open space)
                if (roomCells.length > 400) {
                    isSealed = false;
                    break;
                }

                const [cx, cz] = curr.split(',').map(Number);
                const neighbors = [
                    {x: cx+10, z: cz}, {x: cx-10, z: cz}, 
                    {x: cx, z: cz+10}, {x: cx, z: cz-10}
                ];

                for (let n of neighbors) {
                    const nKey = `${n.x},${n.z}`;
                    if (roomVisited.has(nKey)) continue;

                    // 1. Check Boundary Condition (Is this a Wall or Airlock?)
                    const wall = grid.placedWalls[nKey];
                    // Strict Sealing: A seal is a Completed Wall or Completed Airlock.
                    // A Standard Door is NOT a seal (it leaks).
                    const isSeal = wall && wall.isComplete && (wall.isWall || wall.isAirlock);
                    
                    if (isSeal) {
                        // It's a boundary, we don't traverse past it, 
                        // but the room is still potentially valid.
                        continue; 
                    }

                    // 2. Check Floor Condition (Vacuum check)
                    // If it's not a seal, it MUST have a floor to hold air.
                    if (!grid.placedFloors[nKey]) {
                        // Leaked into space (no floor)
                        isSealed = false;
                        // We can stop searching this branch immediately
                        break;
                    }

                    // 3. Continue Fill (Through empty space or Standard Doors)
                    roomVisited.add(nKey);
                    queue.push(nKey);
                }
                
                if (!isSealed) break;
            }

            if (isSealed) {
                roomCells.forEach(cell => newSealedSet.add(cell));
            }
        });

        this.sealedCells = newSealedSet;
        // Initialize O2 entry if missing
        this.sealedCells.forEach(key => {
            if (this.o2Levels[key] === undefined) this.o2Levels[key] = 0;
        });
    }
}