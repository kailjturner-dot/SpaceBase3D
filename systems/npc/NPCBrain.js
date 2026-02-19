import { TRAITS, EMOTIONS } from './NPCModel.js';

export class NPCBrain {
    constructor(model, group, systems) {
        this.model = model;
        this.group = group; // The THREE.Group
        this.systems = systems; // { grid, resources, npcManager }
        
        this.state = 'idle'; // idle, moving, working, sleeping, socializing, tantrum, dead, moving_to_safety
        this.subState = '';  
        this.targetPos = null; 
        this.lookTarget = null; 
        this.path = [];
        this.workTimer = 0;
        this.carrying = 0;
        
        this.baseSpeed = 15; // World units per sec
    }

    update(dt) {
        const grid = this.systems.grid;
        
        // 1. Sense Environment
        const myX = this.group.position.x;
        const myZ = this.group.position.z;
        const cellX = Math.round(myX / 10) * 10 + 5;
        const cellZ = Math.round(myZ / 10) * 10 + 5;
        
        const nearbyNPCs = this.systems.npcManager.getNPCsInRange(myX, myZ, 20);
        const context = {
            isSleeping: this.state === 'sleeping',
            isSocializing: this.state === 'socializing',
            isRelaxing: this.state === 'relaxing',
            isWorking: ['working', 'moving_to_work', 'mining', 'deconstructing'].includes(this.state),
            isCrowded: nearbyNPCs.length > 3,
            o2Level: grid.oxygenSystem ? grid.oxygenSystem.getO2At(cellX, cellZ) : 100
        };

        this.model.updateStats(dt, context);

        // 2. Dead Check
        if (this.model.isDead) {
            this.state = 'dead';
            this.path = [];
            this._updateVisuals(dt);
            return;
        }

        // 3. State Machine Logic
        this._handleLogic(dt, nearbyNPCs, context);

        // 4. Physics / Movement
        this._handleMovement(dt);
        
        // 5. Visual Updates
        this._updateVisuals(dt);
    }

    _handleLogic(dt, nearbyNPCs, context) {
        // 1. Safety Override: If suit is failing OR we are simply outside with no job
        // "Always prefer to hang out inside"
        const isUnsafe = context.o2Level < 20;
        const isIdle = this.state === 'idle' || this.state === 'wandering';
        const isMovingToSafe = this.state === 'moving_to_safety';

        // Critical Suit Failure Logic (Panic)
        if (this.model.suitOxygen < 60 && !isMovingToSafe && this.state !== 'sleeping') {
             if (this._findAndGoToSafety()) return;
        }

        // General "Don't hang out outside" Logic
        // If we are idle and outside, go inside immediately.
        if (isUnsafe && isIdle) {
            if (this._findAndGoToSafety()) return;
        }

        if (this.model.emotion === EMOTIONS.ANGRY && this.state !== 'tantrum' && this.state !== 'sleeping') {
            this._enterState('tantrum');
            return;
        }

        if (this.model.energy <= 0 && this.state !== 'sleeping') {
            this._enterState('sleeping'); 
            return;
        }

        if (this.state === 'tantrum') {
            this.model.stress -= dt * 5; 
            if (this.model.stress < 40) this._enterState('idle');
            return;
        }

        if (this.state === 'moving_to_safety') {
            return; // Wait to arrive
        }

        if (this.workTimer > 0) {
            this.workTimer -= dt;
            if (this.workTimer <= 0) this._completeAction();
            return;
        }

        if (this.path.length > 0) return; 

        if (this.state === 'idle' || this.state === 'wandering') {
            this._decideNextAction(nearbyNPCs);
        }
    }

    _decideNextAction(nearbyNPCs) {
        // Critical Needs
        if (this.model.hunger < 50) { if(this._findAndGoTo('food', 'eating')) return; }
        if (this.model.thirst < 50) { if(this._findAndGoTo('water', 'drinking')) return; }
        if (this.model.energy < 30) { if(this._findAndGoToStructure(this.systems.grid.beds, 'sleeping')) return; }

        // Social
        if (this.model.social < 40 && this.model.trait !== TRAITS.LONER) {
            const friend = nearbyNPCs.find(n => n.brain !== this && n.brain.state === 'idle');
            if (friend) {
                this._interactWith(friend.brain);
                return;
            }
        }

        // Fun/Stress
        if (this.model.fun < 30 || (this.model.stress > 50 && this.model.stress < 80)) {
            if (this._findAndGoToStructure(this.systems.grid.lounges, 'relaxing')) return;
        }

        // Work
        if (this.model.workSpeedMultiplier > 0) {
            this._findWork();
        } else {
            this._wander(); 
        }
    }

