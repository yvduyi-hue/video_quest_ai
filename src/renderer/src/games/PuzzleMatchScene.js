/**
 * 拼图连线（Match Pairs）—— Phaser 场景
 *
 * 玩法：一组最多 4 道题，左边一列是「概念」（题目知识点，缺知识点时用题干），
 * 右边一列是解释卡片，数量为左侧的两倍：每题给出「1 个正确解释 + 1 个混淆项」
 * （混淆项取自该题自己的错误选项，看起来同样像是正确答案），整体打乱后并排。
 * 玩家要从右侧把每一张概念对应的正确解释连出来：
 *   - 配到同题的正确解释：两张卡片锁定并画出绿色连线，计入得分；
 *   - 配到混淆项：算一次答错（扣时/扣心并记入错题本），该混淆项被划掉永久排除；
 *   - 配到其他题的正确解释：同样算一次答错，但对方卡片保留（它属于另一道题）。
 * 左侧全部配对完成后自动进入下一组（剩下的都是混淆项），所有组完成即通关。
 *
 * 操作：两种都支持
 *   1) 点选：先点左侧卡片（高亮），再点右侧卡片；
 *   2) 拖拽：按住任一侧卡片拖到对侧卡片上松手（松手时按最近的一张兜底）。
 *
 * 卡片尺寸：左右两列行距/卡高/字号按各自张数自适应（sideLayout），
 * 保证一屏 8 张解释卡也不会挤出画面。
 *
 * 模式（与弹珠打靶一致的开局设置）：
 *   - 普通 normal：起始 20s，每配对成功一题按 gameplay_payload.settings.time_limit 增加时间，
 *     配错扣 4s；在时间耗尽前配完全部题目即成功。
 *   - 无尽 endless：3 条命，配对成功按难度加分，配错扣一颗心；心扣完或时间用完失败。
 *
 * 与 Vue 的通信：全部通过 game.events 全局事件发射器：
 *   emit('mtc:state', {...})                状态更新（时间/进度/生命/分数）
 *   emit('mtc:phase', { phase, payload })   阶段切换（win/lose）
 *   emit('mtc:answer', {...})               一次配对作答记录（供 Vue 入库）
 * Vue 侧通过 game.scene.getScene('PuzzleMatchScene') 调用公共方法：
 *   startGame(questions, mode) / retry()
 */
import Phaser from 'phaser'

const W = 1280
const H = 720
// 左右两列卡片：中间留出通道画连线
const CARD_W = 520
// 卡片最大高度（张数少时用得到，张数多时自动压缩）
const CARD_H_MAX = 96
// 同列两张卡片之间的最小间隙
const ROW_INNER_GAP = 6
const LEFT_X = 60
const RIGHT_X = W - 60 - CARD_W
const TOP_Y = 205
const BOTTOM_Y = H - 70
// 一组最多 4 对（右侧因此最多 8 张），超过则拆组（题量少时自动减小每组对数）
const MAX_PAIRS_PER_ROUND = 4
const START_TIME_MS = 20000
const WRONG_PENALTY_MS = 4000
const FONT_PX = 17
// 卡片被压缩后改用略小字号，保证能多挤一行
const FONT_PX_SM = 15
const PAD = 14
// 序号/徽标占据的横向宽度
const BADGE_W = 18
// 徽标在卡片内的垂直中心（局部坐标）
const BADGE_Y = 14
// 小于该位移视为点选而非拖拽
const DRAG_MIN = 12

/**
 * 按一列的卡片数量算出排布（行距、卡高、字号、可显示行数）
 * @param {number} count 该列卡片张数
 */
function sideLayout(count) {
  const avail = BOTTOM_Y - TOP_Y
  const pitch = avail / Math.max(1, count)
  const h = Math.max(42, Math.min(CARD_H_MAX, pitch - ROW_INNER_GAP))
  const fontSize = h >= 70 ? FONT_PX : FONT_PX_SM
  const lines = Math.max(1, Math.floor((h - 10) / (fontSize + 4)))
  return { pitch, h, fontSize, lines }
}

