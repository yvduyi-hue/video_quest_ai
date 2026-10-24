/**
 * 弹珠打靶（Marble Shooter）—— Phaser 场景
 *
 * 玩法：屏幕上方悬挂若干靶子（对应题目 options），玩家像《愤怒的小鸟》一样
 * 从底部拖拽弹弓发射弹珠，击中靶子后判定：
 *   - 击中正确项（is_correct）：靶子碎裂（Tween 缩放淡出销毁），通过本题；
 *   - 击中错误项：弹珠反弹、靶子抖动（无尽模式扣一颗心）。
 *
 * 模式：
 *   - 普通 normal：起始 20s，每通过一题按 gameplay_payload.settings.time_limit 增加可用时间，
 *     在时间耗尽前答完全部题目即成功；打错仅消耗时间不扣命。
 *   - 无尽 endless：3 条命，答对按难度加分，打错扣心；心扣完或时间用完失败，
 *     答完全部题目成功。
 *
 * 与 Vue 的通信：全部通过 game.events 全局事件发射器：
 *   emit('mbs:state', {...})  状态更新（时间/进度/生命/分数/题干）
 *   emit('mbs:phase', {phase, payload})  阶段切换（explain/win/lose/playing）
 * Vue 侧通过 game.scene.getScene('MarbleShooterScene') 调用公共方法：
 *   startGame(questions, mode) / continueAfterExplain() / retry()
 */
import Phaser from 'phaser'

const W = 1280
const H = 720
const ANCHOR_X = W / 2
const ANCHOR_Y = H - 210
const MAX_DRAG = 150
const POWER = 7 // 发射速度 = 拖拽偏移 * POWER
const START_TIME_MS = 20000
const SHOT_TIMEOUT_MS = 3500
const TARGET_Y = 190

function optionLabel(index) {
  return String.fromCharCode(65 + index)
}

export default class MarbleShooterScene extends Phaser.Scene {
  constructor() {
    super('MarbleShooterScene')
  }

  create() {
    this.physics.world.gravity.y = 0
    this.physics.world.setBounds(0, 0, W, H)
    // 底部开放，弹珠飞出后自动重来；左右上反弹
    this.physics.world.setBoundsCollision(true, true, true, false)

    this.buildTextures()

    // 弹弓底座 + 发射点
    this.add.image(ANCHOR_X, ANCHOR_Y, 'sling_tex').setDepth(2)

    // 弹珠（动态刚体）
    this.ball = this.physics.add.image(ANCHOR_X, ANCHOR_Y, 'ball_tex')
    this.ball.setCircle(20, 2, 2)
    this.ball.setCollideWorldBounds(true, 0.9, 0.9)
    this.ball.setDepth(5)
    this.ball.body.moves = false // 待发射状态

    // 瞄准辅助线
    this.aimGfx = this.add.graphics().setDepth(1)

    // 靶子用静态组管理，销毁成员时碰撞器自动同步
    this.targets = this.physics.add.staticGroup()
    this.targetDeco = [] // 绳索 / 文字 / 面板等非物理装饰

    // 运行时状态
    this.questions = []
    this.mode = 'normal'
    this.sessionId = ''
    this.index = 0
    this.score = 0
    this.lives = 3
    this.timeLeftMs = START_TIME_MS
    this.phase = 'idle' // idle | playing | over
    this.paused = false
    this.dragging = false
    this.ballFlying = false
    this.flyDeadline = 0
    this.shotResolved = false
    this.emitAcc = 0

    this.input.addPointer(1)
    this.input.on('pointerdown', this.onDown, this)
    this.input.on('pointermove', this.onMove, this)
    this.input.on('pointerup', this.onUp, this)

    // 场景就绪：通知渲染层由 Vue 主动调用 startGame 开局（不依赖 registry，避免数据未注入）
    this.game.events.emit('mbs:created')
  }