    _handleMovement(dt) {
        if (this.path.length > 0) {
            const target = this.path[0];
            const current = this.group.position;
            
            // Check blockage (unless we are deconstructing the thing blocking us, handled in findWork)
            // Ideally, construction sites block movement, but if we are the worker assigned to it, 
            // we path to neighbor.
            if (this.systems.grid.isBlocked(target.x, target.z)) {
                // If the target IS our job, and we are close, it's fine. 
                // But generally pathfinding avoids blocked nodes.
                // If a wall appeared suddenly:
                this.path = []; 
                this._enterState('idle');
                return;
            }

            const dir = new THREE.Vector3(target.x - current.x, 0, target.z - current.z);
            const dist = dir.length();
            const speed = this.baseSpeed * this.model.moveSpeedMultiplier;

            if (dist < 0.8) { 
                this.path.shift(); 
                if (this.path.length === 0) this._arrive();
            } else {
                dir.normalize();
                this.group.position.addScaledVector(dir, speed * dt);
                
                const lookTarget = new THREE.Vector3(target.x, this.group.position.y, target.z);
                this.group.lookAt(lookTarget);
            }
        }
    }

    _interactWith(otherBrain) {
        const dist = this.group.position.distanceTo(otherBrain.group.position);
        if (dist > 8) {
            this.path = this._aStar(this.group.position, otherBrain.group.position);
            if (this.path.length > 0) {
                this.state = 'moving_to_friend';
                this.targetBrain = otherBrain;
            }
        } else {
            this._enterState('socializing');
            otherBrain._enterState('socializing');
            this.workTimer = 5;
            otherBrain.workTimer = 5;
            this.group.lookAt(otherBrain.group.position);
            otherBrain.group.lookAt(this.group.position);
        }
    }

    _findWork() {
        const pos = this.group.position;
        const grid = this.systems.grid;

        if (this.model.role === 'engineer') {
            // Combine Construction and Deconstruction jobs
            const buildJobs = grid.constructionJobs.filter(j => !j.isComplete);
            const demoJobs = grid.deconstructionJobs.filter(j => !j.isComplete);
            
            // Prioritize Deconstruction slightly or treat equal? Let's mix.
            const allJobs = [...buildJobs, ...demoJobs];

            if (allJobs.length > 0) {
                allJobs.sort((a,b) => pos.distanceToSquared(new THREE.Vector3(a.x,0,a.z)) - pos.distanceToSquared(new THREE.Vector3(b.x,0,b.z)));
                
                for (let job of allJobs) {
                    // Find accessible neighbor
                    const approaches = [
                        {x: job.x+10, z: job.z}, {x: job.x-10, z: job.z},
                        {x: job.x, z: job.z+10}, {x: job.x, z: job.z-10}
                    ].filter(p => !grid.isBlocked(p.x, p.z));

                    if (approaches.length === 0) continue;

                    approaches.sort((a,b) => pos.distanceToSquared(new THREE.Vector3(a.x,0,a.z)) - pos.distanceToSquared(new THREE.Vector3(b.x,0,b.z)));
                    
                    const path = this._aStar(pos, approaches[0]);
                    if (path.length > 0) {
                        this.currentJob = job;
                        this.path = path;
                        // State depends on job type
                        this.state = job.type === 'deconstruct' ? 'moving_to_demo' : 'moving_to_work';
                        this.lookTarget = new THREE.Vector3(job.x, 0, job.z); 
                        return;
                    }
                }
            }
            this._wander();
        } 
        else if (this.model.role === 'miner') {
            if (this.carrying > 0) {
                if (this._findAndGoToStructure(grid.storagePads, 'depositing')) return;
            } else {
                const rocks = grid.asteroids.filter(a => a.matterRemaining > 0);
                if (rocks.length > 0) {
                     rocks.sort((a,b) => pos.distanceToSquared(new THREE.Vector3(a.x,0,a.z)) - pos.distanceToSquared(new THREE.Vector3(b.x,0,b.z)));
                     const rock = rocks[0];
                     const path = this._aStar(pos, {x: rock.x, z: rock.z});
                     if (path.length > 0) {
                        this.currentJob = rock;
                        this.path = path;
                        this.state = 'moving_to_mine';
                     }
                } else {
                    this._wander();
                }
            }
        }
        else {
            this._wander();
        }
    }

