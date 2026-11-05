    // --- SAVE DATA ---
    const SaveData = {
        souls: 0, lvlHp: 0, lvlDmg: 0, lvlSpeed: 0,
        load() { const d = localStorage.getItem('splatter_save'); if (d) Object.assign(this, JSON.parse(d)); this.updateUI(); },
        save() { localStorage.setItem('splatter_save', JSON.stringify({ souls: this.souls, lvlHp: this.lvlHp, lvlDmg: this.lvlDmg, lvlSpeed: this.lvlSpeed })); this.updateUI(); },
        updateUI() {
            document.getElementById('menuSouls').innerText = this.souls;
            document.getElementById('shopSouls').innerText = this.souls;
            document.getElementById('lvlHp').innerText = this.lvlHp;
            document.getElementById('lvlDmg').innerText = this.lvlDmg;
            document.getElementById('lvlSpeed').innerText = this.lvlSpeed;
            document.getElementById('buyHpBtn').innerText = `${(this.lvlHp + 1) * 10} 🩸`;
            document.getElementById('buyDmgBtn').innerText = `${(this.lvlDmg + 1) * 15} 🩸`;
            document.getElementById('buySpeedBtn').innerText = `${(this.lvlSpeed + 1) * 12} 🩸`;
        }
    };
    SaveData.load();

    const config = {
        audio: true, shake: true, gore: true,
        load() {
            const s = localStorage.getItem('splatter_cfg');
            if (s) Object.assign(this, JSON.parse(s));
            document.getElementById('cfgAudio').checked = this.audio;
            document.getElementById('cfgShake').checked = this.shake;
            document.getElementById('cfgGore').checked = this.gore;
        },
        save() {
            this.audio = document.getElementById('cfgAudio').checked;
            this.shake = document.getElementById('cfgShake').checked;
            this.gore = document.getElementById('cfgGore').checked;
            localStorage.setItem('splatter_cfg', JSON.stringify({ audio: this.audio, shake: this.shake, gore: this.gore }));
        }
    };
    config.load();

    // --- SYNTHETIC AUDIO ENGINE ---
    class SoundEngine {
        constructor() { this.ctx = null; }
        init() {
            if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ctx = new AC(); }
            if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        }
        playTone(f, t, d, v=0.1, s=null) {
            if (!config.audio || !this.ctx) return;
            try {
                const o = this.ctx.createOscillator(), g = this.ctx.createGain();
                o.type = t; o.frequency.setValueAtTime(f, this.ctx.currentTime);
                if (s) o.frequency.exponentialRampToValueAtTime(s, this.ctx.currentTime + d);
                g.gain.setValueAtTime(v, this.ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + d);
                o.connect(g); g.connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + d);
            } catch(e) {}
        }
        playNoise(d, v=0.2) {
            if (!config.audio || !this.ctx) return;
            try {
                const bS = this.ctx.sampleRate * d, b = this.ctx.createBuffer(1, bS, this.ctx.sampleRate), dt = b.getChannelData(0);
                for (let i = 0; i < bS; i++) dt[i] = Math.random() * 2 - 1;
                const n = this.ctx.createBufferSource(); n.buffer = b;
                const g = this.ctx.createGain(); g.gain.setValueAtTime(v, this.ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + d);
                n.connect(g); g.connect(this.ctx.destination); n.start();
            } catch(e) {}
        }
        playJump() { this.playTone(120, 'sawtooth', 0.12, 0.1, 280); }
        playSlash() { this.playNoise(0.08, 0.3); this.playTone(400, 'sawtooth', 0.1, 0.1, 100); }
        playShotgun() { this.playNoise(0.25, 0.5); this.playTone(80, 'sawtooth', 0.25, 0.3, 30); }
        playHit() { this.playNoise(0.1, 0.35); }
        playDeath() { this.playTone(90, 'sawtooth', 0.4, 0.2, 25); this.playNoise(0.3, 0.25); }
        playRoar() { this.playTone(60, 'sawtooth', 0.9, 0.5, 20); this.playNoise(0.8, 0.4); }
    }
    const sound = new SoundEngine();

    // --- PROCEDURAL MUSIC ENGINE ---
    class MusicEngine {
        constructor() {
            this.ctx = null; this.isPlaying = false; this.tempo = 90;
            this.nextNoteTime = 0; this.currentStep = 0;
            this.lookahead = 25.0; this.scheduleAheadTime = 0.1; this.timerID = null;
        }
        init() {
            if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ctx = new AC(); }
            if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        }
        start() {
            if (this.isPlaying || !config.audio) return;
            this.init(); this.isPlaying = true; this.currentStep = 0;
            this.nextNoteTime = this.ctx.currentTime; this.scheduler();
        }
        stop() { this.isPlaying = false; if (this.timerID) clearTimeout(this.timerID); }
        scheduler() {
            if (!this.isPlaying) return;
            while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
                this.playStep(this.currentStep, this.nextNoteTime);
                this.advanceStep();
            }
            this.timerID = setTimeout(() => this.scheduler(), this.lookahead);
        }
        advanceStep() {
            const secondsPerBeat = 60.0 / this.tempo;
            this.nextNoteTime += 0.25 * secondsPerBeat;
            this.currentStep = (this.currentStep + 1) % 16;
        }
        playStep(step, time) {
            if (!this.ctx) return;
            if (step === 0 || step === 3 || step === 6 || step === 10 || step === 12) this.playKick(time);
            if (step === 4 || step === 12) this.playSnare(time);
            if (step % 2 === 0) this.playHat(time);
            if (step === 0 || step === 6 || step === 8 || step === 14) this.playBass(time, step);
        }
        playKick(time) {
            const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
            osc.connect(gain); gain.connect(this.ctx.destination);
            osc.frequency.setValueAtTime(150, time); osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
            gain.gain.setValueAtTime(0.8, time); gain.gain.exponentialRampToValueAtTime(0.01, time + 0.4);
            osc.start(time); osc.stop(time + 0.4);
        }
        playSnare(time) {
            const bS = this.ctx.sampleRate * 0.2, b = this.ctx.createBuffer(1, bS, this.ctx.sampleRate), dt = b.getChannelData(0);
            for (let i = 0; i < bS; i++) dt[i] = Math.random() * 2 - 1;
            const noise = this.ctx.createBufferSource(); noise.buffer = b;
            const filter = this.ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 1800;
            const gain = this.ctx.createGain(); noise.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
            gain.gain.setValueAtTime(0.4, time); gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
            noise.start(time);
        }
        playHat(time) {
            const bS = this.ctx.sampleRate * 0.05, b = this.ctx.createBuffer(1, bS, this.ctx.sampleRate), dt = b.getChannelData(0);
            for (let i = 0; i < bS; i++) dt[i] = Math.random() * 2 - 1;
            const noise = this.ctx.createBufferSource(); noise.buffer = b;
            const filter = this.ctx.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = 8000;
            const gain = this.ctx.createGain(); noise.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
            gain.gain.setValueAtTime(0.15, time); gain.gain.exponentialRampToValueAtTime(0.01, time + 0.03);
            noise.start(time);
        }
        playBass(time, step) {
            const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
            osc.connect(gain); gain.connect(this.ctx.destination); osc.type = 'sawtooth';
            let freq = 73.42; if (step === 6) freq = 65.41; if (step === 8) freq = 58.27;
            osc.frequency.setValueAtTime(freq, time);
            gain.gain.setValueAtTime(0.2, time); gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
            osc.start(time); osc.stop(time + 0.2);
        }
    }
    const music = new MusicEngine();

    // --- SETUP ---
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    let width, height, GROUND_Y;
    function resize() {
        width = window.innerWidth; height = window.innerHeight;
        canvas.width = width; canvas.height = height;
        GROUND_Y = height - 85;
    }
    window.addEventListener('resize', resize);
    resize();

    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isMobile) document.getElementById('touchControls').classList.remove('hidden');

    // --- GAME STATE ---
    let gameActive = false, hitStop = 0, screenFlash = 0;
    let score = 0, runSouls = 0, cameraX = 0, globalTime = 0, screenShake = 0;
    let combo = 0, comboTimer = 0;

    let zombies = [], projectiles = [], particles = [], floatingTexts = [], platforms = [], decals = [];
    let boss = null;
    let bossSpawned = false;
    const GRAVITY = 0.65;

    const player = {
        x: 100, y: 0, vx: 0, vy: 0, width: 34, height: 54,
        speed: 6.5, jumpPower: -14, isGrounded: true, facing: 1,
        hp: 100, maxHp: 100, hitFlash: 0, attackCooldown: 0, attackAnim: 0,
        weapon: 1, enraged: false
    };

    const keys = { a: false, d: false, jumpPressed: false };
    let joystickActive = false;
    let joystickOrigin = { x: 0, y: 0 };
    let joystickCurrent = { x: 0, y: 0 };

    // --- INIT ---
    function resetGame() {
        sound.init();
        music.start();
        gameActive = true; score = 0; runSouls = 0; cameraX = 0; globalTime = 0; screenShake = 0; combo = 0; hitStop = 0; screenFlash = 0;
        bossSpawned = false;
        
        player.maxHp = 100 + SaveData.lvlHp * 20;
        player.hp = player.maxHp;
        player.speed = 6.5 + SaveData.lvlSpeed * 0.6;
        player.jumpPower = -14 - SaveData.lvlSpeed * 0.4;
        player.x = 100; player.y = GROUND_Y - player.height; player.vx = 0; player.vy = 0;
        player.weapon = 1; player.enraged = false; player.attackAnim = 0;

        zombies = []; projectiles = []; particles = []; floatingTexts = []; decals = []; boss = null;

        platforms = [
            { x: 450, y: GROUND_Y - 140, w: 200, h: 22 },
            { x: 850, y: GROUND_Y - 240, w: 180, h: 22 },
            { x: 1250, y: GROUND_Y - 130, w: 220, h: 22 }
        ];

        hideOverlays();
        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('weaponUI').classList.remove('hidden');
        updateWeaponUI();
    }

    function hideOverlays() {
        music.stop();
        document.getElementById('startScreen').classList.add('hidden');
        document.getElementById('shopScreen').classList.add('hidden');
        document.getElementById('settingsScreen').classList.add('hidden');
        document.getElementById('gameOverScreen').classList.add('hidden');
        document.getElementById('bossHud').classList.add('hidden');
    }

    function gameOver() {
        gameActive = false;
        music.stop();
        SaveData.souls += runSouls;
        SaveData.save();

        document.getElementById('finalScore').innerText = score;
        document.getElementById('runSouls').innerText = runSouls;
        document.getElementById('finalDist').innerText = Math.floor(player.x / 10);
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('weaponUI').classList.add('hidden');
        document.getElementById('bossHud').classList.add('hidden');
        document.getElementById('gameOverScreen').classList.remove('hidden');
    }

    function revivePlayer() {
        music.start();
        gameActive = true;
        player.hp = player.maxHp * 0.5;
        player.hitFlash = 60; 
        player.y -= 100; 
        zombies = [];
        if (boss) { boss.hp = boss.maxHp; boss.state = 'flying'; }
        document.getElementById('gameOverScreen').classList.add('hidden');
        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('weaponUI').classList.remove('hidden');
        if (boss) document.getElementById('bossHud').classList.remove('hidden');
        addFloatingText("REVIVED!", player.x, player.y - 30, '#00ff00', 30);
    }

    function updateWeaponUI() {
        document.querySelectorAll('.weapon-slot').forEach(el => el.classList.remove('active'));
        document.getElementById(`slot${player.weapon}`).classList.add('active');
    }

    function addFloatingText(txt, x, y, color = '#fff', size = 20) {
        floatingTexts.push({ txt, x, y, color, size, vy: -2, life: 1.0 });
    }

    // --- COMBAT & SPAWNING ---
    function spawnZombie() {
        if (boss) return;
        let spawnX = player.x + width + 80;
        let zType = Math.random();
        let type = zType < 0.35 ? 1 : (zType > 0.8 ? 2 : 0);

        let hp = type === 2 ? 5 : 1;
        let w = type === 2 ? 46 : (type === 1 ? 38 : 30);
        let h = type === 2 ? 65 : (type === 1 ? 26 : 50);
        let speed = type === 1 ? 3.8 : (type === 2 ? 1.1 : 1.9);

        zombies.push({ type, x: spawnX, y: GROUND_Y - h, vx: -speed, vy: 0, width: w, height: h, speed, hp, maxHp: hp, anim: Math.random() * 10 });

        if (!boss && !bossSpawned && Math.floor(player.x / 10) >= 100) {
            sound.playRoar();
            boss = { x: player.x + width + 150, y: GROUND_Y - 240, vx: -1.5, vy: 0, width: 145, height: 115, hp: 70, maxHp: 70, state: 'flying', timer: 0, hitFlash: 0, anim: 0 };
            bossSpawned = true;
            document.getElementById('bossHud').classList.remove('hidden');
            addFloatingText("BEHEMOTH AWAKENS!", player.x + width / 3, height / 3, '#ff0033', 32);
            if (config.shake) screenShake = 30;
        }
    }

    function attack() {
        if (player.attackCooldown > 0 || !gameActive) return;

        let dmgBonus = SaveData.lvlDmg * 0.5;
        player.attackAnim = 12;

        if (player.weapon === 1) { // Spiked Knuckles Slash
            player.attackCooldown = 10; sound.playSlash();
            projectiles.push({ x: player.x + (player.facing === 1 ? player.width : -15), y: player.y + 15, vx: player.facing * 18, vy: 0, type: 'slash', dmg: 1.5 + dmgBonus, width: 25, height: 25, life: 12 });
        } else if (player.weapon === 2) { // Meat Cleaver Chopper
            player.attackCooldown = 22; sound.playSlash();
            projectiles.push({ x: player.x + (player.facing === 1 ? player.width : -25), y: player.y + 5, vx: player.facing * 13, vy: -5, type: 'cleaver', dmg: 3.5 + dmgBonus, width: 32, height: 32, life: 60, rot: 0 });
            if (config.shake) screenShake = 5;
        } else if (player.weapon === 3) { // Shotgun Blast
            player.attackCooldown = 28; sound.playShotgun();
            if (config.shake) screenShake = 12;
            screenFlash = 5;
            for (let i = -2; i <= 2; i++) {
                projectiles.push({ x: player.x + (player.facing === 1 ? player.width : -10), y: player.y + 20, vx: player.facing * 20, vy: i * 2.2, type: 'pellet', dmg: 1.2 + dmgBonus, width: 8, height: 8, life: 30 });
            }
        }
    }

    // --- UPDATE LOOP ---
    function update() {
        if (!gameActive) return;
        if (hitStop > 0) { hitStop--; return; }

        globalTime++;
        if (config.shake && screenShake > 0) screenShake *= 0.88;
        if (player.attackAnim > 0) player.attackAnim--;
        if (screenFlash > 0) screenFlash--;

        // Low HP Enrage Mode
        if (!player.enraged && player.hp < player.maxHp * 0.4) {
            player.enraged = true; sound.playRoar();
            if (config.shake) screenShake = 20;
            addFloatingText("BLOOD RAGE ENRAGE!", player.x, player.y - 20, '#ff0000', 24);
        }

        let speedMult = player.enraged ? 1.2 : 1.0;
        let moveX = 0;

        if (joystickActive) {
            let dx = joystickCurrent.x - joystickOrigin.x;
            if (Math.abs(dx) > 10) moveX = dx > 0 ? 1 : -1;
        } else {
            if (keys.a) moveX -= 1;
            if (keys.d) moveX += 1;
        }

        if (moveX !== 0) { player.vx = moveX * player.speed * speedMult; player.facing = moveX; } 
        else { player.vx *= 0.7; }

        if (keys.jumpPressed && player.isGrounded) {
            player.vy = player.jumpPower; player.isGrounded = false; sound.playJump();
        }
        keys.jumpPressed = false;

        player.vy += GRAVITY; player.x += player.vx; player.y += player.vy;

        if (player.attackCooldown > 0) player.attackCooldown--;
        if (player.hitFlash > 0) player.hitFlash--;

        if (comboTimer > 0) { comboTimer--; if (comboTimer <= 0) combo = 0; }

        let targetCamX = player.x - width * 0.32;
        if (targetCamX < 0) targetCamX = 0;
        cameraX += (targetCamX - cameraX) * 0.12;

        // Ground Collision
        player.isGrounded = false;
        if (player.y + player.height >= GROUND_Y) { player.y = GROUND_Y - player.height; player.vy = 0; player.isGrounded = true; }
        
        platforms.forEach(p => {
            if (player.vy >= 0 && player.x + player.width - 6 > p.x && player.x + 6 < p.x + p.w &&
                player.y + player.height >= p.y && player.y + player.height <= p.y + p.h + player.vy) {
                player.y = p.y - player.height; player.vy = 0; player.isGrounded = true;
            }
        });

        // World Gen
        let lastP = platforms[platforms.length - 1];
        if (lastP.x < player.x + width + 300) {
            let nx = lastP.x + 240 + Math.random() * 200;
            platforms.push({ x: nx, y: GROUND_Y - (110 + Math.random() * 150), w: 160 + Math.random() * 100, h: 22 });
            if (platforms.length > 8) platforms.shift();
        }

        // Projectiles Update
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const pr = projectiles[i];
            pr.x += pr.vx; pr.y += pr.vy; pr.life--;
            if (pr.type === 'cleaver') { pr.vy += GRAVITY * 0.5; pr.rot += 0.3; }

            if (pr.life <= 0 || pr.x < cameraX - 100 || pr.x > cameraX + width + 100) { projectiles.splice(i, 1); continue; }

            let hit = false;

            // Hit Boss
            if (boss && pr.x + pr.width > boss.x && pr.x < boss.x + boss.width && pr.y + pr.height > boss.y && pr.y < boss.y + boss.height) {
                boss.hp -= pr.dmg; boss.hitFlash = 6; hit = true; sound.playHit(); hitStop = 3;
                if (config.shake) screenShake = 10;
                addFloatingText(`-${Math.floor(pr.dmg)}`, pr.x, pr.y, '#ff0033', 18);
                
                if (boss.hp <= 0) {
                    score += 50; runSouls += 50; sound.playDeath();
                    addFloatingText("BEHEMOTH SLAUGHTERED! +50 🩸", boss.x, boss.y, '#ff0033', 32);
                    if (config.gore) {
                        for(let k=0; k<60; k++) particles.push({ x: boss.x+70, y: boss.y+55, vx: (Math.random()-0.5)*24, vy: (Math.random()-0.5)*24, life: 1.5, color: '#880000', size: 6 });
                    }
                    boss = null; document.getElementById('bossHud').classList.add('hidden');
                }
                projectiles.splice(i, 1); continue;
            }

            // Hit Zombies
            for (let j = zombies.length - 1; j >= 0; j--) {
                const z = zombies[j];
                if (pr.x + pr.width > z.x && pr.x < z.x + z.width && pr.y + pr.height > z.y && pr.y < z.y + z.height) {
                    z.hp -= pr.dmg; sound.playHit(); hitStop = 2;
                    if (config.shake) screenShake = 6;

                    if (config.gore) {
                        for(let k=0; k<12; k++) particles.push({ x: z.x+15, y: z.y+15, vx: (Math.random()-0.5)*14, vy: (Math.random()-0.5)*14, life: 1, color: Math.random()<0.3?'#4d6e36':'#880000', size: 4 });
                    }

                    if (z.hp <= 0) {
                        score++; runSouls += 2; combo++; comboTimer = 120;
                        sound.playDeath();
                        if (config.gore && Math.random() < 0.6) decals.push({ x: z.x + 10, y: GROUND_Y - 5, type: Math.random()<0.5?'blood':'guts' });
                        if (combo > 1) addFloatingText(`${combo}x CARNAGE!`, z.x, z.y - 10, '#ffcc00', 22);
                        zombies.splice(j, 1);
                    }
                    if (pr.type !== 'slash') hit = true;
                    break;
                }
            }
            if (hit) projectiles.splice(i, 1);
        }

        // Zombie Collision
        for (let i = zombies.length - 1; i >= 0; i--) {
            const z = zombies[i];
            z.vx = (player.x < z.x) ? -z.speed : z.speed;
            z.vy += GRAVITY; z.x += z.vx; z.y += z.vy;
            if (z.y + z.height >= GROUND_Y) { z.y = GROUND_Y - z.height; z.vy = 0; }

            if (player.x + player.width - 6 > z.x && player.x + 6 < z.x + z.width && player.y + player.height > z.y && player.y < z.y + z.height) {
                let incomingDmg = (z.type === 2 ? 20 : 12);
                player.hp -= incomingDmg; player.hitFlash = 12;
                if (config.shake) screenShake = 15;
                player.vx = (player.x < z.x) ? -10 : 10; player.vy = -4;
                if (player.hp <= 0) { gameOver(); return; }
            }
            if (z.x < cameraX - 400) zombies.splice(i, 1);
        }

        // Boss AI
        if (boss) {
            boss.timer++; if (boss.hitFlash > 0) boss.hitFlash--;
            document.getElementById('bossHpFill').style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;

            if (boss.state === 'flying') {
                boss.x += (player.x + 180 - boss.x) * 0.04;
                boss.y = GROUND_Y - 220 + Math.sin(globalTime * 0.05) * 35;
                if (boss.timer > 140) { boss.state = 'diving'; boss.timer = 0; }
            } else if (boss.state === 'diving') {
                boss.x += (player.x < boss.x) ? -5.5 : 5.5;
                if (Math.abs(boss.x - player.x) < 80) boss.vy += GRAVITY * 1.5;
                if (boss.y + boss.height >= GROUND_Y) { boss.y = GROUND_Y - boss.height; boss.state = 'breathing'; boss.timer = 0; if (config.shake) screenShake = 22; }
            } else if (boss.state === 'breathing') {
                if (boss.timer % 6 === 0 && config.gore) {
                    particles.push({ x: boss.x + 10, y: boss.y + 30, vx: -8, vy: (Math.random()-0.5)*2, life: 0.8, color: '#ff0033', size: 8 });
                }
                if (boss.timer > 70) { boss.state = 'flying'; boss.timer = 0; }
            }

            if (player.x + player.width > boss.x && player.x < boss.x + boss.width && player.y + player.height > boss.y && player.y < boss.y + boss.height) {
                player.hp -= 2.5; player.hitFlash = 8;
                if (player.hp <= 0) { gameOver(); return; }
            }
        }

        // Spawner
        if (globalTime % Math.max(26, 80 - Math.floor(score/5)*4) === 0 && !boss) spawnZombie();

        // Particles & Decals
        for (let i = particles.length - 1; i >= 0; i--) {
            let p = particles[i]; p.x += p.vx; p.y += p.vy; p.vy += GRAVITY * 0.3; p.life -= 0.025;
            if (p.life <= 0) particles.splice(i, 1);
        }
        for (let i = floatingTexts.length - 1; i >= 0; i--) {
            let ft = floatingTexts[i]; ft.y += ft.vy; ft.life -= 0.02;
            if (ft.life <= 0) floatingTexts.splice(i, 1);
        }
        if (decals.length > 40) decals.shift();

        // HUD Updates
        document.getElementById('scoreTxt').innerText = `SLAUGHTERED: ${score}`;
        document.getElementById('soulsTxt').innerText = `BLOOD: 🩸 ${runSouls}`;
        document.getElementById('distTxt').innerText = `DEPTH: ${Math.floor(player.x / 10)}m`;
        document.getElementById('hpFill').style.width = `${Math.max(0, (player.hp / player.maxHp) * 100)}%`;
    }

    // --- RENDERING ---
    function draw() {
        ctx.save();
        if (config.shake && screenShake > 0) ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);

        // Fleshy Meat Dimension Sky
        let skyGrad = ctx.createLinearGradient(0, 0, 0, height);
        skyGrad.addColorStop(0, '#0d0004'); skyGrad.addColorStop(1, '#2b000a');
        ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, width, height);

        // Blood Moon
        ctx.fillStyle = '#ff0033'; ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 45;
        ctx.beginPath(); ctx.arc(width - 140, 110, 55, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;

        ctx.save();
        ctx.translate(-cameraX, 0);

        // Visceral Ground
        ctx.fillStyle = '#120005'; ctx.fillRect(cameraX - 100, GROUND_Y, width + 200, height - GROUND_Y);
        ctx.fillStyle = '#660011'; ctx.fillRect(cameraX - 100, GROUND_Y, width + 200, 6);

        // Platforms
        platforms.forEach(p => {
            ctx.fillStyle = '#3a0510'; ctx.fillRect(p.x, p.y, p.w, p.h);
            ctx.fillStyle = '#880018'; ctx.fillRect(p.x, p.y, p.w, 4);
        });

        // Decals (Blood & Guts)
        decals.forEach(d => {
            ctx.fillStyle = 'rgba(136, 0, 0, 0.7)';
            ctx.beginPath(); ctx.ellipse(d.x, d.y, 16, 5, 0, 0, Math.PI*2); ctx.fill();
        });

        // Projectiles
        projectiles.forEach(pr => {
            ctx.fillStyle = pr.type === 'cleaver' ? '#e0e0e0' : (pr.type === 'slash' ? '#ff0033' : '#ffcc00');
            ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12;
            ctx.fillRect(pr.x, pr.y, pr.width, pr.height); ctx.shadowBlur = 0;
        });

        // Monsters
        zombies.forEach(z => {
            ctx.fillStyle = z.type === 2 ? '#4a121a' : (z.type === 1 ? '#2b471c' : '#3d1c24');
            ctx.fillRect(z.x, z.y, z.width, z.height);
            ctx.fillStyle = '#ff0000'; ctx.fillRect(z.x + (z.vx < 0 ? 4 : z.width - 8), z.y + 8, 4, 3);
        });

        // Boss (Behemoth)
        if (boss) {
            ctx.fillStyle = boss.hitFlash > 0 ? '#ffffff' : '#660000';
            ctx.fillRect(boss.x, boss.y, boss.width, boss.height);
            ctx.fillStyle = '#ffcc00'; ctx.fillRect(boss.x + 20, boss.y + 20, 14, 14);
        }

        // Masked Berserker Player
        ctx.save();
        if (player.hitFlash > 0) ctx.globalAlpha = 0.5;
        
        // Body & Vest
        ctx.fillStyle = '#3a5370'; ctx.fillRect(player.x, player.y + 12, player.width, 26);
        ctx.fillStyle = '#d9a77c'; ctx.fillRect(player.x - 4, player.y + 14, 6, 20); ctx.fillRect(player.x + player.width, player.y + 14, 6, 20);

        // Skull Mask
        ctx.fillStyle = '#e6e6e6'; ctx.beginPath(); ctx.arc(player.x + player.width/2, player.y + 10, 12, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#111'; ctx.fillRect(player.x + (player.facing === 1 ? 18 : 8), player.y + 8, 4, 4);

        // Pants
        ctx.fillStyle = '#222'; ctx.fillRect(player.x + 4, player.y + 38, 10, 16); ctx.fillRect(player.x + 20, player.y + 38, 10, 16);

        ctx.restore();

        // Particles & Floating Text
        particles.forEach(p => {
            ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillRect(p.x, p.y, p.size, p.size);
        });
        ctx.globalAlpha = 1.0;

        floatingTexts.forEach(ft => {
            ctx.fillStyle = ft.color; ctx.font = `bold ${ft.size}px 'Impact', sans-serif`;
            ctx.globalAlpha = Math.max(0, ft.life);
            ctx.fillText(ft.txt, ft.x, ft.y);
        });
        ctx.globalAlpha = 1.0;

        ctx.restore();
        ctx.restore();

        // Muzzle Flash Overlay
        if (screenFlash > 0) {
            ctx.fillStyle = `rgba(255, 200, 0, ${screenFlash / 10})`;
            ctx.fillRect(0, 0, width, height);
        }
        // Damage Flash Overlay
        if (player.hitFlash > 0) {
            ctx.fillStyle = `rgba(255, 0, 0, ${player.hitFlash / 40})`;
            ctx.fillRect(0, 0, width, height);
        }
    }

    function gameLoop() {
        update(); draw(); requestAnimationFrame(gameLoop);
    }

    // --- INPUT LISTENERS ---
    window.addEventListener('keydown', e => {
        if (e.key === 'a' || e.key === 'ArrowLeft') keys.a = true;
        if (e.key === 'd' || e.key === 'ArrowRight') keys.d = true;
        if (e.key === 'w' || e.key === 'ArrowUp' || e.key === ' ') keys.jumpPressed = true;
        if (e.key === 'f' || e.key === 'F') attack();
        if (e.key === '1') { player.weapon = 1; updateWeaponUI(); }
        if (e.key === '2') { player.weapon = 2; updateWeaponUI(); }
        if (e.key === '3') { player.weapon = 3; updateWeaponUI(); }
    });

    window.addEventListener('keyup', e => {
        if (e.key === 'a' || e.key === 'ArrowLeft') keys.a = false;
        if (e.key === 'd' || e.key === 'ArrowRight') keys.d = false;
    });

    // Touch Joystick Controls
    const touchZoneLeft = document.getElementById('touchLeftZone');
    const joystickVisual = document.getElementById('virtualJoystick');
    const joystickKnob = document.getElementById('joystickKnob');

    touchZoneLeft.addEventListener('touchstart', e => {
        e.preventDefault();
        const t = e.touches[0];
        joystickActive = true;
        joystickOrigin = { x: t.clientX, y: t.clientY };
        joystickCurrent = { x: t.clientX, y: t.clientY };
        joystickVisual.style.left = `${t.clientX}px`;
        joystickVisual.style.top = `${t.clientY}px`;
        joystickKnob.style.transform = `translate(-50%, -50%)`;
        joystickVisual.style.display = 'block';
    }, { passive: false });

    touchZoneLeft.addEventListener('touchmove', e => {
        if (!joystickActive) return;
        const t = e.touches[0];
        joystickCurrent = { x: t.clientX, y: t.clientY };
        let dx = joystickCurrent.x - joystickOrigin.x;
        let dy = joystickCurrent.y - joystickOrigin.y;
        let dist = Math.min(35, Math.hypot(dx, dy));
        let angle = Math.atan2(dy, dx);
        joystickKnob.style.transform = `translate(calc(-50% + ${Math.cos(angle)*dist}px), calc(-50% + ${Math.sin(angle)*dist}px))`;
    }, { passive: false });

    const endJoystick = () => { joystickActive = false; joystickVisual.style.display = 'none'; };
    touchZoneLeft.addEventListener('touchend', endJoystick);
    touchZoneLeft.addEventListener('touchcancel', endJoystick);

    // Right Action Buttons
    document.getElementById('btnAttack').addEventListener('touchstart', e => { e.preventDefault(); attack(); });
    document.getElementById('btnJump').addEventListener('touchstart', e => { e.preventDefault(); keys.jumpPressed = true; });
    document.getElementById('btnSwap').addEventListener('touchstart', e => { e.preventDefault(); player.weapon = (player.weapon % 3) + 1; updateWeaponUI(); });

    // Menu Controls Wireup
    document.getElementById('startBtn').addEventListener('click', resetGame);
    document.getElementById('retryBtn').addEventListener('click', resetGame);
    document.getElementById('shopBtn').addEventListener('click', () => { document.getElementById('startScreen').classList.add('hidden'); document.getElementById('shopScreen').classList.remove('hidden'); });
    document.getElementById('closeShopBtn').addEventListener('click', () => { document.getElementById('shopScreen').classList.add('hidden'); document.getElementById('startScreen').classList.remove('hidden'); });
    document.getElementById('settingsBtn').addEventListener('click', () => { document.getElementById('startScreen').classList.add('hidden'); document.getElementById('settingsScreen').classList.remove('hidden'); });
    document.getElementById('closeSettingsBtn').addEventListener('click', () => { config.save(); document.getElementById('settingsScreen').classList.add('hidden'); document.getElementById('startScreen').classList.remove('hidden'); });

    document.getElementById('slot1').addEventListener('click', () => { player.weapon = 1; updateWeaponUI(); });
    document.getElementById('slot2').addEventListener('click', () => { player.weapon = 2; updateWeaponUI(); });
    document.getElementById('slot3').addEventListener('click', () => { player.weapon = 3; updateWeaponUI(); });

    document.getElementById('adReviveBtn').addEventListener('click', () => { revivePlayer(); });

    // Shop Upgrades
    document.getElementById('buyHpBtn').addEventListener('click', () => {
        let cost = (SaveData.lvlHp + 1) * 10;
        if (SaveData.souls >= cost) { SaveData.souls -= cost; SaveData.lvlHp++; SaveData.save(); }
    });
    document.getElementById('buyDmgBtn').addEventListener('click', () => {
        let cost = (SaveData.lvlDmg + 1) * 15;
        if (SaveData.souls >= cost) { SaveData.souls -= cost; SaveData.lvlDmg++; SaveData.save(); }
    });
    document.getElementById('buySpeedBtn').addEventListener('click', () => {
        let cost = (SaveData.lvlSpeed + 1) * 12;
        if (SaveData.souls >= cost) { SaveData.souls -= cost; SaveData.lvlSpeed++; SaveData.save(); }
    });

    gameLoop();