  buildTextures() {
    const g = this.add.graphics()

    // 弹珠：蓝色实心 + 高光
    g.fillStyle(0x0071fe, 1)
    g.fillCircle(22, 22, 20)
    g.fillStyle(0xffffff, 0.85)
    g.fillCircle(15, 15, 6)
    g.generateTexture('ball_tex', 44, 44)
    g.clear()

    // 靶子：同心圆靶心（正确/错误外观一致，答案只由文字决定）
    g.fillStyle(0xe6a23c, 1)
    g.fillCircle(40, 40, 38)
    g.fillStyle(0xffffff, 1)
    g.fillCircle(40, 40, 28)
    g.fillStyle(0xd64545, 1)
    g.fillCircle(40, 40, 18)
    g.fillStyle(0xffffff, 1)
    g.fillCircle(40, 40, 8)
    g.generateTexture('target_tex', 80, 80)
    g.clear()

    // 弹弓底座（待发射位置的环形标记）
    g.fillStyle(0x999999, 1)
    g.fillCircle(20, 20, 6)
    g.lineStyle(4, 0x666666, 1)
    g.strokeCircle(20, 20, 14)
    g.generateTexture('sling_tex', 40, 40)
    g.destroy()
  }

  // ---------------- 公共方法（Vue 调用） ----------------

  startGame(questions, mode) {
    this.questions = Array.isArray(questions) ? questions : []
    this.mode = mode === 'endless' ? 'endless' : 'normal'
    // 一次闯关的唯一会话 id，答题记录按此归组（供闯关历史聚合）
    this.sessionId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    this.index = 0
    this.score = 0
    this.lives = this.mode === 'endless' ? 3 : Number.POSITIVE_INFINITY
    this.timeLeftMs = START_TIME_MS
    this.phase = 'playing'
    this.paused = false
    this.shotResolved = false
    this.clearTargets()
    this.resetShot()
    if (!this.questions.length) {
      this.game.events.emit('mbs:phase', { phase: 'lose', payload: { reason: 'empty' } })
      return
    }
    this.loadQuestion(0)
  }

  continueAfterExplain() {
    if (this.phase !== 'playing') return
    this.advance()
  }

  retry() {
    // 重新挑战：打乱题目顺序后再开局
    this.startGame(this.shuffle(this.questions), this.mode)
  }

  /** Fisher-Yates 洗牌（返回新数组，不修改原数组） */
  shuffle(arr) {
    const a = Array.isArray(arr) ? arr.slice() : []
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  // ---------------- 题目 / 靶子 ----------------

  loadQuestion(i) {
    this.clearTargets()
    const q = this.questions[i]
    this.current = q
    this.shotResolved = false
    this.resetShot()

    const opts = Array.isArray(q.options) ? q.options : []
    const n = Math.max(1, opts.length)
    // 等宽列布局：每个选项占据一列，面板更宽→折行更少；列间距固定，彼此不重叠
    const colW = W / n
    const slotW = Math.min(colW - 20, 360)

    opts.forEach((opt, idx) => {
      const x = Math.round(colW * (idx + 0.5))
      // 绳索
      const rope = this.add.graphics()
      rope.lineStyle(3, 0xb0b0b0, 1)
      rope.lineBetween(x, 0, x, TARGET_Y - 40)
      this.targetDeco.push(rope)

      // 靶子（静态刚体）
      const disc = this.targets.create(x, TARGET_Y, 'target_tex')
      disc.body.enable = true
      disc.body.setCircle(34, 6, 6)
      disc.setData('optionData', opt)
      disc.setData('hit', false)

      // 选项文字面板：高级换行 + 限定最大行数（超出省略号），面板高度按最大行数固定，
      // 从根本上避免长答案向下堆叠遮挡下方靶区/弹珠
      const pad = 10
      const boxTop = TARGET_Y + 52
      const fontPx = n >= 4 ? 16 : 18
      const maxLines = n <= 2 ? 6 : n <= 3 ? 5 : 4
      const slotW_ = slotW
      const boxLeft = x - slotW_ / 2
      const innerW = slotW_ - pad * 2
      // Phaser 4 的 Text 无 setEllipsis：按面板可容纳的字符预算预先截断文本并补省略号，
      // 再用 setMaxLines 作为兜底裁切，保证既不溢出也不遮挡下方区域
      const perLine = Math.max(4, Math.floor(innerW / fontPx))
      const rawText = `${optionLabel(idx)}. ${opt.text || ''}`
      const budget = perLine * maxLines
      const shownText = rawText.length > budget ? `${rawText.slice(0, budget - 1)}…` : rawText
      const label = this.add
        .text(boxLeft + pad, boxTop + pad, shownText, {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: `${fontPx}px`,
          color: '#ffffff',
          align: 'left',
          lineSpacing: 4
        })
        .setOrigin(0, 0)
        .setDepth(4)
      label.setWordWrapWidth(innerW, true)
      label.setMaxLines(maxLines)
      // 固定面板高度（不依赖实时 label.height，避免重排前测得整段高度而超高遮挡）
      const lineH = fontPx + 4
      const boxH = pad * 2 + maxLines * lineH
      const panel = this.add
        .rectangle(boxLeft, boxTop, slotW_, boxH, 0xffffff, 0.12)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0xffffff, 0.4)
        .setDepth(3)
      this.targetDeco.push(panel, label)
    })

    // 碰撞器（每问重建，指向整组）
    this.collider = this.physics.add.collider(this.ball, this.targets, this.onHit, undefined, this)
    this.emitState()
  }

