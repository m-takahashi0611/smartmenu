#!/usr/bin/env python3
"""
「案内を終了する」ハンドラーを修正するスクリプト
- 「3」選択時：終了メッセージのみ（実食記録を聞わない）
- 「5」選択時：selectedNameを「作った」として即記録して終了
"""

with open('server/routers/line.ts', 'r') as f:
    content = f.read()

# 修正対象のコードブロック（1834-1864行目）
old_code = '''    // 　13」または「案内を終了する」→ 実食記録を聴く
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
    }'''

new_code = '''    // 「3」または「案内を終了する」→ 終了メッセージのみ（実食記録を聞わない）
    if (/^[3３]$/.test(trimmed) || trimmed === '案内を終了する') {
      await setLineUserPendingAction(lineUserId, null);
      const encourageMessages = [
        '今日もお疲れさまでした！🌸',
        '毎日の献立、一緒に楽しみましょう！🥗',
        '今日も素敵な食卓になりますように！✨',
        '明日もまた一緒に考えましょう！🍱',
        '毎日の積み重ねが大切です！💪',
      ];
      const randomEncourage = encourageMessages[Math.floor(Math.random() * encourageMessages.length)];
      await replyLineMessage(replyToken, [{
        type: 'text',
        text: `お疲れさまでした！😊\n\n毎日の記録が積み重なると、よりあなた好みに合った献立を提案できるようになります！💪\n\n${randomEncourage}`,
      }], lineUserId);
      return true;
    }
    // 「5」または「今日の食事として記録する」→ selectedNameを「作った」として即記録して終了
    if (/^[5５]$/.test(trimmed) || trimmed === '今日の食事として記録する') {
      await setLineUserPendingAction(lineUserId, null);
      try {
        if (menuPlanId) {
          await updateActualMeal(menuPlanId, { mealType: mealType as 'breakfast' | 'lunch' | 'dinner', actualMeal: selectedName, actualStatus: 'cooked' });
        }
      } catch (err) {
        console.error('[LINE] Failed to record actual meal:', err);
      }
      const encourageMessages2 = [
        '今日もお疲れさまでした！🌸',
        '毎日の献立、一緒に楽しみましょう！🥗',
        '今日も素敵な食卓になりますように！✨',
        '明日もまた一緒に考えましょう！🍱',
        '毎日の積み重ねが大切です！💪',
      ];
      const randomEncourage2 = encourageMessages2[Math.floor(Math.random() * encourageMessages2.length)];
      await replyLineMessage(replyToken, [{
        type: 'text',
        text: `「${selectedName}」を今日の食事として記録しました！✅\n\nお疲れさまでした！😊\n毎日の記録が積み重なると、よりあなた好みに合った献立を提案できるようになります！💪\n\n${randomEncourage2}\n\n※記録の修正はダッシュボードの「履歴」からできます`,
      }], lineUserId);
      return true;
    }'''

if old_code in content:
    content = content.replace(old_code, new_code, 1)
    with open('server/routers/line.ts', 'w') as f:
        f.write(content)
    print('修正成功！')
else:
    print('修正対象のコードが見つかりませんでした')
    # 部分一致を確認
    if '// 　13」または「案内を終了する」→ 実食記録を聴く' in content:
        print('コメント行は見つかりました（改行コードが違う可能性）')
    else:
        print('コメント行も見つかりませんでした')
