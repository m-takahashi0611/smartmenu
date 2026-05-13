#!/usr/bin/env python3
"""
fridge_add_qty / fridge_input_wait / voice_confirm のセット時に askedAt を追加するパッチ
"""

with open('server/routers/line.ts', 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# fridge_add_qty の3箇所に askedAt を追加
OLD_QTY_1 = (
    '          type: \'fridge_add_qty\',\n'
    '          itemName,\n'
    '          existingId: existing.id,\n'
    '          existingQty: existingQtyNum,\n'
    '        });'
)
NEW_QTY_1 = (
    '          type: \'fridge_add_qty\',\n'
    '          itemName,\n'
    '          existingId: existing.id,\n'
    '          existingQty: existingQtyNum,\n'
    '          askedAt: Date.now(),\n'
    '        });'
)
if OLD_QTY_1 in content:
    content = content.replace(OLD_QTY_1, NEW_QTY_1, 1)
    changes += 1
    print('✅ fridge_add_qty (existingQtyNum) askedAt追加')

OLD_QTY_2 = (
    '          type: \'fridge_add_qty\',\n'
    '          itemName,\n'
    '          existingId: existing.id,\n'
    '          existingQty: 0,\n'
    '        });'
)
NEW_QTY_2 = (
    '          type: \'fridge_add_qty\',\n'
    '          itemName,\n'
    '          existingId: existing.id,\n'
    '          existingQty: 0,\n'
    '          askedAt: Date.now(),\n'
    '        });'
)
if OLD_QTY_2 in content:
    content = content.replace(OLD_QTY_2, NEW_QTY_2, 1)
    changes += 1
    print('✅ fridge_add_qty (existingId, qty=0) askedAt追加')

OLD_QTY_3 = (
    '          type: \'fridge_add_qty\',\n'
    '          itemName,\n'
    '          existingId: null,\n'
    '          existingQty: 0,\n'
    '        });'
)
NEW_QTY_3 = (
    '          type: \'fridge_add_qty\',\n'
    '          itemName,\n'
    '          existingId: null,\n'
    '          existingQty: 0,\n'
    '          askedAt: Date.now(),\n'
    '        });'
)
if OLD_QTY_3 in content:
    content = content.replace(OLD_QTY_3, NEW_QTY_3, 1)
    changes += 1
    print('✅ fridge_add_qty (existingId=null) askedAt追加')

# fridge_input_wait に askedAt を追加
OLD_WAIT = "await setLineUserPendingAction(lineUserId, { type: 'fridge_input_wait' });"
NEW_WAIT = "await setLineUserPendingAction(lineUserId, { type: 'fridge_input_wait', askedAt: Date.now() });"
if OLD_WAIT in content:
    content = content.replace(OLD_WAIT, NEW_WAIT, 1)
    changes += 1
    print('✅ fridge_input_wait askedAt追加')
else:
    print('⚠️  fridge_input_wait askedAt挿入位置が見つかりません')

# voice_confirm の初回セット時に askedAt を追加（音声文字起こし後のセット）
# 「音声復唱確認待ち」として最初にセットされる箇所を探す
OLD_VOICE_INIT = (
    '      await setLineUserPendingAction(lineUserId, {\n'
    '        type: \'voice_confirm\',\n'
    '        transcribedText: transcribedText,\n'
    '      });'
)
NEW_VOICE_INIT = (
    '      await setLineUserPendingAction(lineUserId, {\n'
    '        type: \'voice_confirm\',\n'
    '        transcribedText: transcribedText,\n'
    '        askedAt: Date.now(),\n'
    '      });'
)
if OLD_VOICE_INIT in content:
    content = content.replace(OLD_VOICE_INIT, NEW_VOICE_INIT, 1)
    changes += 1
    print('✅ voice_confirm 初回セット askedAt追加')
else:
    # 別のパターンを試す
    OLD_VOICE_INIT2 = (
        '        type: \'voice_confirm\',\n'
        '        transcribedText: transcribedText,\n'
        '      });'
    )
    if OLD_VOICE_INIT2 in content:
        NEW_VOICE_INIT2 = (
            '        type: \'voice_confirm\',\n'
            '        transcribedText: transcribedText,\n'
            '        askedAt: Date.now(),\n'
            '      });'
        )
        content = content.replace(OLD_VOICE_INIT2, NEW_VOICE_INIT2, 1)
        changes += 1
        print('✅ voice_confirm 初回セット askedAt追加（パターン2）')
    else:
        print('⚠️  voice_confirm 初回セット askedAt挿入位置が見つかりません')
        # デバッグ
        idx = content.find("type: 'voice_confirm'")
        if idx >= 0:
            print(repr(content[idx-50:idx+200]))

with open('server/routers/line.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'\n✅ パッチ3完了！ {changes}箇所変更')