    _findAndGoToSafety() {
        const o2Map = this.systems.grid.oxygenSystem.o2Levels;
        const candidates = [];
        for (let key in o2Map) {
            if (o2Map[key] > 50) {
                const [cx, cz] = key.split(',').map(Number);
                candidates.push({x: cx, z: cz});
            }
        }
        if (candidates.length === 0) return false;

        const pos = this.group.position;
        candidates.sort((a,b) => pos.distanceToSquared(new THREE.Vector3(a.x,0,a.z)) - pos.distanceToSquared(new THREE.Vector3(b.x,0,b.z)));

        for (let target of candidates) {
            const path = this._aStar(pos, target);
            if (path.length > 0) {
                this.path = path;
                this.state = 'moving_to_safety';
                return true;
            }
        }
        return false;
    }

    _completeAction() {
        if (this.state === 'eating') this.model.hunger = 100;
        if (this.state === 'drinking') this.model.thirst = 100;
        if (this.state === 'sleeping') this.model.energy = 100;
        if (this.state === 'relaxing') { this.model.fun = 100; this.model.stress = 0; }
        if (this.state === 'socializing') { this.model.social = 100; this.model.happiness += 10; }
        
        if (this.state === 'working' && this.currentJob) {
             this.systems.grid.completeJob(this.currentJob);
             this.model.fun -= 5; 
        }
        if (this.state === 'deconstructing' && this.currentJob) {
            this.systems.grid.completeJob(this.currentJob); // Handles removal
            this.model.fun -= 5;
        }

        if (this.state === 'mining') {
            this.carrying = 10;
            this.model.energy -= 10;
        }
        if (this.state === 'depositing') {
            this.systems.resources.addMatter(this.carrying);
            this.carrying = 0;
        }

        this._enterState('idle');
    }

    _enterState(newState) {
        this.state = newState;
        this.workTimer = 0;

        if (newState === 'eating') this.workTimer = 3;
        if (newState === 'drinking') this.workTimer = 2;
        if (newState === 'sleeping') this.workTimer = 15;
        if (newState === 'relaxing') this.workTimer = 8;
        if (newState === 'working') this.workTimer = 4 / this.model.workSpeedMultiplier;
        if (newState === 'deconstructing') this.workTimer = 4 / this.model.workSpeedMultiplier;
        if (newState === 'mining') this.workTimer = 5 / this.model.workSpeedMultiplier;
        if (newState === 'depositing') this.workTimer = 1;
        
        if (newState === 'moving_to_safety') this.workTimer = 0; 
    }

    _arrive() {
        if (this.lookTarget) {
            this.group.lookAt(this.lookTarget.x, this.group.position.y, this.lookTarget.z);
            this.lookTarget = null;
        }

        if (this.state === 'moving_to_work') this._enterState('working');
        else if (this.state === 'moving_to_demo') this._enterState('deconstructing');
        else if (this.state === 'moving_to_mine') this._enterState('mining');
        else if (this.state === 'moving_to_safety') this._enterState('idle'); 
        else if (this.state === 'moving_to_friend') {
            if (this.targetBrain && this.targetBrain.group.position.distanceTo(this.group.position) < 10) {
                this._interactWith(this.targetBrain);
            } else {
                this._enterState('idle');
            }
        }
        else if (['food', 'water', 'sleeping', 'relaxing', 'depositing'].includes(this.state)) {
             if (this.state === 'food') this._enterState('eating');
             else if (this.state === 'water') this._enterState('drinking');
             else if (this.state === 'sleeping') this._enterState('sleeping'); 
             else if (this.state === 'relaxing') this._enterState('relaxing');
             else if (this.state === 'depositing') this._enterState('depositing');
        }
        else {
            this._enterState('idle');
        }
    }
    
    _findAndGoTo(type, actionState) {
        const list = this.systems.grid.resources.filter(r => r.type === type);
        return this._pathToList(list, type); 
    }

    _findAndGoToStructure(list, actionState) {
        if (!list) return false;
        return this._pathToList(list, actionState); 
    }

