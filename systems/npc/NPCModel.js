export const TRAITS = {
    WORKAHOLIC: { name: 'Workaholic', desc: 'Working restores Happiness, Social decays faster.' },
    SOCIALITE: { name: 'Socialite', desc: 'Needs frequent interaction. Social decays fast.' },
    LONER: { name: 'Loner', desc: 'Prefers solitude. Stressed by crowds.' },
    GLUTTON: { name: 'Glutton', desc: 'Gets hungry faster, eats faster.' },
    NERVOUS: { name: 'Nervous', desc: 'Stress rises easily. Needs high O2/Safety.' }
};

export const EMOTIONS = {
    HAPPY: 'Happy',
    NEUTRAL: 'Neutral',
    STRESSED: 'Stressed',
    ANGRY: 'Angry',
    DEPRESSED: 'Depressed',
    INSPIRED: 'Inspired',
    DEAD: 'Deceased'
};

const FIRST_NAMES = ["Jax", "Kira", "Zane", "Nova", "Rico", "Sela", "Vance", "Yuna", "Kael", "Mira"];
const LAST_NAMES = ["Voss", "Thorne", "Stark", "Luna", "Chen", "Kovacs", "Holloway", "Wei", "Mercer"];

export class NPCModel {
    constructor(id, role = 'engineer') {
        this.id = id || Math.random().toString(36).substr(2, 9);
        this.name = `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]}`;
        this.role = role;
        
        // Assign a random trait
        const traitKeys = Object.keys(TRAITS);
        this.trait = TRAITS[traitKeys[Math.floor(Math.random() * traitKeys.length)]];

        // --- Core Physiology (0-100) ---
        this.hunger = 100;
        this.thirst = 100;
        this.energy = 100;     
        this.health = 100;

        // --- Life Support ---
        this.suitOxygen = 300; // 5 Minutes (300 seconds)
        this.maxSuitOxygen = 300;
        this.isDead = false;
        this.wearingSuit = false;

        // --- Psychology (0-100) ---
        this.social = 80;      
        this.fun = 70;         
        this.stress = 0;       
        
        // --- Derived State ---
        this.happiness = 100;  
        this.emotion = EMOTIONS.NEUTRAL;
        
        // --- Modifiers ---
        this.moveSpeedMultiplier = 1.0;
        this.workSpeedMultiplier = 1.0;

        // --- Grace Period ---
        this.gracePeriod = 15.0; 
    }

    updateStats(dt, context) {
        if (this.isDead) return;

        // Reduce grace period timer
        if (this.gracePeriod > 0) {
            this.gracePeriod -= dt;
        }

        // --- Life Support Logic ---
        // If O2 is low (Outside or unsealed room), use Suit Oxygen
        if (context.o2Level < 20) {
            this.wearingSuit = true;
            this.suitOxygen -= dt;
            
            // Suffocation logic
            if (this.suitOxygen <= 0) {
                this.suitOxygen = 0;
                this.health -= dt * 10; // Rapid death without air
                if (this.health <= 0) {
                    this.health = 0;
                    this.isDead = true;
                    this.emotion = EMOTIONS.DEAD;
                    return; // Stop processing other stats
                }
            }
        } else {
            // Inside safe atmosphere
            this.wearingSuit = false; // "Take off suit"
            // Recharge suit O2 when inside
            this.suitOxygen = Math.min(this.maxSuitOxygen, this.suitOxygen + dt * 10);
            
            // Heal slowly if not hungry/thirsty
            if (this.hunger > 50 && this.thirst > 50) {
                this.health = Math.min(100, this.health + dt);
            }
        }

        // 1. Decay Rates (Significantly Reduced per request)
        let hungerRate = 0.15; // Was 0.8
        let thirstRate = 0.25; // Was 1.2
        let energyRate = 0.10; // Was 0.5
        let socialRate = 0.20; // Was 1.0
        let funRate = 0.10;    // Was 0.5

        // 2. Trait Modifiers
        if (this.trait === TRAITS.GLUTTON) hungerRate *= 1.5;
        if (this.trait === TRAITS.WORKAHOLIC) socialRate *= 1.5;
        if (this.trait === TRAITS.SOCIALITE) socialRate *= 2.0;
        if (this.trait === TRAITS.LONER) socialRate *= 0.2;

        // 3. Apply Decay
        if (!context.isSleeping) this.energy -= dt * energyRate;
        this.hunger -= dt * hungerRate;
        this.thirst -= dt * thirstRate;
        
        if (!context.isSocializing) this.social -= dt * socialRate;
        if (!context.isRelaxing) this.fun -= dt * funRate;

        // 4. Stress Calculation
        let stressFactors = 0;
        
        // Check needs
        if (this.hunger < 20) stressFactors += 2;
        if (this.thirst < 20) stressFactors += 2;
        if (this.energy < 20) stressFactors += 2;
        
        // Social logic
        if (this.social < 20 && this.trait !== TRAITS.LONER) stressFactors += 1;
        if (this.social > 80 && this.trait === TRAITS.LONER) stressFactors += 1; 
        if (context.isCrowded && this.trait === TRAITS.LONER) stressFactors += 5;
        
        // Environment Impact (Oxygen check handled by suit, but low suit O2 causes stress)
        if (this.suitOxygen < 60) stressFactors += 10; // Panic when running low on air
        
        if (stressFactors > 0 && this.gracePeriod <= 0) {
            let resilience = (this.trait === TRAITS.NERVOUS) ? 2.0 : 1.0;
            this.stress += dt * stressFactors * resilience;
        } else if (stressFactors === 0 || this.gracePeriod > 0) {
            this.stress -= dt * 2; 
        }

        this._clampStats();
        this._calculateEmotion(context);
    }

    _clampStats() {
        this.hunger = Math.max(0, Math.min(100, this.hunger));
        this.thirst = Math.max(0, Math.min(100, this.thirst));
        this.energy = Math.max(0, Math.min(100, this.energy));
        this.social = Math.max(0, Math.min(100, this.social));
        this.fun = Math.max(0, Math.min(100, this.fun));
        this.stress = Math.max(0, Math.min(100, this.stress));
        this.health = Math.max(0, Math.min(100, this.health));
    }

    _calculateEmotion(context) {
        if (this.isDead) return;

        const physical = (this.hunger + this.thirst + this.energy) / 3;
        const mental = (this.social + this.fun + (100 - this.stress)) / 3;
        this.happiness = (physical * 0.4) + (mental * 0.6);

        // Determine Emotional Label
        if (this.stress > 80) this.emotion = EMOTIONS.ANGRY; 
        else if (this.happiness < 30) this.emotion = EMOTIONS.DEPRESSED;
        else if (this.stress > 50) this.emotion = EMOTIONS.STRESSED;
        else if (this.happiness > 85) this.emotion = EMOTIONS.INSPIRED;
        else this.emotion = EMOTIONS.NEUTRAL;

        // Reset multipliers
        this.workSpeedMultiplier = 1.0;
        this.moveSpeedMultiplier = 1.0;

        if (this.emotion === EMOTIONS.ANGRY) {
            this.workSpeedMultiplier = 0; 
        } else if (this.emotion === EMOTIONS.DEPRESSED) {
            this.moveSpeedMultiplier = 0.5;
            this.workSpeedMultiplier = 0.5;
        } else if (this.emotion === EMOTIONS.INSPIRED) {
            this.workSpeedMultiplier = 1.5;
            this.moveSpeedMultiplier = 1.2;
        }
        
        if (this.trait === TRAITS.WORKAHOLIC && context.isWorking) {
            this.happiness += 0.5; 
        }
    }
}