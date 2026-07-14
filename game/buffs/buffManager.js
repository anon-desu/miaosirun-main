/**
 * buffs/buffManager.js
 * 独立的肉鸽奖励系统，全面加强了攻击力相关的 Buff（数值及选择流程已优化）
 */

const BuffSystem = (() => {
  // --- 【数值重大加强】大幅提升输出系 Buff 属性，以便玩家畅快应对后期超高血量的 Boss ---
  const allBuffs =[
    {
      id: 'dmg_up',
      name: '⚙️ 动能强化',
      desc: '基础点击伤害大幅提升（+3）', // 每次选择+3，叠加上去后输出翻数倍，极其可观
      apply: (game) => game.stats.clickDamage += 3
    },
    {
      id: 'combo_blade',
      name: '⚔️ 连击之刃',
      desc: '每保持 8 次连击，额外附加 1 点真实伤害（连击数越高，后期伤害无上限）', // 折合频率从10调整至8
      apply: (game) => game.stats.comboDamage = true
    },
    {
      id: 'execute',
      name: '☠️ 弱点击破',
      desc: 'Boss 生命值低于 30% 时，下一次攻击直接将其秒杀', // 斩杀线由 15% 大幅上调至 30%
      apply: (game) => game.stats.execute += 0.30
    },
    {
      id: 'time_slow',
      name: '⏳ 时间沼泽',
      desc: '当前怪物移动速度降低 15%，难度递增速度减慢 25%',
      apply: (game) => {
        game._speedMultiplier = Math.max(1.0, game._speedMultiplier * 0.85); 
        game.stats.slowResist *= 0.75; 
      }
    },
    {
      id: 'heal_max_hp',
      name: '❤️ 纳米修复',
      desc: '恢复所有生命值，并且最大生命值上限 +2', // 最大血量加成从 +1 提升至 +2
      apply: (game) => {
        game.player.maxHp += 2;
        game.player.hp = game.player.maxHp;
      }
    },
    {
      id: 'score_bonus',
      name: '💎 赏金猎人',
      desc: '击杀普通怪物获得的分数翻倍（乘数 +1.0）', 
      apply: (game) => game.stats.scoreMultiplier += 1.0
    },
    {
      id: 'shield_gen',
      name: '🛡️ 电子护盾',
      desc: '获得 1 层护盾，此后每 25 秒自动生成一层，可完美抵挡一次失误漏怪的伤害', // 护盾冷却从 40 秒缩短至 25 秒
      apply: (game) => {
        game.stats.shield += 1;
        game.stats.hasShieldRegen = true;
      }
    },
    {
      id: 'chain_lightning',
      name: '⚡ 闪电链',
      desc: '击杀小怪时，有 35% 概率释放闪电，自动秒杀同泳道的另一只小怪', // 触发概率从 20% 提高至 35%
      apply: (game) => game.stats.chainLightning += 0.35
    },
    {
      id: 'magnetic_field',
      name: '🌀 磁力场',
      desc: '大幅增加武器物理判定距离 50px，即使怪物还很远也能轻松击杀', // 距离从 30px 上调至 50px
      apply: (game) => game.stats.hitRangeBonus += 50 
    },
    {
      id: 'frenzy_state',
      name: '🔥 狂热状态',
      desc: '当连击数超过 20 后进入狂热，对 Boss 每次点击伤害额外 +5', // 连击门槛降至 20 连，伤害加成升至 +5
      apply: (game) => game.stats.frenzy = true
    },
    {
      id: 'critical_strike',
      name: '🎲 致命暴击',
      desc: '攻击 Boss 时有 30% 概率触发致命一击，造成 3.5 倍极限伤害', // 概率升至 30%，伤害乘数升至 3.5 倍
      apply: (game) => game.stats.critChance += 0.30
    }
  ];

  let activeBuffs =[]; // 记录本局已获得的 buff

  // 展示 Buff 界面并加入高亮选中及确认选择（二次确认）流程
  function showRandomBuffs(game, onSelectCallback) {
    const shuffled =[...allBuffs].sort(() => 0.5 - Math.random());
    const choices = shuffled.slice(0, 3);

    const modal = document.getElementById('buff-modal');
    const container = modal.querySelector('.buff-container');
    const cardsContainer = document.getElementById('buff-cards');
    
    // 清空原有的卡牌区域
    cardsContainer.innerHTML = ''; 

    // 检测或创建底部二次确认按钮区域
    let confirmArea = document.getElementById('buff-confirm-area');
    if (!confirmArea) {
      confirmArea = document.createElement('div');
      confirmArea.id = 'buff-confirm-area';
      confirmArea.style.cssText = `
        margin-top: 25px;
        display: flex;
        justify-content: center;
        gap: 15px;
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none;
      `;
      container.appendChild(confirmArea);
    }

    // 填充确认选择按钮
    confirmArea.innerHTML = `
      <button id="btn-buff-confirm" style="
        background: linear-gradient(135deg, #00f0ff, #0072ff);
        color: #fff;
        border: none;
        padding: 10px 35px;
        font-size: 16px;
        font-weight: bold;
        border-radius: 6px;
        cursor: pointer;
        box-shadow: 0 0 15px rgba(0,240,255,0.4);
        transition: all 0.2s ease;
      ">确认选择</button>
    `;

    const btnConfirm = document.getElementById('btn-buff-confirm');
    confirmArea.style.opacity = '0';
    confirmArea.style.pointerEvents = 'none';

    let selectedBuff = null;
    let selectedCardElement = null;

    choices.forEach(buff => {
      const card = document.createElement('div');
      card.className = 'buff-card';
      // 赋予基础样式与柔和边框，预留高亮改变空间
      card.style.cssText = `
        border: 1px solid rgba(0,240,255,0.2);
        border-radius: 8px;
        padding: 15px;
        background: rgba(10, 10, 20, 0.85);
        cursor: pointer;
        transition: all 0.25s ease;
      `;
      card.innerHTML = `
        <h3 style="margin-top: 0; color: #00f0ff; font-size: 1.1rem;">${buff.name}</h3>
        <p style="color: #e8e8ff; font-size: 0.9rem; margin-bottom: 0; line-height: 1.4;">${buff.desc}</p>
      `;

      card.onclick = () => {
        // 重置前一个被选中卡牌的视觉状态
        if (selectedCardElement) {
          selectedCardElement.style.border = '1px solid rgba(0,240,255,0.2)';
          selectedCardElement.style.boxShadow = 'none';
          selectedCardElement.style.transform = 'scale(1)';
          selectedCardElement.style.background = 'rgba(10, 10, 20, 0.85)';
        }

        // 高亮当前选中的卡牌
        selectedBuff = buff;
        selectedCardElement = card;
        card.style.border = '2px solid #ffd700';
        card.style.boxShadow = '0 0 15px rgba(255, 215, 0, 0.4)';
        card.style.transform = 'scale(1.04)';
        card.style.background = 'rgba(255, 215, 0, 0.05)';

        // 显现“确认选择”按钮并开启点击
        confirmArea.style.opacity = '1';
        confirmArea.style.pointerEvents = 'auto';
      };

      cardsContainer.appendChild(card);
    });

    // 确认选择按钮的最终回调事件
    btnConfirm.onclick = () => {
      if (selectedBuff) {
        selectedBuff.apply(game);
        activeBuffs.push(selectedBuff.id);
        modal.classList.remove('active');
        
        // 重置二次确认状态，防止下次打开时保留
        confirmArea.style.opacity = '0';
        confirmArea.style.pointerEvents = 'none';
        
        onSelectCallback(); 
      }
    };

    modal.classList.add('active'); 
  }

  function reset() {
    activeBuffs =[];
  }

  return { showRandomBuffs, reset };
})();
