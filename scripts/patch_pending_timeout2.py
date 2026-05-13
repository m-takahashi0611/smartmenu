#!/usr/bin/env python3
"""
pendingAction再トリガー処理の残りパッチ（voice_confirm / fridge_add_qty）
"""

with open('server/routers/line.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# ─────────────────────────────────────────────────────────────────────────────
# 2. voice_confirm中に「その他の入力」が来た場合の処理を変更
# ─────────────────────────────────────────────────────────────────────────────
OLD_VOICE = (
    '    // その他の入力→新しいテキストとして上書きして再確認\n'
    '    // 例：音声復唱中に「献立！」と返してきた場合、「献立！」を新しいtranscribedTextとして再確認\n'
    '    await setLineUserPendingAction(lineUserId, {\n'
    '      type: \'voice_confirm\',\n'
    '      transcribedText: trimmed,\n'
    '    });\n'
    '    await replyLineMessage(replyToken, [{\n'
    '      type: \'text\',\n'
    '      text: `「${trimmed}」でよろしいでしょうか？\n\n「はい」→ そのまま処理します\n「いいえ」→ キャンセルします`,\n'
    '    }], lineUserId);\n'
    '    return true;\n'
    '  }'
)

NEW_VOICE = (
    '    // その他の入力→献立キーワードなら3択クイックリプライ、それ以外は上書き再確認\n'
    '    const _voiceMenuKw = /^(献立|今日の献立|今夜の献立|明日の献立|献立を|献立お願い|献立提案|献立して|献立考えて|ご飯作って|ご飯提案|おすすめ献立)$/.test(trimmed)\n'
    '      || /今日何(作|つく)ろ/.test(trimmed) || /ご飯(何|なに)(作|つく)/.test(trimmed) || /今日のご飯/.test(trimmed);\n'
    '    if (_voiceMenuKw) {\n'
    '      // 献立キーワード → 3択クイックリプライ（pendingは維持）\n'
    '      await replyLineMessage(replyToken, [{\n'
    '        type: \'text\',\n'
    '        text: `音声入力の確認中ですが、「${trimmed}」が届きました😊\\n\\nどうしますか？`,\n'
    '        quickReply: buildRetriggerQuickReply(),\n'
    '      }], lineUserId);\n'
    '      return true;\n'
    '    }\n'
    '    // 例：音声復唱中に別のテキストを返してきた場合、新しいtranscribedTextとして上書きして再確認\n'
    '    await setLineUserPendingAction(lineUserId, {\n'
    '      type: \'voice_confirm\',\n'
    '      transcribedText: trimmed,\n'
    '      askedAt: Date.now(),\n'
    '    });\n'
    '    await replyLineMessage(replyToken, [{\n'
    '      type: \'text\',\n'
    '      text: `「${trimmed}」でよろしいでしょうか？\\n「はい」→ そのまま処理します\\n「いいえ」→ キャンセルします`,\n'
    '    }], lineUserId);\n'
    '    return true;\n'
    '  }'
)

if OLD_VOICE in content:
    content = content.replace(OLD_VOICE, NEW_VOICE, 1)
    print('✅ 2. voice_confirm再トリガー処理を変更しました')
else:
    print('❌ 2. voice_confirm再トリガー処理の挿入位置が見つかりません')

# ─────────────────────────────────────────────────────────────────────────────
# 4. fridge_add_qty中のpending_context_mismatchを3択クイックリプライに変更
# ─────────────────────────────────────────────────────────────────────────────
OLD_QTY = content[content.find('isFridgeQtyContextMismatch) {'):content.find('isFridgeQtyContextMismatch) {') + 600]
print('DEBUG OLD_QTY:', repr(OLD_QTY[:300]))

idx = content.find('    if (isFridgeQtyContextMismatch) {\n      await setLineUserPendingAction')
if idx >= 0:
    # 終端を探す（return true;\n    }）
    end_marker = '      return true;\n    }'
    end_idx = content.find(end_marker, idx)
    if end_idx >= 0:
        old_block = content[idx:end_idx + len(end_marker)]
        new_block = (
            '    if (isFridgeQtyContextMismatch) {\n'
            '      // 3択クイックリプライに変更（再生成希望/間違い送信/確認したい）\n'
            '      await replyLineMessage(replyToken, [{\n'
            '        type: \'text\',\n'
            '        text: `食材の数量入力中ですが、「${trimmedText}」が届きました😊\\n\\nどうしますか？`,\n'
            '        quickReply: buildRetriggerQuickReply(),\n'
            '      }], lineUserId);\n'
            '      return true;\n'
            '    }'
        )
        content = content[:idx] + new_block + content[end_idx + len(end_marker):]
        print('✅ 4. fridge_add_qty再トリガー処理を変更しました')
    else:
        print('❌ 4. fridge_add_qty終端が見つかりません')
else:
    print('❌ 4. fridge_add_qty開始位置が見つかりません')

# ─────────────────────────────────────────────────────────────────────────────
# 書き込み
# ─────────────────────────────────────────────────────────────────────────────
with open('server/routers/line.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('\n✅ パッチ2完了！')
