import { useEffect, useRef } from 'react'

const characterPixels = [
  '____RRRRR___', '___RRRRRRRR_', '___OOOSOSS__', '__OOSOSSSOSS',
  '__OOSOSSSOSS', '__OOSSSSOOOO', '___SSSSSSS__', '__OOORRR____',
  '_OOORRRRROO_', 'OOOOORRRROOO', 'SSORRSSRROSS', 'SSSRRRRRRSSS',
  'SSRRRRRRRRSS', '__RRR____RRR', '_OOO______OO', 'OOOO______OO'
]

export default function PixelGame() {
  const canvasRef = useRef(null)
  const shadowCanvasRef = useRef(null)
  const audioCtx = useRef(null)

  // Lazily create audio context on first user interaction (browser policy)
  const getAudio = () => {
    if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)()
    return audioCtx.current
  }

  const playSound = (type) => {
    try {
      const ac = getAudio()
      const o = ac.createOscillator()
      const g = ac.createGain()
      o.connect(g); g.connect(ac.destination)
      if (type === 'jump') {
        o.type = 'square'; o.frequency.setValueAtTime(300, ac.currentTime); o.frequency.linearRampToValueAtTime(600, ac.currentTime + 0.08)
        g.gain.setValueAtTime(0.15, ac.currentTime); g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.12)
        o.start(); o.stop(ac.currentTime + 0.12)
      } else if (type === 'coin') {
        o.type = 'square'; o.frequency.setValueAtTime(880, ac.currentTime); o.frequency.setValueAtTime(1320, ac.currentTime + 0.07)
        g.gain.setValueAtTime(0.15, ac.currentTime); g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.18)
        o.start(); o.stop(ac.currentTime + 0.18)
      } else if (type === 'stomp') {
        o.type = 'square'; o.frequency.setValueAtTime(220, ac.currentTime); o.frequency.linearRampToValueAtTime(80, ac.currentTime + 0.1)
        g.gain.setValueAtTime(0.2, ac.currentTime); g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.12)
        o.start(); o.stop(ac.currentTime + 0.12)
      } else if (type === 'gameover') {
        o.type = 'square'; o.frequency.setValueAtTime(440, ac.currentTime); o.frequency.linearRampToValueAtTime(110, ac.currentTime + 0.6)
        g.gain.setValueAtTime(0.2, ac.currentTime); g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.65)
        o.start(); o.stop(ac.currentTime + 0.65)
      }
    } catch (e) { /* Audio not available, fail silently */ }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const shadowCanvas = shadowCanvasRef.current
    const ctx = canvas.getContext('2d')
    const ctx2 = shadowCanvas.getContext('2d')
    let raf, last = performance.now(), jumpQueued = false
    const keys = Object.create(null)
    const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

    const resize = () => { 
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      shadowCanvas.width = window.innerWidth; shadowCanvas.height = window.innerHeight;
    }
    const keyDown = event => {
      if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].includes(event.code)) event.preventDefault()
      if ((event.code === 'Space' || event.code === 'ArrowUp') && !keys[event.code]) jumpQueued = true
      keys[event.code] = true
    }
    const keyUp = event => { 
      if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      keys[event.code] = false 
    }
    window.addEventListener('resize', resize); window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); resize()

    const newGame = () => ({ score: 0, cameraX: 0, nextX: 0, gameOver: false, gameOverTimer: 5, platforms: [], blocks: [], coins: [], enemies: [], clouds: [], decorations: [], player: { x: 100, y: 100, w: 48, h: 64, vx: 0, vy: 0, onGround: false, coyote: 0, facingLeft: false, dist: 0 } })
    let game = newGame()
    const groundY = () => canvas.height - 60
    const setSize = p => {
      const scale = 1 + Math.min(0.45, Math.floor(game.score / 5) * 0.15)
      const bottom = p.y + p.h
      p.w = 48 * scale; p.h = 64 * scale; p.y = bottom - p.h
    }
    const makeWorld = target => {
      if (!game.nextX) { game.platforms.push({ x: 0, y: groundY(), w: 520, h: 2000 }); game.nextX = 520 }
      while (game.nextX < target) {
        const start = game.nextX, gap = start < 850 ? 0 : (Math.random() < .4 ? 100 + Math.random() * 60 : 0)
        const width = 320 + Math.random() * 360, x = start + gap, floor = { x, y: groundY(), w: width, h: 2000 }
        game.platforms.push(floor)
        if (!gap && start > 450 && Math.random() < .7) {
          const count = 3 + Math.floor(Math.random() * 5); // 3 to 7 blocks continuously
          const bx = x + 80 + Math.random() * Math.max(10, width - (count * 40) - 80);
          for (let i = 0; i < count; i++) game.blocks.push({ x: bx + i * 40, y: floor.y - 140, w: 40, h: 40, used: false, bump: 0, type: Math.random() < .3 ? 'item' : 'brick' })
        }
        if (start > 650) {
          // First few platforms have 1 monster, later platforms can have 1-3 monsters
          const eCount = start < 1200 ? 1 : 1 + Math.floor(Math.random() * 3);
          for (let i = 0; i < eCount; i++) {
            game.enemies.push({ x: x + width * (0.3 + i * 0.2 + Math.random() * 0.1), y: floor.y - 40, w: 40, h: 40, vx: Math.random() < .5 ? -2.5 : 2.5, dead: 0 })
          }
        }
        if (!gap && Math.random() < .72) {
          const cx = x + 55 + Math.random() * (width - 110);
          let cy = floor.y - 105;
          for (const b of game.blocks) {
              if (Math.abs((b.x + 20) - (cx + 10)) < 45) cy = floor.y - 200;
          }
          game.coins.push({ x: cx, y: cy, w: 20, h: 26, taken: false, bob: Math.random() * 6.28 })
        }
        if (Math.random() < .7) game.clouds.push({ x: x + Math.random() * width, y: 45 + Math.random() * 145, s: 20 + Math.random() * 20 })
        if (!gap && Math.random() < .6) game.decorations.push({ x: x + 45 + Math.random() * (width - 90), type: Math.random() < .5 ? 'bush' : 'hill' })
        game.nextX = x + width
      }
    }
    const reset = () => { game = newGame(); jumpQueued = false; makeWorld(3000) }
    reset()

    const update = dt => {
      if (game.gameOver) {
        game.gameOverTimer -= dt;
        if (game.gameOverTimer <= 0) {
            reset();
            for (const key in keys) keys[key] = false;
        }
        return;
      }
      
      const p = game.player, speed = 7 * dt, left = keys.ArrowLeft, right = keys.ArrowRight
      if (right) { p.vx = speed; p.facingLeft = false } else if (left) { p.vx = -speed; p.facingLeft = true } else p.vx = 0
      p.coyote = p.onGround ? 7 : Math.max(0, p.coyote - dt)
      if (jumpQueued && p.coyote > 0) { p.vy = -13; p.onGround = false; p.coyote = 0; playSound('jump') }
      jumpQueued = false
      if (!keys.Space && !keys.ArrowUp && p.vy < -4) p.vy += .8 * dt
      p.vy = Math.min(p.vy + .5 * dt, 14)

      p.x += p.vx
      for (const solid of [...game.platforms, ...game.blocks]) if (hit(p, solid)) { p.x = p.vx > 0 ? solid.x - p.w : solid.x + solid.w; p.vx = 0 }
      const previousBottom = p.y + p.h
      const previousTop = p.y
      p.y += p.vy; p.onGround = false
      const overlapX = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
      const solids = [...game.platforms, ...game.blocks].sort((a, b) => overlapX(p, b) - overlapX(p, a))
      for (const solid of solids) if (hit(p, solid)) {
        if (p.vy >= 0 && previousBottom <= solid.y + 12) { p.y = solid.y - p.h; p.vy = 0; p.onGround = true }
        else if (p.vy < 0 && previousTop >= solid.y + solid.h - 12) {
          p.y = solid.y + solid.h; p.vy = 0
          if (solid.type && !solid.used) { solid.used = true; solid.bump = 10; if (solid.type === 'item') game.coins.push({ x: solid.x + 10, y: solid.y - 30, w: 20, h: 26, taken: false, bob: 0 }) }
        }
      }
      for (const block of game.blocks) block.bump = Math.max(0, block.bump - dt)
      for (const coin of game.coins) if (!coin.taken) { coin.bob += .18 * dt; if (hit(p, coin)) { coin.taken = true; game.score++; setSize(p); playSound('coin') } }

      for (const enemy of game.enemies) {
        if (enemy.dead) { enemy.dead -= dt; continue }
        enemy.x += enemy.vx * dt
        const floor = game.platforms.find(s => enemy.x + enemy.w > s.x + 3 && enemy.x < s.x + s.w - 3 && Math.abs(enemy.y + enemy.h - s.y) < 12)
        if (!floor) { enemy.vx *= -1; continue }
        
        const px = p.x + 4, pw = p.w - 8, py = p.y + 4, ph = p.h - 8;
        const ex = enemy.x + 2, ew = enemy.w - 4, ey = enemy.y + 4, eh = enemy.h - 4;
        
        if (px < ex + ew && px + pw > ex && py < ey + eh && py + ph > ey) {
          if (p.vy > 0 && p.y + p.h < enemy.y + 36) { 
              enemy.dead = 30; 
              p.vy = -13; 
              p.y = enemy.y - p.h + 8;
              game.score += 2;
              setSize(p);
              playSound('stomp');
          }
          else {
              game.gameOver = true;
          }
        }
      }
      if (p.y > canvas.height + 80) { game.gameOver = true; }
      game.cameraX = Math.max(game.cameraX, p.x - canvas.width / 2 + p.w / 2);
      if (p.x < game.cameraX) { p.x = game.cameraX; if (p.vx < 0) p.vx = 0; }
      makeWorld(game.cameraX + canvas.width * 2)
      for (const key of ['platforms', 'blocks', 'coins', 'enemies', 'clouds', 'decorations']) game[key] = game[key].filter(o => o.x + (o.w || o.s * 4 || 100) > game.cameraX - 250)
      p.dist = Math.max(p.dist, Math.floor(p.x / 100))
    }

    const rect = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)) }
    const drawGround = s => { ctx.save(); ctx.beginPath(); ctx.rect(s.x, s.y, s.w, s.h); ctx.clip(); rect(s.x, s.y, s.w, s.h, '#a94b0b'); rect(s.x, s.y, s.w, 9, '#f4a95d'); rect(s.x, s.y + 9, s.w, 4, '#572000'); for (let y = s.y + 15; y < s.y + s.h; y += 47) { for (let x = s.x - (s.x % 56); x < s.x + s.w; x += 56) { ctx.strokeStyle = '#3e1700'; ctx.lineWidth = 4; ctx.strokeRect(x + 4, y, 46, 43); rect(x + 7, y + 4, 40, 4, '#d77a2c') } } ctx.restore(); }
    const drawBlock = b => { const y = b.y - b.bump; if (b.type === 'item') { rect(b.x, y, 40, 40, b.used ? '#9a570d' : '#f6a314'); rect(b.x + 4, y + 4, 32, 32, b.used ? '#c77b20' : '#ffc940'); ctx.strokeStyle = '#3a1900'; ctx.lineWidth = 4; ctx.strokeRect(b.x + 2, y + 2, 36, 36); if (!b.used) { ctx.fillStyle = '#3a1900'; ctx.font = 'bold 28px monospace'; ctx.fillText('?', b.x + 10, y + 29) } } else { rect(b.x, y, 40, 40, '#a9470b'); ctx.strokeStyle = '#2e1200'; ctx.lineWidth = 4; ctx.strokeRect(b.x + 1, y + 1, 38, 38); ctx.beginPath(); ctx.moveTo(b.x, y + 20); ctx.lineTo(b.x + 40, y + 20); ctx.moveTo(b.x + 20, y); ctx.lineTo(b.x + 20, y + 20); ctx.stroke() } }
    const draw = () => {
      ctx.imageSmoothingEnabled = false; rect(0, 0, canvas.width, canvas.height, '#5c94fc'); ctx.save(); ctx.translate(-game.cameraX, 0)
      ctx2.clearRect(0, 0, canvas.width, canvas.height); ctx2.save(); ctx2.translate(-game.cameraX, 0)
      for (const c of game.clouds) { rect(c.x, c.y, c.s * 4, c.s, '#dcecff'); rect(c.x + c.s, c.y - c.s * .45, c.s * 2.2, c.s, '#dcecff') }
      for (const d of game.decorations) { const y = groundY(); if (d.type === 'hill') { ctx.fillStyle = '#098b08'; ctx.beginPath(); ctx.moveTo(d.x - 55, y); ctx.lineTo(d.x, y - 105); ctx.lineTo(d.x + 85, y); ctx.fill(); rect(d.x - 15, y - 40, 8, 25, '#003900'); rect(d.x + 10, y - 60, 10, 27, '#003900') } else { rect(d.x, y - 26, 65, 26, '#087d05'); rect(d.x + 15, y - 42, 36, 24, '#087d05') } }
      for (const s of game.platforms) {
        drawGround(s);
        ctx2.fillStyle = '#000000';
        ctx2.fillRect(Math.round(s.x), Math.round(s.y), Math.round(s.w), Math.round(s.h));
      }
      for (const b of game.blocks) {
        drawBlock(b);
        ctx2.fillStyle = '#000000';
        ctx2.fillRect(Math.round(b.x), Math.round(b.y - b.bump), 40, 40);
      }
      for (const c of game.coins) if (!c.taken) { const y = c.y + Math.sin(c.bob) * 4; rect(c.x, y, 20, 26, '#f9d53a'); rect(c.x + 7, y + 3, 5, 20, '#fff3a4') }
      for (const e of game.enemies) { 
        if (e.dead) { 
          rect(e.x, e.y + 28, 40, 10, '#6a2f10'); 
          ctx2.fillStyle = '#000000';
          ctx2.fillRect(Math.round(e.x), Math.round(e.y + 28), 40, 10);
          continue 
        } 
        rect(e.x + 4, e.y + 5, 32, 28, '#8b4013'); rect(e.x, e.y + 17, 40, 18, '#8b4013'); rect(e.x + 6, e.y + 12, 8, 11, '#fff1d6'); rect(e.x + 26, e.y + 12, 8, 11, '#fff1d6'); rect(e.x + 10, e.y + 14, 4, 8, '#111'); rect(e.x + 26, e.y + 14, 4, 8, '#111'); rect(e.x + 2, e.y + 34, 13, 6, '#241000'); rect(e.x + 25, e.y + 34, 13, 6, '#241000') 
        ctx2.fillStyle = '#000000';
        ctx2.fillRect(Math.round(e.x), Math.round(e.y + 5), 40, 35);
      }
      const p = game.player, px = p.w / 12; ctx.save(); if (p.facingLeft) { ctx.translate(p.x + p.w, p.y); ctx.scale(-1, 1) } else ctx.translate(p.x, p.y)
      ctx2.save(); if (p.facingLeft) { ctx2.translate(p.x + p.w, p.y); ctx2.scale(-1, 1) } else ctx2.translate(p.x, p.y)
      for (let row = 0; row < characterPixels.length; row++) for (let col = 0; col < characterPixels[row].length; col++) { 
        const color = characterPixels[row][col]; 
        if (color !== '_') { 
          ctx.fillStyle = color === 'R' ? '#ff1111' : color === 'O' ? '#1a56ff' : '#ffcc99'; 
          ctx.fillRect(col * px, row * px, px + .5, px + .5) 
          ctx2.fillStyle = '#000000';
          ctx2.fillRect(col * px, row * px, px + .5, px + .5) 
        } 
      } 
      ctx.restore(); ctx.restore()
      ctx2.restore(); ctx2.restore()
      ctx.fillStyle = 'white'; ctx.font = "20px 'Press Start 2P', monospace"; ctx.shadowColor = 'black'; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3; 
      if (canvas.width > 640) { ctx.fillText(`COINS: ${game.score}`, 30, 50); ctx.fillText(`DIST: ${game.player.dist}m`, 30, 90); }
      ctx.shadowColor = 'transparent'
      if (game.gameOver) { ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = "40px 'Press Start 2P', monospace"; ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 20); ctx.textAlign = 'left' }
    }
    const loop = now => { const dt = Math.min(2, (now - last) / (1000 / 60)); last = now; update(dt); draw(); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp) }
  }, [])

  return (
    <>
      <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" />
      <canvas ref={shadowCanvasRef} className="fixed inset-0 z-20 pointer-events-none opacity-20 mix-blend-multiply hidden sm:block" />
    </>
  )
}