  clearTargets() {
    if (this.collider) {
      this.collider.destroy()
      this.collider = null
    }
    this.targets.clear(true, true)
    this.targetDeco.forEach((d) => d && d.destroy())
    this.targetDeco = []
  }

  onHit(ball, target) {
    if (this.phase !== 'playing' || this.paused) return
    if (target.getData('hit')) return
    const opt = target.getData('optionData')
    if (!opt) return
    target.setData('hit', true)
    target.body.enable = false // 命中一次即失效，避免重复触发

    if (opt.is_correct) {
      this.shotResolved = true
      this.onCorrect(target, opt)
    } else {
      this.onWrong(target)
    }
  }

  onCorrect(target) {
    const q = this.current
    // 碎裂动画：放大 + 淡出后销毁
    this.tweens.add({
      targets: target,
      scale: 1.5,
      alpha: 0,
      duration: 300,
      onComplete: () => target.destroy()
    })

    const timeLimit = q?.gameplayPayload?.settings?.time_limit ?? 15
    this.timeLeftMs += Math.max(0, Number(timeLimit) || 0) * 1000
    this.score += (Number(q?.difficulty) || 3) * 50
    this.emitAnswer(true)
    this.ballFlying = false
    this.resetShot()

    const isLast = this.index >= this.questions.length - 1

    // 回答正确不展示解析，直接短暂停顿后进入下一题
    if (isLast) {
      this.win()
    } else {
      this.time.delayedCall(350, () => this.advance())
    }
    this.emitState()
  }

  onWrong(target) {
    const opt = target.getData('optionData')
    this.emitAnswer(false, opt?.text)
    this.cameras.main.shake(180, 0.008)
    // 靶子抖动
    const ox = target.x
    this.tweens.add({
      targets: target,
      x: { from: ox - 8, to: ox + 8 },
      duration: 60,
      repeat: 3,
      yoyo: true,
      onComplete: () => target.setX(ox)
    })
    if (this.mode === 'endless') {
      this.lives -= 1
      this.emitState()
      if (this.lives <= 0) {
        this.lose('lives')
      }
    }
  }

  advance() {
    if (this.phase !== 'playing') return
    this.index += 1
    if (this.index >= this.questions.length) {
      this.win()
      return
    }
    this.paused = false
    this.loadQuestion(this.index)
  }

  win() {
    this.paused = true
    this.phase = 'over'
    this.game.events.emit('mbs:phase', {
      phase: 'win',
      payload: {
        mode: this.mode,
        score: this.score,
        passed: this.questions.length,
        total: this.questions.length,
        timeLeft: Math.ceil(this.timeLeftMs / 1000)
      }
    })
  }

  lose(reason) {
    this.paused = true
    this.phase = 'over'
    this.game.events.emit('mbs:phase', {
      phase: 'lose',
      payload: {
        mode: this.mode,
        reason,
        score: this.score,
        passed: this.index,
        total: this.questions.length,
        timeLeft: Math.ceil(Math.max(0, this.timeLeftMs) / 1000)
      }
    })
  }

  // ---------------- 发射控制 ----------------

  resetShot() {
    this.ball.body.moves = false
    this.ball.setPosition(ANCHOR_X, ANCHOR_Y)
    this.ball.setVelocity(0, 0)
    this.ball.setAngle(0)
    this.ballFlying = false
    this.dragging = false
    this.aimGfx.clear()
  }

  canAim() {
    return this.phase === 'playing' && !this.paused && !this.ballFlying
  }

  onDown(p) {
    if (!this.canAim()) return
    if (Phaser.Math.Distance.Between(p.x, p.y, this.ball.x, this.ball.y) < 70) {
      this.dragging = true
    }
  }

  onMove(p) {
    if (!this.dragging) return
    let dx = p.x - ANCHOR_X
    let dy = p.y - ANCHOR_Y
    const len = Math.hypot(dx, dy)
    if (len > MAX_DRAG) {
      dx = (dx / len) * MAX_DRAG
      dy = (dy / len) * MAX_DRAG
    }
    this.ball.setPosition(ANCHOR_X + dx, ANCHOR_Y + dy)
    this.drawAim(dx, dy)
  }

