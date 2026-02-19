import { Input } from './Input.js';
import { CameraControls } from '../systems/CameraControls.js';
import { World } from '../systems/World.js';
import { GridSystem } from '../systems/GridSystem.js';
import { NPCSystem } from '../systems/NPCSystem.js';
import { OxygenSystem } from '../systems/OxygenSystem.js';
import { ResourceManager } from '../systems/ResourceManager.js';
import { HUD } from '../ui/HUD.js';

export class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, canvas: this.canvas });
        this.clock = new THREE.Clock();
        
        // Time Management
        this.timeScale = 1.0;
    }

    start() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        
        // 1. Core Data Systems
        this.resourceManager = new ResourceManager();
        this.input = new Input(this.canvas);
        
        // 2. UI
        this.hud = new HUD(this.input, this.resourceManager);
        
        // Inject Time Control
        this.hud.setTimeScale = (scale) => {
            this.timeScale = scale;
            console.log(`Time Scale set to: ${this.timeScale}x`);
        };

        // 3. World & Rendering
        this.world = new World(this.scene);
        this.world.init();
        this.cameraControls = new CameraControls(this.camera, this.input);
        
        // 4. Game Logic Systems
        this.gridSystem = new GridSystem(this.scene, this.camera, this.input, this.world, this.resourceManager);
        this.oxygenSystem = new OxygenSystem(this.gridSystem, this.resourceManager);
        
        this.gridSystem.setOxygenSystem(this.oxygenSystem);

        this.npcSystem = new NPCSystem(this.scene, this.gridSystem, this.input, this.hud, this.resourceManager);
        
        this.hud.npcManager = this.npcSystem;

        this._animate();
    }

    _animate() {
        requestAnimationFrame(() => this._animate());
        
        // Apply Time Scale to Delta Time
        let dt = this.clock.getDelta();
        dt *= this.timeScale;
        
        // Clamp dt to prevent explosion after pause or lag spike
        if (dt > 0.5) dt = 0.5; 

        // Update Systems
        this.resourceManager.update(dt);
        this.cameraControls.update(); // Camera usually runs on real-time, but here it's fine
        this.gridSystem.update(dt);
        this.npcSystem.update(dt);
        this.oxygenSystem.update(dt, this.npcSystem.npcs); 
        this.hud.update(this.oxygenSystem);
        this.input.resetDeltas();
        
        this.renderer.render(this.scene, this.camera);
    }
}