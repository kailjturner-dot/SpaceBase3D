export class ResourceManager {
    constructor() {
        this.matter = 5000; // Starting matter to build basic structures
        this.energy = 100;
        this.oxygen = 100; // Global tank (distinct from room atmosphere)
        this.credits = 0;

        this.maxEnergy = 500;
        this.maxOxygen = 500;

        // Rates
        this.energyGenRate = 0;
        this.energyDrainRate = 0;
    }

    update(dt) {
        // Cap values
        if (this.energy > this.maxEnergy) this.energy = this.maxEnergy;
        if (this.energy < 0) this.energy = 0;
        
        // Passive generation handled by GridSystem/OxygenSystem calling modify methods
        // or we calculate net change here if we tracked sources. 
        // For now, we allow systems to push changes.
    }

    hasMatter(cost) {
        return this.matter >= cost;
    }

    deductMatter(cost) {
        if (this.matter >= cost) {
            this.matter -= cost;
            return true;
        }
        return false;
    }

    addMatter(amount) {
        this.matter += amount;
    }

    consumeEnergy(amount) {
        if (this.energy >= amount) {
            this.energy -= amount;
            return true;
        }
        return false;
    }

    generateEnergy(amount) {
        this.energy += amount;
        if (this.energy > this.maxEnergy) this.energy = this.maxEnergy;
    }
}