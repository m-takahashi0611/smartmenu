#!/usr/bin/env python3
"""
4択 → 5択修正スクリプト
変更内容:
1. 4択テキストに「5️⃣ 今日の食事として記録する」を追加
2. クイックリプライに「📝 今日の食事として記録する」ボタンを追加
3. 「案内を終了する」処理を「実食記録ヒアリング」から「終了メッセージ表示」に変更
4. 「5」または「今日の食事として記録する」で選んだ料理を即記録して終了
5. 「それ以外」再表示テキストも5択に更新
"""

with open('server/routers/line.ts', 'r') as f:
    content = f.read()

# ── 1. 4択テキスト → 5択テキスト（全箇所） ──────────────────────────────────

OLD_4CHOICE_TEXT = "1️⃣ レシピを表示する\n2️⃣ 違う献立を選び直す\n3️⃣ 案内を終了する\n4️⃣ 献立をやり直す（新しく生成）"
NEW_5CHOICE_TEXT = "1️⃣ レシピを表示する\n2️⃣ 違う献立を選び直す\n3️⃣ 案内を終了する\n4️⃣ 献立をやり直す（新しく生成）\n5️⃣ 今日の食事として記録する"

content = content.replace(OLD_4CHOICE_TEXT, NEW_5CHOICE_TEXT)

# ── 2. クイックリプライボタン（4択）→ 5択 ──────────────────────────────────
# 「✅ 案内を終了する」の後に「📝 今日の食事として記録する」ボタンを追加
# パターンA: label: '✅ 案内を終了する', text: '案内を終了する' } },\n            { type: 'action', action: { type: 'message', label: '🎲 献立をやり直す'
OLD_QR_A = "{ type: 'action', action: { type: 'message', label: '✅ 案内を終了する', text: '案内を終了する' } },\n            { type: 'action', action: { type: 'message', label: '🎲 献立をやり直す', text: '献立をやり直す' } },"
NEW_QR_A = "{ type: 'action', action: { type: 'message', label: '✅ 案内を終了する', text: '案内を終了する' } },\n            { type: 'action', action: { type: 'message', label: '🎲 献立をやり直す', text: '献立をやり直す' } },\n            { type: 'action', action: { type: 'message', label: '📝 今日の食事として記録', text: '今日の食事として記録する' } },"
content = content.replace(OLD_QR_A, NEW_QR_A)

# パターンB（インデント2スペース違い）
OLD_QR_B = "{ type: 'action', action: { type: 'message', label: '✅ 案内を終了する', text: '案内を終了する' } },\n          { type: 'action', action: { type: 'message', label: '🎲 献立をやり直す', text: '献立をやり直す' } },"
NEW_QR_B = "{ type: 'action', action: { type: 'message', label: '✅ 案内を終了する', text: '案内を終了する' } },\n          { type: 'action', action: { type: 'message', label: '🎲 献立をやり直す', text: '献立をやり直す' } },\n          { type: 'action', action: { type: 'message', label: '📝 今日の食事として記録', text: '今日の食事として記録する' } },"
content = content.replace(OLD_QR_B, NEW_QR_B)

# パターンC（レシピ表示後の再表示用）
OLD_QR_C = "{ type: 'action', action: { type: 'message', label: '✅ 案内を終了する', text: '案内を終了する' } },\n      { type: 'action', action: { type: 'message', label: '🎲 献立をやり直す', text: '献立をやり直す' } },"
NEW_QR_C = "{ type: 'action', action: { type: 'message', label: '✅ 案内を終了する', text: '案内を終了する' } },\n      { type: 'action', action: { type: 'message', label: '🎲 献立をやり直す', text: '献立をやり直す' } },\n      { type: 'action', action: { type: 'message', label: '📝 今日の食事として記録', text: '今日の食事として記録する' } },"
content = content.replace(OLD_QR_C, NEW_QR_C)

# ── 3. 「それ以外」再表示テキストも5択に更新 ──────────────────────────────────
OLD_RESHOW = "1か2か3で選んでください😊\n\n1️⃣ レシピを表示する\n2️⃣ 違う献立を選び直す\n3️⃣ 案内を終了する\n4️⃣ 献立をやり直す（新しく生成）"
NEW_RESHOW = "1〜5の番号で選んでください😊\n\n1️⃣ レシピを表示する\n2️⃣ 違う献立を選び直す\n3️⃣ 案内を終了する\n4️⃣ 献立をやり直す（新しく生成）\n5️⃣ 今日の食事として記録する"
content = content.replace(OLD_RESHOW, NEW_RESHOW)

# 再表示のQRにも5択ボタンを追加
OLD_RESHOW_QR = """{ type: 'action', action: { type: 'message', label: '✅ 案内を終了する', text: '案内を終了する' } },
      { type: 'action', action: { type: 'message', label: '🎲 献立をやり直す', text: '献立をやり直す' } },
      { type: 'action', action: { type: 'message', label: '❌ やっぱりやめる', text: 'キャンセル' } },"""