    _pathToList(list, tempState) {
        if (!list || list.length === 0) return false;
        const pos = this.group.position;
        list.sort((a,b) => pos.distanceToSquared(new THREE.Vector3(a.x,0,a.z)) - pos.distanceToSquared(new THREE.Vector3(b.x,0,b.z)));
        
        for(let target of list) {
            const path = this._aStar(pos, {x: target.x, z: target.z});
            if (path.length > 0) {
                this.path = path;
                this.state = tempState; 
                return true;
            }
        }
        return false;
    }

    _wander() {
        if (Math.random() > 0.05) return;
        const r = 30;
        const tx = this.group.position.x + (Math.random()-0.5)*r;
        const tz = this.group.position.z + (Math.random()-0.5)*r;
        const path = this._aStar(this.group.position, {x: tx, z: tz});
        if (path.length > 0) {
            this.path = path;
            this.state = 'wandering';
        }
    }

    _aStar(start, end) {
        const g = 10;
        const grid = this.systems.grid;
        const sNode = { x: Math.floor(start.x/g)*g + 5, z: Math.floor(start.z/g)*g + 5 };
        const eNode = { x: Math.floor(end.x/g)*g + 5, z: Math.floor(end.z/g)*g + 5 };

        if (grid.isBlocked(eNode.x, eNode.z)) return [];

        let open = [sNode];
        let cameFrom = new Map();
        let gScore = new Map(); 
        const key = (n) => `${n.x},${n.z}`;
        
        gScore.set(key(sNode), 0);
        let count = 0;
        
        while(open.length > 0 && count < 300) { 
            count++;
            let curr = open.shift(); 
            
            if (Math.abs(curr.x - eNode.x) < 2 && Math.abs(curr.z - eNode.z) < 2) {
                return this._reconstruct(cameFrom, curr);
            }
            
            const neighbors = [
                {x:curr.x+10, z:curr.z}, {x:curr.x-10, z:curr.z}, 
                {x:curr.x, z:curr.z+10}, {x:curr.x, z:curr.z-10}
            ];

            for (let next of neighbors) {
                if (grid.isBlocked(next.x, next.z)) continue;

                const newG = gScore.get(key(curr)) + 1;
                if (!gScore.has(key(next)) || newG < gScore.get(key(next))) {
                    gScore.set(key(next), newG);
                    cameFrom.set(key(next), curr);
                    open.push(next);
                }
            }
        }
        return [];
    }

    _reconstruct(cameFrom, curr) {
        const p = [];
        const key = (n) => `${n.x},${n.z}`;
        while (cameFrom.has(key(curr))) {
            p.unshift(new THREE.Vector3(curr.x, 0, curr.z));
            curr = cameFrom.get(key(curr));
        }
        return p;
    }

    _updateVisuals(dt) {
        const mesh = this.group.children[0]; 
        const visor = this.group.children[1];

        if (this.state === 'dead') {
             mesh.rotation.x = Math.PI / 2;
             mesh.position.y = 1;
             mesh.material.color.setHex(0x333333);
             return;
        }
        
        // Suit Visor Toggle & Grey Suit Logic
        visor.visible = this.model.wearingSuit;
        
        if (this.model.wearingSuit) {
            // Outside: Grey Space Suit
            mesh.material.color.setHex(0x999999); 
        } else {
            // Inside: Role Color
            if (this.model.role === 'engineer') mesh.material.color.setHex(0xff9900);
            if (this.model.role === 'miner') mesh.material.color.setHex(0x888888);
            if (this.model.role === 'security') mesh.material.color.setHex(0xff0000);
            if (this.model.role === 'scientist') mesh.material.color.setHex(0x00ffff);
        }

        // Action Overrides (Animation visualization)
        if (this.state === 'tantrum') {
            mesh.position.y = 3 + Math.sin(Date.now() * 0.02) * 2;
            mesh.material.color.setHex(0xff0000); 
        } 
        else if (this.state === 'socializing') {
             mesh.position.y = 3 + Math.sin(Date.now() * 0.01) * 0.5;
             mesh.material.color.setHex(0xffff00); 
        }
        else if (this.state === 'sleeping') {
            mesh.rotation.z = Math.PI / 2;
            mesh.position.y = 1;
        } 
        else {
            mesh.rotation.z = 0;
            mesh.position.y = 3;
        }
    }
}