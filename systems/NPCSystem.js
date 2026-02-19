import { NPCModel } from './npc/NPCModel.js';
import { NPCBrain } from './npc/NPCBrain.js';

export class NPCSystem {
    constructor(scene, gridSystem, input, hud, resourceManager) {
        this.scene = scene;
        this.gridSystem = gridSystem;
        this.input = input;
        this.hud = hud;
        this.resourceManager = resourceManager;
        
        this.npcs = []; // List of { brain, model, group }
        this.raycaster = new THREE.Raycaster();
    }

    update(dt) {
        // Spawn Logic (Debug/Tool)
        if (this.input.isLeftClicked && this.input.activeTool === 'npc') {
            const cursor = this.gridSystem.world.ghostWall.position;
            this.spawnNPC(cursor.x, cursor.z);
            this.input.isLeftClicked = false; // Prevent spam
        }

        // Selection Logic
        if (this.input.isLeftClicked && !this.input.activeTool) {
            this._checkSelection();
        }

        // Update all Brains
        this.npcs.forEach(npc => {
            npc.brain.update(dt);
        });
    }

    spawnNPC(x, z, role) {
        // 1. Visuals
        const group = new THREE.Group();
        const geometry = new THREE.CylinderGeometry(1.5, 1.5, 6, 8);
        const material = new THREE.MeshPhongMaterial({ color: 0xffcc00 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = 3;
        // Eye/Visor
        const visor = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshLambertMaterial({color: 0x000000}));
        visor.position.set(0, 4.5, 1);
        group.add(mesh);
        group.add(visor);
        
        group.position.set(x, 0, z);
        this.scene.add(group);

        // 2. Logic
        const model = new NPCModel(null, role);
        const systems = {
            grid: this.gridSystem,
            resources: this.resourceManager,
            npcManager: this
        };
        const brain = new NPCBrain(model, group, systems);

        const npcEntity = { brain, model, group };
        this.npcs.push(npcEntity);
        
        console.log(`Spawned NPC: ${model.name} (${model.trait.name})`);
    }

    getNPCsInRange(x, z, range) {
        return this.npcs.filter(n => {
            const d = Math.sqrt(Math.pow(n.group.position.x - x, 2) + Math.pow(n.group.position.z - z, 2));
            return d < range;
        });
    }

    _checkSelection() {
        const mouse = new THREE.Vector2(
            (this.input.mouseX / window.innerWidth) * 2 - 1, 
            -(this.input.mouseY / window.innerHeight) * 2 + 1
        );
        this.raycaster.setFromCamera(mouse, this.gridSystem.camera);
        
        const objects = this.npcs.map(n => n.group.children[0]); // Raycast against body mesh
        const intersects = this.raycaster.intersectObjects(objects);
        
        if (intersects.length > 0) {
            const hitMesh = intersects[0].object;
            const npc = this.npcs.find(n => n.group === hitMesh.parent);
            if (npc) {
                this.hud.showNPC(npc.model, npc.brain);
            }
        }
    }
}