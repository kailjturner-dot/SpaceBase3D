export class HUD {
    constructor(input, resourceManager) {
        this.input = input;
        this.resourceManager = resourceManager;
        this.npcManager = null; 
        
        this.selectedModel = null;
        this.selectedBrain = null;
        this.setTimeScale = null; // Callback injected by Game.js
        
        this.activeTab = null;
        this.currentCategory = 'foundations'; 
        
        this._createStyles();
        this._createTopRightPanel();
        this._createTopLeftPanel();
        this._createNPCMenu();
    }
    
    _createStyles() {
        if (document.getElementById('hud-styles')) return;
        const style = document.createElement('style');
        style.id = 'hud-styles';
        style.innerHTML = `
            body { margin: 0; overflow: hidden; user-select: none; }
            .hud-btn { padding: 12px 18px; border-radius: 6px; color: white; font-family: 'Segoe UI', sans-serif; font-size: 16px; font-weight: bold; cursor: pointer; border: 2px solid rgba(255,255,255,0.1); transition: all 0.2s; text-transform: uppercase; text-align: center; }
            .active-tool, .active-tab { border-color: #00ffff !important; box-shadow: 0 0 12px #00ffff; background: rgba(0,255,255,0.2) !important; }
            #top-right-panel { position: fixed; top: 20px; right: 20px; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; z-index: 1000; }
            .stat-cluster { background: rgba(0,0,0,0.85); padding: 18px; border-radius: 12px; border-right: 4px solid #fbbf24; min-width: 225px; font-family: monospace; text-align: right; }
            
            .time-controls { background: rgba(0,0,0,0.85); padding: 8px; border-radius: 8px; display: flex; gap: 5px; }
            .time-btn { width: 30px; height: 30px; background: #333; color: #fff; border: 1px solid #555; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; }
            .time-btn.active { background: #0ea5e9; border-color: #0ea5e9; color: #000; }

            #top-left-panel { position: fixed; top: 20px; left: 20px; display: flex; flex-direction: row; gap: 15px; z-index: 1000; }
            .nav-column { display: flex; flex-direction: column; gap: 12px; }
            .submenu-column { display: none; flex-direction: column; gap: 12px; background: rgba(0,0,0,0.85); padding: 15px; border-radius: 12px; border: 1.5px solid #444; min-width: 180px; }
            
            .npc-menu { position: fixed; right: 20px; top: 220px; width: 300px; background: rgba(10,15,20,0.95); color: white; padding: 20px; border-radius: 10px; border: 1px solid #444; display: none; font-family: 'Segoe UI', sans-serif; z-index: 1001; backdrop-filter: blur(5px); }
            .stat-row { display: flex; align-items: center; margin-bottom: 6px; font-size: 13px; }
            .stat-label { width: 70px; color: #aaa; }
            .stat-bar-bg { flex: 1; height: 6px; background: #333; border-radius: 3px; overflow: hidden; }
            .stat-bar-fill { height: 100%; border-radius: 3px; transition: width 0.5s; }
            .emotion-tag { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; display: inline-block; margin-top: 5px; }
            .trait-desc { font-size: 11px; color: #888; font-style: italic; margin-top: 4px; }
        `;
        document.head.appendChild(style);
    }

    _createTopRightPanel() {
        const container = document.createElement('div');
        container.id = 'top-right-panel';
        
        // Time Controls
        const timeBox = document.createElement('div');
        timeBox.className = 'time-controls';
        
        const scales = [
            { label: 'II', val: 0.0 },
            { label: '1x', val: 1.0 },
            { label: '2x', val: 2.0 },
            { label: '3x', val: 3.0 }
        ];

        this.timeBtns = [];
        scales.forEach(s => {
            const btn = document.createElement('div');
            btn.className = 'time-btn';
            btn.innerText = s.label;
            if (s.val === 1.0) btn.classList.add('active');
            
            btn.onclick = () => {
                if (this.setTimeScale) {
                    this.setTimeScale(s.val);
                    this.timeBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                }
            };
            this.timeBtns.push(btn);
            timeBox.appendChild(btn);
        });

        // Stats - Initialize structure ONCE to avoid innerHTML thrashing
        this.statDiv = document.createElement('div');
        this.statDiv.className = 'stat-cluster';
        this.statDiv.innerHTML = `
            <div style="color:#fff; font-size:21px; margin-bottom:8px;">MATTER: <span id="hud-matter" style="color:#fbbf24">0</span></div>
            <div style="color:#a5f3fc; font-size:16px;">POPULATION: <span id="hud-pop">0</span></div>
            <div style="color:#67e8f9; font-size:16px;">O2 LEVEL: <span id="hud-o2">0%</span></div>
        `;

        // Cache references for update loop
        this.elMatter = this.statDiv.querySelector('#hud-matter');
        this.elPop = this.statDiv.querySelector('#hud-pop');
        this.elO2 = this.statDiv.querySelector('#hud-o2');
        
        container.appendChild(timeBox);
        container.appendChild(this.statDiv);
        document.body.appendChild(container);
    }

    _createTopLeftPanel() {
        const container = document.createElement('div');
        container.id = 'top-left-panel';
        const navCol = document.createElement('div');
        navCol.className = 'nav-column';
        
        const mainButtons = [
            { id: 'roster', label: 'ROSTER', color: '#1e293b' },
            { id: 'construct', label: 'CONSTRUCT', color: '#0e7490' },
            { id: 'npc', label: 'SPAWN NPC', color: '#15803d' }
        ];

        mainButtons.forEach(data => {
            const btn = document.createElement('div');
            btn.className = 'hud-btn';
            btn.id = `nav-${data.id}`;
            btn.innerText = data.label;
            btn.style.backgroundColor = data.color;
            btn.onclick = () => {
                this.activeTab = data.id;
                if (data.id === 'construct') {
                    const sub = document.getElementById('const-submenu');
                    sub.style.display = sub.style.display === 'flex' ? 'none' : 'flex';
                } else if (data.id === 'npc') {
                    this.input.setTool('npc');
                } else {
                    document.getElementById('const-submenu').style.display = 'none';
                }
                this._updateTabVisuals();
            };
            navCol.appendChild(btn);
        });

        this.submenu = document.createElement('div');
        this.submenu.id = 'const-submenu';
        this.submenu.className = 'submenu-column';
        
        const catContainer = document.createElement('div');
        catContainer.style.display = 'flex';
        catContainer.style.gap = '8px';
        catContainer.style.marginBottom = '10px';

        ['Foundations', 'Objects'].forEach(cat => {
            const id = cat.toLowerCase();
            const btn = document.createElement('div');
            btn.className = 'hud-btn';
            btn.id = `cat-${id}`;
            btn.style.fontSize = '12px';
            btn.style.flex = '1';
            btn.style.padding = '8px';
            btn.innerText = cat;
            btn.onclick = () => {
                this.currentCategory = id;
                this._renderCategory(id);
                this._updateTabVisuals();
            };
            catContainer.appendChild(btn);
        });

        this.toolGrid = document.createElement('div');
        this.toolGrid.style.display = 'flex';
        this.toolGrid.style.flexDirection = 'column';
        this.toolGrid.style.gap = '8px';

        this.submenu.appendChild(catContainer);
        this.submenu.appendChild(this.toolGrid);

        container.appendChild(navCol);
        container.appendChild(this.submenu);
        document.body.appendChild(container);

        this.tools = [
            { id: 'build', label: 'Wall', color: '#475569', cat: 'foundations' },
            { id: 'floor', label: 'Floor', color: '#475569', cat: 'foundations' },
            { id: 'delete', label: 'Deconstruct', color: '#7f1d1d', cat: 'foundations' },
            { id: 'door', label: 'Door', color: '#0891b2', cat: 'objects' },
            { id: 'airlock', label: 'Airlock', color: '#c2410c', cat: 'objects' },
            { id: 'water', label: 'Water', color: '#1d4ed8', cat: 'objects' },
            { id: 'food', label: 'Food', color: '#a16207', cat: 'objects' },
            { id: 'o2', label: 'O2 Gen', color: '#00ffff', cat: 'objects' },
            { id: 'solar', label: 'Solar', color: '#eab308', cat: 'objects' },
            { id: 'storage', label: 'Storage', color: '#525252', cat: 'objects' },
            { id: 'bed', label: 'Bed', color: '#3b82f6', cat: 'objects' },
            { id: 'lounge', label: 'Lounge', color: '#d946ef', cat: 'objects' },
            { id: 'asteroid', label: 'Asteroid', color: '#555', cat: 'objects' }
        ];
        
        this._renderCategory('foundations');
    }

    _renderCategory(cat) {
        this.toolGrid.innerHTML = '';
        this.tools.filter(t => t.cat === cat).forEach(tool => {
            const btn = document.createElement('div');
            btn.className = 'hud-btn';
            btn.id = `btn-${tool.id}`;
            btn.innerText = tool.label;
            btn.style.backgroundColor = tool.color;
            btn.onclick = () => this.input.setTool(tool.id);
            this.toolGrid.appendChild(btn);
        });
    }

    _createNPCMenu() {
        this.menu = document.createElement('div');
        this.menu.className = 'npc-menu';
        this.menu.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 id="npc-name" style="margin:0; color:#fff;">UNIT 01</h3>
                <span id="npc-role" style="font-size:12px; color:#aaa; border:1px solid #444; padding:2px 6px; border-radius:4px;">ENGINEER</span>
            </div>
            <div id="npc-trait" style="font-size:12px; color:#fbbf24; margin-top:4px;">Workaholic</div>
            <div id="npc-trait-desc" class="trait-desc">Working restores happiness.</div>
            
            <hr style="border-color:#333; margin: 10px 0;">
            
            <div style="text-align:center; margin-bottom:10px;">
                <span id="npc-emotion" class="emotion-tag" style="background:#22c55e; color:#000;">HAPPY</span>
                <div style="font-size:11px; margin-top:2px; color:#888;">Current Activity: <span id="npc-action" style="color:#fff">Idle</span></div>
            </div>

            <div class="stat-row"><div class="stat-label">HEALTH</div><div class="stat-bar-bg"><div id="bar-health" class="stat-bar-fill" style="width:100%; background:#ef4444;"></div></div></div>
            <div class="stat-row"><div class="stat-label">ENERGY</div><div class="stat-bar-bg"><div id="bar-energy" class="stat-bar-fill" style="width:80%; background:#eab308;"></div></div></div>
            <div class="stat-row"><div class="stat-label">SUIT O2</div><div class="stat-bar-bg"><div id="bar-suito2" class="stat-bar-fill" style="width:100%; background:#0ea5e9;"></div></div></div>
            <div class="stat-row"><div class="stat-label">HUNGER</div><div class="stat-bar-bg"><div id="bar-hunger" class="stat-bar-fill" style="width:60%; background:#f97316;"></div></div></div>
            <div class="stat-row"><div class="stat-label">SOCIAL</div><div class="stat-bar-bg"><div id="bar-social" class="stat-bar-fill" style="width:40%; background:#3b82f6;"></div></div></div>
            <div class="stat-row"><div class="stat-label">FUN</div><div class="stat-bar-bg"><div id="bar-fun" class="stat-bar-fill" style="width:90%; background:#d946ef;"></div></div></div>
            <div class="stat-row"><div class="stat-label">STRESS</div><div class="stat-bar-bg"><div id="bar-stress" class="stat-bar-fill" style="width:10%; background:#fff;"></div></div></div>
            
            <div style="margin-top:10px; text-align:right;">
                <button id="btn-close-npc" style="background:transparent; border:1px solid #666; color:#aaa; cursor:pointer;">CLOSE</button>
            </div>
        `;
        document.body.appendChild(this.menu);
        this.menu.querySelector('#btn-close-npc').onclick = () => {
            this.menu.style.display = 'none';
            this.selectedModel = null;
        };
    }

    showNPC(model, brain) {
        this.selectedModel = model;
        this.selectedBrain = brain;
        this.menu.style.display = 'block';
        this._updateMenu();
    }

    _updateMenu() {
        if (!this.selectedModel) return;
        const m = this.selectedModel;
        const b = this.selectedBrain;

        this.menu.querySelector('#npc-name').innerText = m.name;
        this.menu.querySelector('#npc-role').innerText = m.role.toUpperCase();
        this.menu.querySelector('#npc-trait').innerText = m.trait.name.toUpperCase();
        this.menu.querySelector('#npc-trait-desc').innerText = m.trait.desc;
        this.menu.querySelector('#npc-action').innerText = (b.state + (b.subState ? ` (${b.subState})` : '')).toUpperCase();

        const emoTag = this.menu.querySelector('#npc-emotion');
        emoTag.innerText = m.emotion.toUpperCase();
        
        let emoColor = '#888';
        if (m.emotion === 'Happy' || m.emotion === 'Inspired') emoColor = '#22c55e';
        else if (m.emotion === 'Angry' || m.emotion === 'Stressed') emoColor = '#ef4444';
        else if (m.emotion === 'Depressed') emoColor = '#3b82f6';
        else if (m.emotion === 'Deceased') emoColor = '#000000';
        emoTag.style.background = emoColor;

        const setBar = (id, val, color) => {
            const el = this.menu.querySelector(id);
            if(el) {
                el.style.width = `${val}%`;
                if (id === '#bar-stress') {
                    el.style.backgroundColor = val > 80 ? '#ef4444' : (val > 50 ? '#eab308' : '#fff');
                }
            }
        };

        setBar('#bar-health', m.health);
        setBar('#bar-energy', m.energy);
        setBar('#bar-suito2', (m.suitOxygen / m.maxSuitOxygen) * 100);
        setBar('#bar-hunger', m.hunger);
        setBar('#bar-social', m.social);
        setBar('#bar-fun', m.fun);
        setBar('#bar-stress', m.stress);
    }

    _updateTabVisuals() {
        const navIds = ['nav-roster', 'nav-construct', 'nav-npc'];
        navIds.forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                if(id === `nav-${this.activeTab}`) el.classList.add('active-tab');
                else el.classList.remove('active-tab');
            }
        });
        
        const catIds = ['cat-foundations', 'cat-objects'];
        catIds.forEach(id => {
             const el = document.getElementById(id);
             if(el) {
                 if(id === `cat-${this.currentCategory}` && this.activeTab === 'construct') el.classList.add('active-tab');
                 else el.classList.remove('active-tab');
             }
        });
    }

    update(oxygenSystem) {
        // Optimisation: Update cached elements instead of rebuilding innerHTML
        if (this.elMatter) this.elMatter.innerText = Math.floor(this.resourceManager.matter);
        if (this.elPop) this.elPop.innerText = this.npcManager ? this.npcManager.npcs.length : 0;
        if (this.elO2) this.elO2.innerText = Math.floor(oxygenSystem.getO2At(0,0)) + '%';

        const btns = document.querySelectorAll('.hud-btn');
        btns.forEach(btn => {
            if (btn.id.startsWith('btn-')) {
                const toolId = btn.id.replace('btn-', '');
                if (toolId === this.input.activeTool) btn.classList.add('active-tool');
                else btn.classList.remove('active-tool');
            }
        });

        if (this.selectedModel) {
            this._updateMenu();
        }
    }
}