  onUp() {
    if (!this.dragging) return
    this.dragging = false
    const dx = this.ball.x - ANCHOR_X
    const dy = this.ball.y - ANCHOR_Y
    if (Math.hypot(dx, dy) < 18) {
      this.resetShot()
      return
    }
    // 弹弓：向后拖，向前发射
    this.ball.body.moves = true
    this.ball.setVelocity(-dx * POWER, -dy * POWER)
    this.ballFlying = true
    this.flyDeadline = this.time.now + SHOT_TIMEOUT_MS
    this.shotResolved = false
    this.aimGfx.clear()
  }

  drawAim(dx, dy) {
    const g = this.aimGfx
    g.clear()
    // 皮筋
    g.lineStyle(4, 0xd64545, 0.9)
    g.lineBetween(ANCHOR_X - 12, ANCHOR_Y, this.ball.x, this.ball.y)
    g.lineBetween(ANCHOR_X + 12, ANCHOR_Y, this.ball.x, this.ball.y)
    // 预测弹道预览虚线：重力为 0，沿发射方向直线前进，在左/右/上边界镜面反弹，到达底部则终止
    const len = Math.hypot(dx, dy)
    if (len < 4) return
    const radius = 20
    let px = ANCHOR_X
    let py = ANCHOR_Y
    let vx = -dx / len
    let vy = -dy / len
    const step = 10
    const dashSteps = 2
    const gapSteps = 2
    const cycle = dashSteps + gapSteps
    const maxSteps = 260
    g.lineStyle(3, 0xffffff, 0.75)
    let prevX = px
    let prevY = py
    for (let i = 0; i < maxSteps; i++) {
      px += vx * step
      py += vy * step
      // 边界反弹（左右/上）
      if (px <= radius && vx < 0) {
        px = radius
        vx = -vx
      } else if (px >= W - radius && vx > 0) {
        px = W - radius
        vx = -vx
      }
      if (py <= radius && vy < 0) {
        py = radius
        vy = -vy
      }
      // 底部开放：飞行越过底部即终止预览
      if (py >= H - radius) break
      // 虚线：按步数周期实/空交替
      if (i % cycle < dashSteps) {
        g.lineBetween(prevX, prevY, px, py)
      }
      prevX = px
      prevY = py
    }
  }

  // ---------------- 主循环 ----------------

  update(_time, delta) {
    if (this.phase !== 'playing' || this.paused) return

    this.timeLeftMs -= delta
    if (this.timeLeftMs <= 0) {
      this.timeLeftMs = 0
      this.lose('time')
      return
    }

    if (this.ballFlying) {
      const b = this.ball
      const out = b.y > H + 60 || b.x < -60 || b.x > W + 60 || this.time.now > this.flyDeadline
      if (out) this.resetShot()
    }

    this.emitAcc += delta
    if (this.emitAcc >= 200) {
      this.emitAcc = 0
      this.emitState()
    }
  }

  /**
   * 向渲染层上报一次作答（供 Vue 调 window.api 入库 game_history / 错题本）
   * @param {boolean} correct 是否答对
   * @param {string} [chosenText] 答错时选中的选项文本
   */
  emitAnswer(correct, chosenText) {
    const q = this.current
    if (!q) return
    this.game.events.emit('mbs:answer', {
      sessionId: this.sessionId,
      mode: this.mode,
      questionId: q.id ?? null,
      questionText: q.questionText || '',
      knowledgePoint: q.knowledgePoint || '',
      vid: q.vid || '',
      difficulty: q.difficulty ?? null,
      sourceTime: q.metadata?.source_time ?? null,
      correct,
      chosenText: chosenText || '',
      score: this.score
    })
  }

  emitState() {
    const q = this.current
    this.game.events.emit('mbs:state', {
      mode: this.mode,
      index: this.index,
      total: this.questions.length,
      timeLeft: Math.ceil(Math.max(0, this.timeLeftMs) / 1000),
      lives: this.mode === 'endless' ? this.lives : null,
      score: this.score,
      questionText: q ? q.questionText || '' : '',
      knowledgePoint: q ? q.knowledgePoint || '' : '',
      difficulty: q ? (q.difficulty ?? null) : null
    })
  }
}

export { W, H }