/** Phaser 4 的 Text 无 setEllipsis：按字符预算预先截断并补省略号，再用 setMaxLines 兜底裁切 */
function clip(text, budget) {
  const s = String(text || '')
  return s.length > budget ? `${s.slice(0, budget - 1)}…` : s
}

function optionLabel(index) {
  return String.fromCharCode(65 + index)
}

export default class PuzzleMatchScene extends Phaser.Scene {
  constructor() {
    super('PuzzleMatchScene')
  }

  create() {
    // 连线层：正式连线 + 拖拽预览/错误闪烁
    this.lineGfx = this.add.graphics().setDepth(2)
    this.tempGfx = this.add.graphics().setDepth(4)
    // 组标题
    this.titleText = this.add
      .text(W / 2, 150, '', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#b9c2d0'
      })
      .setOrigin(0.5, 0.5)
      .setDepth(4)

    // 运行时状态
    this.questions = []
    this.rounds = []
    this.mode = 'normal'
    this.sessionId = ''
    this.roundIndex = 0
    this.matchedTotal = 0
    this.totalPairs = 0
    this.score = 0
    this.lives = 3
    this.timeLeftMs = START_TIME_MS
    this.phase = 'idle' // idle | playing | over
    this.paused = false
    this.emitAcc = 0

    // 本组卡片与配对状态
    this.leftCards = []
    this.rightCards = []
    this.roundPairs = []
    this.roundMatched = 0
    this.selectedLeft = null // 点选模式下已选中的左卡片下标
    this.drag = null // 拖拽中：{ side: 'left'|'right', idx, sx, sy }

    this.input.on('pointerdown', this.onDown, this)
    this.input.on('pointermove', this.onMove, this)
    this.input.on('pointerup', this.onUp, this)
    // 长按（尤其触屏/模拟指针）会弹出右键/长按菜单，吞掉 pointerup 导致连线失败
    this.input.mouse.disableContextMenu()
    // 在画布外松手时复位拖拽，避免残留状态卡住后续点选
    this.input.on('pointerupoutside', this.onUpOutside, this)

