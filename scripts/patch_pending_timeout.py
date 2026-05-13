#!/usr/bin/env python3
"""
pendingActionのタイムアウトチェックと再トリガー時クイックリプライを実装するパッチスクリプト
"""
import re

with open('server/routers/line.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# ─────────────────────────────────────────────────────────────────────────────
# 1. pending取得直後にタイムアウトチェックを追加
# ─────────────────────────────────────────────────────────────────────────────
OLD_PENDING_FETCH = '  const pending = await getLineUserPendingAction(lineUserId);\n'
NEW_PENDING_FETCH = '''  const pending = await getLineUserPendingAction(lineUserId);

  // ─── pendingActionタイムアウトチェック ──────────────────────────────────────────
  if (pending && isPendingExpired(pending)) {
    await setLineUserPendingAction(lineUserId, null);
    await replyLineMessage(replyToken, [{
      type: 'text',
      text: '⏰ しばらく操作がなかったのでリセットしました。\\nもう一度最初からお試しください！',
    }], lineUserId);
    return true;
  }

'''

if OLD_PENDING_FETCH in content:
    content = content.replace(OLD_PENDING_FETCH, NEW_PENDING_FETCH, 1)
    print('✅ 1. タイムアウトチェックを追加しました')
else:
    print('❌ 1. タイムアウトチェック挿入位置が見つかりません')

# ─────────────────────────────────────────────────────────────────────────────
# 2. voice_confirm中に「その他の入力」が来た場合の処理を変更
#    現状: 新しいtranscribedTextとして上書きして再確認
#    変更後: 献立キーワードなら3択クイックリプライ、それ以外は上書き再確認
# ─────────────────────────────────────────────────────────────────────────────
OLD_VOICE_CONFIRM_FALLTHROUGH = '''    // その他の入力→新しいテキストとして上書きして再確認
    // 例：音声復唱中に「献立！」と返してきた場合、「献立！」を新しいtranscribedTextとして再確認
    await setLineUserPendingAction(lineUserId, {
      type: 'voice_confirm',
      transcribedText: trimmed,
    });
    await replyLineMessage(replyToken, [{
      type: 'text',
      text: `「${trimmed}」でよろしいでしょうか？
「はい」→ そのまま処理します
「いいえ」→ キャンセルします`,
    }], lineUserId);
    return true;
  }'''

NEW_VOICE_CONFIRM_FALLTHROUGH = '''    // その他の入力→献立キーワードなら3択クイックリプライ、それ以外は上書き再確認
    const _voiceMenuKw = /^(献立|今日の献立|今夜の献立|明日の献立|献立を|献立お願い|献立提案|献立して|献立考えて|ご飯作って|ご飯提案|おすすめ献立)$/.test(trimmed)
      || /今日何(作|つく)ろ/.test(trimmed) || /ご飯(何|なに)(作|つく)/.test(trimmed) || /今日のご飯/.test(trimmed);
    if (_voiceMenuKw) {
      // 献立キーワード → 3択クイックリプライ（pendingは維持）
      await replyLineMessage(replyToken, [{
        type: 'text',
        text: `音声入力の確認中ですが、「${trimmed}」が届きました😊\\n\\nどうしますか？`,
        quickReply: buildRetriggerQuickReply(),
      }], lineUserId);
      return true;
    }
    // 例：音声復唱中に別のテキストを返してきた場合、新しいtranscribedTextとして上書きして再確認
    await setLineUserPendingAction(lineUserId, {
      type: 'voice_confirm',
      transcribedText: trimmed,
      askedAt: Date.now(),
    });
    await replyLineMessage(replyToken, [{
      type: 'text',
      text: `「${trimmed}」でよろしいでしょうか？\\n「はい」→ そのまま処理します\\n「いいえ」→ キャンセルします`,
    }], lineUserId);
    return true;
  }'''

if OLD_VOICE_CONFIRM_FALLTHROUGH in content:
    content = content.replace(OLD_VOICE_CONFIRM_FALLTHROUGH, NEW_VOICE_CONFIRM_FALLTHROUGH, 1)
    print('✅ 2. voice_confirm再トリガー処理を変更しました')
else:
    print('❌ 2. voice_confirm再トリガー処理の挿入位置が見つかりません')
    # デバッグ用：前後を確認
    idx = content.find('その他の入力→新しいテキストとして上書きして再確認')
    if idx >= 0:
        print(f'   候補位置: {idx}')
        print(repr(content[idx:idx+200]))

# ─────────────────────────────────────────────────────────────────────────────
# 3. fridge_input_wait中に献立キーワードが来た場合の3択処理を追加
# ─────────────────────────────────────────────────────────────────────────────
OLD_FRIDGE_INPUT_WAIT = '''  if (pending?.type === 'fridge_input_wait') {
    await setLineUserPendingAction(lineUserId, null);
    // 次のメッセージを食材リストとして処理（再帰的にhandleFridgeRegistrationを呼ぶ）
    // 「を追加して」「追加して」が付いていない場合も食材リストとして扱う
    const fridgeText = text.trim();
    if (/^(キャンセル|やめる|やめて|cancel|いいえ)$/i.test(fridgeText)) {
      await replyLineMessage(replyToken, [{ type: 'text', text: 'キャンセルしました。' }], lineUserId);
      return true;
    }'''

NEW_FRIDGE_INPUT_WAIT = '''  if (pending?.type === 'fridge_input_wait') {
    // 次のメッセージを食材リストとして処理（再帰的にhandleFridgeRegistrationを呼ぶ）
    // 「を追加して」「追加して」が付いていない場合も食材リストとして扱う
    const fridgeText = text.trim();
    if (/^(キャンセル|やめる|やめて|cancel|いいえ)$/i.test(fridgeText)) {
      await setLineUserPendingAction(lineUserId, null);
      await replyLineMessage(replyToken, [{ type: 'text', text: 'キャンセルしました。' }], lineUserId);
      return true;
    }
    // 献立キーワード → 3択クイックリプライ（pendingは維持）
    const _fridgeWaitMenuKw = /^(献立|今日の献立|今夜の献立|明日の献立|献立を|献立お願い|献立提案|献立して|献立考えて|ご飯作って|ご飯提案|おすすめ献立)$/.test(fridgeText)
      || /今日何(作|つく)ろ/.test(fridgeText) || /ご飯(何|なに)(作|つく)/.test(fridgeText) || /今日のご飯/.test(fridgeText);
    if (_fridgeWaitMenuKw) {
      await replyLineMessage(replyToken, [{
        type: 'text',
        text: `冷蔵庫の食材入力中ですが、「${fridgeText}」が届きました😊\\n\\nどうしますか？`,
        quickReply: buildRetriggerQuickReply(),
      }], lineUserId);
      return true;
    }
    await setLineUserPendingAction(lineUserId, null);'''

if OLD_FRIDGE_INPUT_WAIT in content:
    content = content.replace(OLD_FRIDGE_INPUT_WAIT, NEW_FRIDGE_INPUT_WAIT, 1)
    print('✅ 3. fridge_input_wait再トリガー処理を変更しました')
else:
    print('❌ 3. fridge_input_wait再トリガー処理の挿入位置が見つかりません')

# ─────────────────────────────────────────────────────────────────────────────
# 4. fridge_add_qty中のpending_context_mismatchを3択クイックリプライに変更
# ─────────────────────────────────────────────────────────────────────────────
OLD_FRIDGE_QTY_MISMATCH = '''    if (isFridgeQtyContextMismatch) {
      await setLineUserPendingAction(lineUserId, {
        type: 'pending_context_mismatch',
        originalText: trimmedText,
        originalPending: pending,
        askedAt: Date.now(),
      });
      await replyLineMessage(replyToken, [{ type: 'text', text: `「${trimmedText}」ですね😊\\n今のフローと違う指示を受け付けました。\\n\\n現在のフローをキャンセルして、改めて続けますか？
👇 下のボタンから選んでね！`, quickReply: { items: [
        { type: 'action', action: { type: 'message', label: '❌ キャンセルして続ける', text: 'キャンセルして続ける' } },
        { type: 'action', action: { type: 'message', label: '▶️ 今のフローを続ける', text: '今のフローを続ける' } },
      ] } }], lineUserId);'''

NEW_FRIDGE_QTY_MISMATCH = '''    if (isFridgeQtyContextMismatch) {
      // 3択クイックリプライに変更（再生成希望/間違い送信/確認したい）
      await replyLineMessage(replyToken, [{
        type: 'text',
        text: `食材の数量入力中ですが、「${trimmedText}」が届きました😊\\n\\nどうしますか？`,
        quickReply: buildRetriggerQuickReply(),
      }], lineUserId);'''

if OLD_FRIDGE_QTY_MISMATCH in content:
    content = content.replace(OLD_FRIDGE_QTY_MISMATCH, NEW_FRIDGE_QTY_MISMATCH, 1)
    print('✅ 4. fridge_add_qty再トリガー処理を変更しました')
else:
    print('❌ 4. fridge_add_qty再トリガー処理の挿入位置が見つかりません')
    idx = content.find('isFridgeQtyContextMismatch')
    if idx >= 0:
        print(f'   候補位置: {idx}')
        print(repr(content[idx:idx+400]))

# ─────────────────────────────────────────────────────────────────────────────
# 5. 再トリガークイックリプライの応答処理を追加
#    __retrigger_regen__ → pendingクリア＋新しい献立生成（再帰）
#    __retrigger_continue__ → pendingを維持して続きを案内
#    __retrigger_view__ → 今日の献立を表示
# ─────────────────────────────────────────────────────────────────────────────
# pending_context_mismatch処理の直前に追加
OLD_CONTEXT_MISMATCH_START = '''  // ─── pending_context_mismatch: 「今のフローと違う」確認待ち ─'''
NEW_RETRIGGER_HANDLER = '''  // ─── 再トリガークイックリプライの応答処理 ──────────────────────────────────────────
  if (text.trim() === '__retrigger_regen__') {
    // 再生成希望 → pendingクリアして新しい献立生成（テキストを「献立」として再処理）
    await setLineUserPendingAction(lineUserId, null);
    await replyLineMessage(replyToken, [{
      type: 'text',
      text: '了解です！新しい献立を提案しますね😊',
    }], lineUserId);
    // 「献立」として再帰処理
    await handleLineWebhookEvent({
      type: 'message',
      source: { userId: lineUserId },
      replyToken: 'dummy_retrigger',
      message: { type: 'text', text: '献立' },
    }, true);
    return true;
  }
  if (text.trim() === '__retrigger_continue__') {
    // 間違い送信 → pendingを維持して続きを案内
    const _retriggerPending = await getLineUserPendingAction(lineUserId);
    if (_retriggerPending?.type === 'voice_confirm') {
      const { transcribedText } = _retriggerPending as { transcribedText: string };
      await replyLineMessage(replyToken, [{
        type: 'text',
        text: `了解です！引き続き音声入力の確認をお願いします😊\\n\\n「${transcribedText}」でよろしいですか？\\n「はい」→ そのまま処理します\\n「いいえ」→ キャンセルします`,
      }], lineUserId);
    } else if (_retriggerPending?.type === 'fridge_input_wait') {
      await replyLineMessage(replyToken, [{
        type: 'text',
        text: '了解です！引き続き冷蔵庫に追加する食材を教えてください😊\\n（例：卵、牛乳、キャベツ）',
      }], lineUserId);
    } else if (_retriggerPending?.type === 'fridge_add_qty') {
      const { itemName } = _retriggerPending as { itemName: string };
      await replyLineMessage(replyToken, [{
        type: 'text',
        text: `了解です！「${itemName}」の数量を教えてください😊\\n（例：3個、300g、半分くらい）`,
      }], lineUserId);
    } else {
      await replyLineMessage(replyToken, [{
        type: 'text',
        text: '了解です！引き続き操作を続けてください😊',
      }], lineUserId);
    }
    return true;
  }
  if (text.trim() === '__retrigger_view__') {
    // 確認したい → 今日の献立を表示してpendingは維持
    if (userId) {
      const nowJSTv = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const todayStrV = nowJSTv.toISOString().slice(0, 10);
      const todayPlanV = await getMenuPlanByDate(userId, todayStrV);
      if (todayPlanV?.menuData) {
        try {
          const menuDataV = typeof todayPlanV.menuData === 'string' ? JSON.parse(todayPlanV.menuData) : todayPlanV.menuData;
          const lines: string[] = ['📋 今日の献立'];
          if (menuDataV.breakfast) {
            const b = Array.isArray(menuDataV.breakfast) ? menuDataV.breakfast : [menuDataV.breakfast];
            lines.push(`🌅 朝食: ${b.map((x: any) => x.name || x).join('・')}`);
          }
          if (menuDataV.lunch) {
            const l = Array.isArray(menuDataV.lunch) ? menuDataV.lunch : [menuDataV.lunch];
            lines.push(`☀️ 昼食: ${l.map((x: any) => x.name || x).join('・')}`);
          }
          if (menuDataV.dinner) {
            const d = Array.isArray(menuDataV.dinner) ? menuDataV.dinner : [menuDataV.dinner];
            lines.push(`🌙 夕食: ${d.map((x: any) => x.name || x).join('・')}`);
          }
          await replyLineMessage(replyToken, [{ type: 'text', text: lines.join('\\n') }], lineUserId);
        } catch {
          await replyLineMessage(replyToken, [{ type: 'text', text: '今日の献立情報を取得できませんでした。' }], lineUserId);
        }
      } else {
        await replyLineMessage(replyToken, [{ type: 'text', text: '今日の献立はまだ登録されていません。' }], lineUserId);
      }
    } else {
      await replyLineMessage(replyToken, [{ type: 'text', text: '献立を確認するにはログインが必要です。' }], lineUserId);
    }
    return true;
  }

  // ─── pending_context_mismatch: 「今のフローと違う」確認待ち ─'''

if OLD_CONTEXT_MISMATCH_START in content:
    content = content.replace(OLD_CONTEXT_MISMATCH_START, NEW_RETRIGGER_HANDLER, 1)
    print('✅ 5. 再トリガークイックリプライ応答処理を追加しました')
else:
    print('❌ 5. 再トリガークイックリプライ応答処理の挿入位置が見つかりません')

# ─────────────────────────────────────────────────────────────────────────────
# 6. voice_confirm セット時に askedAt を追加
# ─────────────────────────────────────────────────────────────────────────────
OLD_VOICE_CONFIRM_SET = '''      await setLineUserPendingAction(lineUserId, {
        type: 'voice_confirm',
        transcribedText: transcribedText,
      });'''

NEW_VOICE_CONFIRM_SET = '''      await setLineUserPendingAction(lineUserId, {
        type: 'voice_confirm',
        transcribedText: transcribedText,
        askedAt: Date.now(),
      });'''

if OLD_VOICE_CONFIRM_SET in content:
    content = content.replace(OLD_VOICE_CONFIRM_SET, NEW_VOICE_CONFIRM_SET, 1)
    print('✅ 6. voice_confirm askedAt追加しました')
else:
    print('⚠️  6. voice_confirm askedAt挿入位置が見つかりません（既に追加済みの可能性）')

# ─────────────────────────────────────────────────────────────────────────────
# 7. fridge_input_wait セット時に askedAt を追加
# ─────────────────────────────────────────────────────────────────────────────
OLD_FRIDGE_WAIT_SET = '''        await setLineUserPendingAction(lineUserId, { type: 'fridge_input_wait' });'''

NEW_FRIDGE_WAIT_SET = '''        await setLineUserPendingAction(lineUserId, { type: 'fridge_input_wait', askedAt: Date.now() });'''

if OLD_FRIDGE_WAIT_SET in content:
    content = content.replace(OLD_FRIDGE_WAIT_SET, NEW_FRIDGE_WAIT_SET, 1)
    print('✅ 7. fridge_input_wait askedAt追加しました')
else:
    print('⚠️  7. fridge_input_wait askedAt挿入位置が見つかりません（既に追加済みの可能性）')

# ─────────────────────────────────────────────────────────────────────────────
# 8. fridge_add_qty セット時に askedAt を追加
# ─────────────────────────────────────────────────────────────────────────────
OLD_FRIDGE_QTY_SET = '''        await setLineUserPendingAction(lineUserId, {
          type: 'fridge_add_qty',
          itemName: name,
          existingId: existing?.id ?? null,
          existingQty: existingQtyNum,
        });'''

NEW_FRIDGE_QTY_SET = '''        await setLineUserPendingAction(lineUserId, {
          type: 'fridge_add_qty',
          itemName: name,
          existingId: existing?.id ?? null,
          existingQty: existingQtyNum,
          askedAt: Date.now(),
        });'''

if OLD_FRIDGE_QTY_SET in content:
    content = content.replace(OLD_FRIDGE_QTY_SET, NEW_FRIDGE_QTY_SET, 1)
    print('✅ 8. fridge_add_qty askedAt追加しました')
else:
    print('⚠️  8. fridge_add_qty askedAt挿入位置が見つかりません（既に追加済みの可能性）')

# ─────────────────────────────────────────────────────────────────────────────
# 書き込み
# ─────────────────────────────────────────────────────────────────────────────
with open('server/routers/line.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('\n✅ パッチ完了！')