NEW_RESHOW_QR = """{ type: 'action', action: { type: 'message', label: '✅ 案内を終了する', text: '案内を終了する' } },
      { type: 'action', action: { type: 'message', label: '🎲 献立をやり直す', text: '献立をやり直す' } },
      { type: 'action', action: { type: 'message', label: '📝 今日の食事として記録', text: '今日の食事として記録する' } },
      { type: 'action', action: { type: 'message', label: '❌ やっぱりやめる', text: 'キャンセル' } },"""
content = content.replace(OLD_RESHOW_QR, NEW_RESHOW_QR)

# ── 4. 「案内を終了する」処理を変更（実食記録ヒアリング → 終了メッセージ） ──────────────────────────────────
OLD_END_HANDLER = """    // 　13」または「案内を終了する」→ 実食記録を聴く
    if (/^[3３]$/.test(trimmed) || trimmed === '案内を終了する') {
      // 実食記録ヘアリングペンディングに移行
      const mealLabel = mealType === 'dinner' ? '夕食' : mealType === 'lunch' ? '昼食' : '朝食';
      await setLineUserPendingAction(lineUserId, {
        type: 'actual_meal_hearing',
        selectedName,
        options,
        mealType,
        targetDate,
        menuPlanId,
        askedAt: Date.now(),
      });
      const actualQR = [
        ...options.slice(0, 3).map((o) => ({
          type: 'action' as const,
          action: { type: 'message' as const, label: o.name.slice(0, 20), text: `作った：${o.name}` },
        })),
        { type: 'action' as const, action: { type: 'message' as const, label: '🍽️ 別の料理にした', text: '別の料理にした' } },
        { type: 'action' as const, action: { type: 'message' as const, label: '🏢 外食した', text: '外食した' } },
        { type: 'action' as const, action: { type: 'message' as const, label: '🚫 食べてない', text: '食べてない' } },
        { type: 'action' as const, action: { type: 'message' as const, label: '⏭️ あとで教える', text: 'あとで教える' } },
      ];
      await replyLineMessage(replyToken, [{
        type: 'text',
        text: `お疲れさまでした！😊
${mealLabel}は何を作りましたか？
毎日の記録が積み重なると、よりあなた好みに合った献立を提案できるようになります！💪`,
        quickReply: { items: actualQR },
      }], lineUserId);
      return true;
    }"""

NEW_END_HANDLER = """    // 「3」または「案内を終了する」→ 終了メッセージ
    if (/^[3３]$/.test(trimmed) || trimmed === '案内を終了する') {
      await setLineUserPendingAction(lineUserId, null);
      const encouragements = [
        '今日も美味しいご飯が食べられますように🍽️',
        '素敵な食卓になりますように✨',
        '今日も一日、お疲れさまです！ゆっくり食事を楽しんでくださいね🌸',
        '美味しいものを食べて、元気いっぱいで過ごしてくださいね💫',
        '今日の食事が、明日への活力になりますように🌟',
      ];
      const encouragement = encouragements[Math.floor(Math.random() * encouragements.length)];
      await replyLineMessage(replyToken, [{
        type: 'text',
        text: `お疲れさまでした！😊\\n\\n毎日の記録が積み重なると、よりあなた好みに合った献立を提案できるようになります！💪\\n\\n${encouragement}`,
      }], lineUserId);
      return true;
    }
    // 「5」または「今日の食事として記録する」→ 選んだ料理を即記録して終了
    if (/^[5５]$/.test(trimmed) || trimmed === '今日の食事として記録する') {
      await setLineUserPendingAction(lineUserId, null);
      // 選んだ料理名を「作った」として記録
      try {
        const { updateMenuPlanActualStatus } = await import('../db');
        await updateMenuPlanActualStatus(menuPlanId, mealType, 'cooked', selectedName);
      } catch (e) {
        console.error('[LINE] 実食記録失敗:', e);
      }
      const encouragements = [
        '今日も美味しいご飯が食べられますように🍽️',
        '素敵な食卓になりますように✨',
        '今日も一日、お疲れさまです！ゆっくり食事を楽しんでくださいね🌸',
        '美味しいものを食べて、元気いっぱいで過ごしてくださいね💫',
        '今日の食事が、明日への活力になりますように🌟',
      ];
      const encouragement = encouragements[Math.floor(Math.random() * encouragements.length)];
      await replyLineMessage(replyToken, [{
        type: 'text',
        text: `「${selectedName}」を今日の食事として記録しました！✅\\n\\nお疲れさまでした！😊\\n毎日の記録が積み重なると、よりあなた好みに合った献立を提案できるようになります！💪\\n\\n${encouragement}\\n\\n※記録の修正はダッシュボードの「履歴」からできます`,
      }], lineUserId);
      return true;
    }"""

content = content.replace(OLD_END_HANDLER, NEW_END_HANDLER)

with open('server/routers/line.ts', 'w') as f:
    f.write(content)

print("修正完了")

# 変更箇所の確認
import subprocess
result = subprocess.run(['grep', '-n', '今日の食事として記録', 'server/routers/line.ts'], capture_output=True, text=True)
print("追加された行:")
print(result.stdout)