    // 场景就绪：通知渲染层由 Vue 主动调用 startGame 开局（不依赖 registry，避免数据未注入）
    this.game.events.emit('mtc:created')
  }

  // ---------------- 公共方法（Vue 调用） ----------------

  startGame(questions, mode) {
    this.questions = Array.isArray(questions) ? questions : []
    this.mode = mode === 'endless' ? 'endless' : 'normal'
    // 一次闯关的唯一会话 id，答题记录按此归组（供闯关历史聚合）
    this.sessionId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    this.matchedTotal = 0
    this.score = 0
    this.lives = this.mode === 'endless' ? 3 : Number.POSITIVE_INFINITY
    this.timeLeftMs = START_TIME_MS
    this.phase = 'playing'
    this.paused = false
    this.rounds = this.buildRounds(this.questions)
    this.totalPairs = this.questions.length
    if (!this.rounds.length) {
      this.game.events.emit('mtc:phase', { phase: 'lose', payload: { reason: 'empty' } })
      return
    }
    this.roundIndex = 0
    this.loadRound(0)
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

  /**
   * 分组：一组最多 MAX_PAIRS_PER_ROUND 对（右侧因此最多两倍）；
   * 组数向上取整后再把题量平均分摊，避免出现「最后一组只剩 1 对」这种没有连线意义的情况
   */
  buildRounds(questions) {
    const total = questions.length
    if (!total) return []
    const roundCount = Math.ceil(total / MAX_PAIRS_PER_ROUND)
    const size = Math.ceil(total / roundCount)
    const rounds = []
    for (let i = 0; i < roundCount; i++) {
      const chunk = questions.slice(i * size, (i + 1) * size)
      if (chunk.length) rounds.push(chunk)
    }
    return rounds
  }

  // ---------------- 题目 → 配对卡片 ----------------

  /** 左卡片文案：优先知识点，无知识点时用题干 */
  conceptOf(q) {
    return String(q?.knowledgePoint || q?.questionText || '').trim()
  }

  /** 右卡片文案（正确解释）：正确选项文本；找不到正确项则取首个非空选项 */
  explanationOf(q) {
    const opts = Array.isArray(q?.options) ? q.options : []
    const hit = opts.find((o) => o && o.is_correct && String(o.text || '').trim())
    const fallback = opts.find((o) => o && String(o.text || '').trim())
    return String((hit || fallback)?.text || '').trim()
  }

  /** 该题所有可当混淆项的错误选项文本（排除与正确解释同文的） */
  wrongTextsOf(q) {
    const opts = Array.isArray(q?.options) ? q.options : []
    const correct = this.explanationOf(q)
    return opts
      .filter((o) => o && !o.is_correct)
      .map((o) => String(o.text || '').trim())
      .filter((t) => t && t !== correct)
  }

  /**
   * 混淆项文案：优先取本题自己的错误选项（就是原题的干扰答案，最具迷惑性）；
   * 本组内已作为正确解释出现过的文本不重用，免得同一句话既是答案又是混淆项；
   * 极端情况下该题没有可用错误选项时，借另一题的错误选项顶替，保证右侧仍是左侧的两倍
   * @param {Object} q 需要配一个混淆项的题目
   * @param {Array} round 本组题目
   */
  distractorOf(q, round) {
    const used = new Set(round.map((it) => this.explanationOf(it)))
    const own = this.wrongTextsOf(q).filter((t) => !used.has(t))
    if (own.length) return own[Math.floor(Math.random() * own.length)]
    for (const other of this.shuffle(this.questions)) {
      if (other === q) continue
      const cand = this.wrongTextsOf(other).filter((t) => !used.has(t))
      if (cand.length) return cand[Math.floor(Math.random() * cand.length)]
    }
    return ''
  }

  loadRound(i) {
    this.clearRound()
    const pairs = this.rounds[i] || []
    this.roundPairs = pairs
    // 左列：每题一个唯一 key，用于判定左右卡片是否来自同一道题
    const leftLay = sideLayout(pairs.length)
    this.leftCards = pairs.map((q, idx) =>
      this.mkCard('left', idx, this.conceptOf(q), idx, q, true, leftLay)
    )
    // 右列：每题给「1 个正确解释 + 1 个混淆项」，合并后整体打乱（张数是左列的两倍）
    const items = []
    pairs.forEach((q, idx) => {
      items.push({ pairKey: idx, q, text: this.explanationOf(q), isCorrect: true })
      const decoy = this.distractorOf(q, pairs)
      if (decoy) items.push({ pairKey: idx, q, text: decoy, isCorrect: false })
    })
    const rightLay = sideLayout(items.length)
    this.rightCards = this.shuffle(items).map((it, slot) =>
      this.mkCard('right', slot, it.text, it.pairKey, it.q, it.isCorrect, rightLay)
    )
    this.selectedLeft = null
    this.drag = null
    this.roundMatched = 0
    const decoyCount = items.length - pairs.length
    this.titleText.setText(
      `第 ${i + 1} / ${this.rounds.length} 组 · 本组 ${pairs.length} 对 · 右侧 ${items.length} 张含 ${decoyCount} 个混淆项 · 难度 ${'★'.repeat(
        this.roundDifficulty(pairs)
      )}`
    )
    this.drawLines()
    this.emitState()
  }

  roundDifficulty(pairs) {
    return pairs.reduce((max, q) => Math.max(max, Number(q?.difficulty) || 1), 1)
  }

  /**
   * 创建一张卡片：容器（左上角定位）+ 底板 + 文本 + 徽标
   * 卡片坐标统一为「左上角」（x=左边缘、y=顶边），底板/文本/徽标用容器内局部坐标，
   * 这样命中判定、连线锚点、抖动位移与文字排版才不会坐标系打架
   * @param {'left'|'right'} side 卡片所在列
   * @param {number} slot 该列内的位序（左列为序号、右列为字母）
   * @param {string} text 卡片文案
   * @param {number} pairKey 来源题目在本组内的下标（配对依据）
   * @param {Object} q 对应题目
   * @param {boolean} isCorrect 右侧卡片是否为该题的正确解释（混淆项为 false）
   * @param {{pitch:number,h:number,fontSize:number,lines:number}} lay 该列自适应排布
   */
  mkCard(side, slot, text, pairKey, q, isCorrect, lay) {
    const x = side === 'left' ? LEFT_X : RIGHT_X
    // 每张卡片在自己的行带内垂直居中
    const y = TOP_Y + slot * lay.pitch + (lay.pitch - lay.h) / 2
    const box = this.add.container(x, y).setDepth(3)
    const rect = this.add
      .rectangle(CARD_W / 2, lay.h / 2, CARD_W, lay.h, 0xffffff, 0.1)
      .setStrokeStyle(1, 0xffffff, 0.4)
    // 徽标（左侧序号 / 右侧字母）与文本同行，靠徽标一侧让出位置避免重叠
    const labelX = side === 'left' ? PAD + BADGE_W : PAD
    const wrapW = CARD_W - PAD * 2 - BADGE_W
    const perLine = Math.max(4, Math.floor(wrapW / lay.fontSize))
    const label = this.add
      .text(labelX, lay.h / 2, clip(text, perLine * lay.lines), {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: `${lay.fontSize}px`,
        color: '#ffffff',
        align: 'left',
        lineSpacing: 4
      })
      .setOrigin(0, 0.5)
    label.setWordWrapWidth(wrapW, true)
    label.setMaxLines(lay.lines)
    // 左列带序号、右列带字母；右列字母不代表题目，只用于描述连线
    const badge = this.add
      .text(
        side === 'left' ? PAD : CARD_W - PAD,
        BADGE_Y,
        side === 'left' ? String(slot + 1) : optionLabel(slot),
        {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '13px',
          color: '#7f8a9b'
        }
      )
      .setOrigin(side === 'left' ? 0 : 1, 0.5)
    box.add([rect, label, badge])
    return {
      side,
      slot,
      pairKey,
      isCorrect,
      q,
      fullText: text,
      box,
      rect,
      label,
      badge,
      matched: false,
      matchedWith: -1,
      excluded: false,
      x,
      y,
      h: lay.h,
      pitch: lay.pitch
    }
  }

  clearRound() {
    // 销毁容器会连带销毁底板/文本/徽标
    ;[...this.leftCards, ...this.rightCards].forEach((c) => c.box.destroy())
    this.leftCards = []
    this.rightCards = []
    this.roundPairs = []
    this.lineGfx.clear()
    this.tempGfx.clear()
  }

  // ---------------- 连线绘制 ----------------

  /** 卡片连线锚点：左卡片右边缘中点 / 右卡片左边缘中点 */
  anchorOf(card) {
    return card.side === 'left'
      ? { x: card.x + CARD_W, y: card.y + card.h / 2 }
      : { x: card.x, y: card.y + card.h / 2 }
  }

  /** 二次贝塞尔连线（控制点在中间通道，视觉上更柔和） */
  drawCurve(g, a, b, color, alpha, width, dashed) {
    const cx = (a.x + b.x) / 2
    const cy = (a.y + b.y) / 2
    g.lineStyle(width, color, alpha)
    const steps = 26
    let prevX = a.x
    let prevY = a.y
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const it = 1 - t
      const px = it * it * a.x + 2 * it * t * cx + t * t * b.x
      const py = it * it * a.y + 2 * it * t * cy + t * t * b.y
      // 虚线：按步数周期实/空交替
      if (!dashed || i % 2 === 1) g.lineBetween(prevX, prevY, px, py)
      prevX = px
      prevY = py
    }
    g.fillStyle(color, alpha)
    g.fillCircle(a.x, a.y, 4)
    g.fillCircle(b.x, b.y, 4)
  }

  drawLines() {
    this.lineGfx.clear()
    this.leftCards.forEach((lc) => {
      if (!lc.matched) return
      const rc = this.rightCards[lc.matchedWith]
      if (!rc) return
      this.drawCurve(this.lineGfx, this.anchorOf(lc), this.anchorOf(rc), 0x67c23a, 0.95, 3)
    })
  }

  // ---------------- 交互 ----------------

  cardAt(p) {
    const left = this.leftCards.find((c) => this.inCard(c, p))
    if (left) return { side: 'left', card: left }
    const right = this.rightCards.find((c) => this.inCard(c, p))
    if (right) return { side: 'right', card: right }
    return null
  }

  /** 指针是否落在卡片矩形内（卡片坐标为左上角，高度随该列张数自适应） */
  inCard(card, p) {
    return p.x >= card.x && p.x <= card.x + CARD_W && p.y >= card.y && p.y <= card.y + card.h
  }

  onDown(p) {
    if (this.phase !== 'playing' || this.paused) return
    const found = this.cardAt(p)
    if (!found) {
      this.setSelected(null)
      return
    }
    if (found.card.matched || found.card.excluded) return
    if (found.side === 'left') {
      // 既作为点选起点，也允许直接拖到右侧
      const idx = this.leftCards.indexOf(found.card)
      this.setSelected(idx)
      this.drag = { side: 'left', idx, sx: p.x, sy: p.y }
      return
    }
    // 已选中左侧：点右侧直接配对（点选优先于从右侧起手拖拽）
    if (this.selectedLeft != null) {
      this.tryMatch(this.selectedLeft, this.rightCards.indexOf(found.card))
      return
    }
    // 从右侧解释卡起手，拖到左侧概念卡同样可以配对
    this.drag = { side: 'right', idx: this.rightCards.indexOf(found.card), sx: p.x, sy: p.y }
  }

  onMove(p) {
    if (!this.drag) return
    const src = this.dragCard()
    if (!src) return
    this.tempGfx.clear()
    this.drawCurve(this.tempGfx, this.anchorOf(src), { x: p.x, y: p.y }, 0xffd36b, 0.9, 3, true)
  }

  onUp(p) {
    if (!this.drag) return
    const { side, idx, sx, sy } = this.drag
    this.drag = null
    this.tempGfx.clear()
    // 位移很小视为点选：左侧起手保留高亮，等待点击右侧
    if (Math.hypot(p.x - sx, p.y - sy) < DRAG_MIN) return
    const target = this.dropTarget(side, p)
    if (!target) return
    if (side === 'left') this.tryMatch(idx, target.idx)
    else this.tryMatch(target.idx, idx)
  }

  /** 画布外松手：取消当前拖拽 */
  onUpOutside() {
    this.drag = null
    this.tempGfx.clear()
  }

  /** 当前拖拽中的源卡片 */
  dragCard() {
    if (!this.drag) return null
    return this.drag.side === 'left'
      ? this.leftCards[this.drag.idx]
      : this.rightCards[this.drag.idx]
  }

  /**
   * 松手时找对侧目标卡片：先精确命中，命不中再按「同一水平带内最近的一张」兜底，
   * 避免差几像素、或拖到卡片边缘就配不上
   * @param {'left'|'right'} fromSide 拖拽起点在哪一列
   * @param {Object} p 松手时的指针
   */
  dropTarget(fromSide, p) {
    // 已锁定或已被排除的卡片不能作为落点
    const isDead = (c) => c.matched || c.excluded
    const toLeft = fromSide === 'right'
    const cards = toLeft ? this.leftCards : this.rightCards
    const hit = cards.findIndex((c) => this.inCard(c, p))
    if (hit >= 0) return isDead(cards[hit]) ? null : { idx: hit }
    // 横向需落在对侧列的大致范围内
    const inColumn = toLeft ? p.x <= LEFT_X + CARD_W + 40 : p.x >= RIGHT_X - 40
    if (!inColumn) return null
    let best = null
    cards.forEach((c, i) => {
      const d = Math.abs(p.y - (c.y + c.h / 2))
      if (!best || d < best.d) best = { idx: i, d, card: c }
    })
    if (!best || best.d > best.card.h / 2 + best.card.pitch / 2 || isDead(best.card)) return null
    return { idx: best.idx }
  }

  setSelected(idx) {
    this.selectedLeft = idx
    this.leftCards.forEach((c, i) => this.styleCard(c, i === idx && !c.matched))
  }

  styleCard(card, selected) {
    if (card.matched) {
      card.rect.setFillStyle(0x67c23a, 0.18).setStrokeStyle(2, 0x67c23a, 0.9)
      return
    }
    if (selected) {
      card.rect.setFillStyle(0x0071fe, 0.28).setStrokeStyle(3, 0xffd36b, 1)
      return
    }
    card.rect.setFillStyle(0xffffff, 0.1).setStrokeStyle(1, 0xffffff, 0.4)
  }

  // ---------------- 配对判定 ----------------

  tryMatch(leftIndex, rightIndex) {
    const lc = this.leftCards[leftIndex]
    const rc = this.rightCards[rightIndex]
    if (!lc || !rc || lc.matched || rc.matched || rc.excluded) return
    // 只有「同题 + 正确解释」才算配对成功；连到本题的混淆项或其他题的解释都算错
    if (rc.isCorrect && lc.pairKey === rc.pairKey) {
      this.onPairCorrect(lc, rc)
      return
    }
    this.onPairWrong(lc, rc)
  }

  onPairCorrect(lc, rc) {
    lc.matched = true
    rc.matched = true
    lc.matchedWith = this.rightCards.indexOf(rc)
    rc.matchedWith = this.leftCards.indexOf(lc)
    this.styleCard(lc, false)
    this.styleCard(rc, false)
    this.selectedLeft = null
    this.drawLines()

    const q = lc.q
    const timeLimit = q?.gameplayPayload?.settings?.time_limit ?? 15
    this.timeLeftMs += Math.max(0, Number(timeLimit) || 0) * 1000
    this.score += (Number(q?.difficulty) || 3) * 50
    this.matchedTotal += 1
    this.roundMatched += 1
    this.emitAnswer(q, true, '')
    this.emitState()

    // 本组全部配对完成 → 短暂提示后进入下一组 / 结算
    if (this.roundMatched >= this.leftCards.length) {
      this.paused = true
      // 右侧剩下的都是没被连到的混淆项，统一划掉标记后随本组一起结束
      this.rightCards.forEach((c) => {
        if (!c.matched && !c.excluded) this.excludeCard(c)
      })
      const tip = this.add
        .text(W / 2, H / 2, '本组完成 ✓', {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '38px',
          color: '#67c23a',
          fontStyle: 'bold'
        })
        .setOrigin(0.5)
        .setDepth(6)
      this.tweens.add({
        targets: tip,
        alpha: 0,
        scale: 1.2,
        duration: 700,
        onComplete: () => tip.destroy()
      })
      this.time.delayedCall(720, () => {
        this.paused = false
        if (this.phase !== 'playing') return
        if (this.roundIndex >= this.rounds.length - 1) {
          this.win()
        } else {
          this.roundIndex += 1
          this.loadRound(this.roundIndex)
        }
      })
      return
    }
    // 配对正确不展示解析，直接继续下一对
    this.setSelected(null)
  }

  onPairWrong(lc, rc) {
    // 红色虚线闪烁后消失，提示这次连线不成立
    const fx = this.add.graphics().setDepth(5)
    this.drawCurve(fx, this.anchorOf(lc), this.anchorOf(rc), 0xd64545, 1, 3, true)
    this.tweens.add({ targets: fx, alpha: 0, duration: 500, onComplete: () => fx.destroy() })
    this.shakeCard(lc)
    this.shakeCard(rc)
    this.cameras.main.shake(160, 0.006)
    // 记录本次答错：错选项文本 = 被连上的卡片全文（非截断文本）
    this.emitAnswer(lc.q, false, rc.fullText)
    // 连到混淆项：把它划掉永久排除，玩家可靠此收敛剩下的选项
    // （连到其他题的正确解释则保留，否则那道题就没法配对了）
    if (!rc.isCorrect) this.excludeCard(rc)
    if (this.mode === 'endless') {
      this.lives -= 1
      this.emitState()
      if (this.lives <= 0) {
        this.lose('lives')
        return
      }
    } else {
      this.timeLeftMs -= WRONG_PENALTY_MS
      if (this.timeLeftMs <= 0) {
        this.timeLeftMs = 0
        this.lose('time')
        return
      }
    }
    this.setSelected(null)
  }

  /**
   * 把一张混淆项卡片标为已排除：置灰 + 画删除线，并不再参与命中判定
   * （删除线用容器局部坐标 + origin(0,0.5)，与底板同一套坐标语义）
   */
  excludeCard(card) {
    card.excluded = true
    card.box.setAlpha(0.34)
    card.rect.setFillStyle(0x3a3f4a, 0.35).setStrokeStyle(1, 0xd64545, 0.5)
    const strike = this.add
      .rectangle(PAD, card.h / 2, CARD_W - PAD * 2, 2, 0xd64545, 0.85)
      .setOrigin(0, 0.5)
    card.box.add(strike)
  }

  shakeCard(card) {
    // 整张卡片（容器）一起抖，避免底板与文字被拆开到不同位置
    this.tweens.add({
      targets: card.box,
      x: { from: card.x - 8, to: card.x + 8 },
      duration: 60,
      repeat: 3,
      yoyo: true,
      onComplete: () => card.box.setX(card.x)
    })
  }

  // ---------------- 结算 ----------------

  win() {
    this.paused = true
    this.phase = 'over'
    this.game.events.emit('mtc:phase', {
      phase: 'win',
      payload: {
        mode: this.mode,
        score: this.score,
        passed: this.matchedTotal,
        total: this.totalPairs,
        timeLeft: Math.ceil(this.timeLeftMs / 1000)
      }
    })
  }

  lose(reason) {
    this.paused = true
    this.phase = 'over'
    this.game.events.emit('mtc:phase', {
      phase: 'lose',
      payload: {
        mode: this.mode,
        reason,
        score: this.score,
        passed: this.matchedTotal,
        total: this.totalPairs,
        timeLeft: Math.ceil(Math.max(0, this.timeLeftMs) / 1000)
      }
    })
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
    this.emitAcc += delta
    if (this.emitAcc >= 200) {
      this.emitAcc = 0
      this.emitState()
    }
  }

  /**
   * 向渲染层上报一次配对作答（供 Vue 调 window.api 入库 game_history / 错题本）
   * 字段与弹珠打靶保持一致，额外带 gameType 区分玩法
   * @param {Object} q 本次涉及的题目（左卡片对应题）
   * @param {boolean} correct 是否配对正确
   * @param {string} [chosenText] 答错时连到的解释文本
   */
  emitAnswer(q, correct, chosenText) {
    if (!q) return
    this.game.events.emit('mtc:answer', {
      gameType: 'match',
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
    const pairs = this.roundPairs || []
    this.game.events.emit('mtc:state', {
      mode: this.mode,
      gameType: 'match',
      matched: this.matchedTotal,
      total: this.totalPairs,
      round: this.roundIndex + 1,
      rounds: this.rounds.length,
      difficulty: pairs.length ? this.roundDifficulty(pairs) : null,
      timeLeft: Math.ceil(Math.max(0, this.timeLeftMs) / 1000),
      lives: this.mode === 'endless' ? this.lives : null,
      score: this.score
    })
  }
}

export { W, H }
