export class Input {
    constructor(canvas) {
        this.canvas = canvas;
        this.keys = {};
        this.isLeftClicked = false;
        this.isRightClickDragging = false;
        this.mouseX = 0;
        this.mouseY = 0;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;
        this.scrollDelta = 0;
        this.activeTool = 'build'; 

        this._initListeners();
    }

    setTool(tool) {
        // Toggle logic: if same tool clicked, deselect
        this.activeTool = this.activeTool === tool ? null : tool;
    }

    _initListeners() {
        window.addEventListener('contextmenu', (e) => e.preventDefault());

        window.addEventListener('keydown', (e) => {
            const k = e.key.toLowerCase();
            this.keys[k] = true;
            if(k === 'b') this.setTool('build');
            if(k === 'v') this.setTool('delete');
            if(k === 'n') this.setTool('npc');
            if(k === '2') this.setTool('food');
            if(k === '1') this.setTool('water'); 
            if(k === '3') this.setTool('o2');
            if(k === 'g') this.setTool('floor');
            if(k === 'x') this.setTool('door');
            if(k === 'j') this.setTool('airlock');
            if(k === 'h') this.setTool('bed');
            if(k === 'm') this.setTool('asteroid'); // Mine
            if(k === 'l') this.setTool('solar');    // Light/Power
            if(k === 'k') this.setTool('storage');  // Keep/Storage
        });
        
        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.isLeftClicked = true;
            if (e.button === 2) {
                this.isRightClickDragging = true;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
            }
        });

        this.canvas.addEventListener('mouseup', (e) => {
            if (e.button === 2) this.isRightClickDragging = false;
        });

        this.canvas.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
            if (this.isRightClickDragging) {
                this.mouseDeltaX = e.clientX - this.lastMouseX;
                this.mouseDeltaY = e.clientY - this.lastMouseY;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
            }
        });
    }

    resetDeltas() {
        this.isLeftClicked = false;
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;
        this.scrollDelta = 0;
    }
}