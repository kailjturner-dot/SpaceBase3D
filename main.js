import { Game } from './src/core/Game.js';

// Wait for DOM to load, then start the game
window.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    game.start();
});