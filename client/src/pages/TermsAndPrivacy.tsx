import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

type PageType = "terms" | "privacy" | "tokushoho" | "cancel";

const TABS: { key: PageType; label: string }[] = [
  { key: "terms", label: "利用規約" },
  { key: "privacy", label: "プライバシーポリシー" },
  { key: "tokushoho", label: "特定商取引法" },
  { key: "cancel", label: "キャンセルポリシー" },
];

export default function TermsAndPrivacy({ page }: { page?: PageType }) {
  const [activeTab, setActiveTab] = useState<PageType>(page ?? "terms");

  return (
    <div className="min-h-screen bg-[#f8fdf9]">
      {/* ヘッダー */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-green-100">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <span className="text-lg">🍽️</span>
              <span className="font-bold text-green-800 text-sm">献立日和～coto coto～</span>
            </div>
          </Link>
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-xs text-green-700">← トップへ</Button>
          </Link>
        </div>
      </header>

      {/* タブ切り替え */}
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <div className="grid grid-cols-2 gap-2 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-green-700 text-white"
                  : "bg-green-50 text-green-700 hover:bg-green-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "terms" && <TermsContent />}
        {activeTab === "privacy" && <PrivacyContent />}
        {activeTab === "tokushoho" && <TokushohoContent />}
        {activeTab === "cancel" && <CancelContent />}

        <div className="pb-12" />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-bold text-green-800 mb-2 border-l-4 border-green-600 pl-3">{title}</h2>
      <div className="text-sm leading-relaxed text-gray-700 pl-1">{children}</div>
    </div>
  );
}

function TermsContent() {
  return (
    <div className="max-w-none bg-white rounded-2xl p-6 shadow-sm border border-green-50">
      <h1 className="text-xl font-bold text-green-800 mb-2">利用規約</h1>
      <p className="text-xs text-gray-400 mb-6">最終更新日：2026年4月9日</p>

      <p className="text-sm leading-relaxed mb-6 text-gray-700">
        本利用規約（以下「本規約」）は、株式会社SELF-CONSULTING（以下「当社」）が提供する献立日和〜coto coto〜（以下「本サービス」）の利用条件を定めるものです。ユーザーの皆様（以下「ユーザー」）には、本規約に同意いただいた上で本サービスをご利用いただきます。本サービスをご利用いただいた時点で、本規約に同意したものとみなします。
      </p>

      <Section title="第1条（定義）">
        本規約において使用する用語の定義は以下のとおりです。
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li><strong>「本サービス」</strong>：当社が提供するAI献立提案サービス「献立日和〜coto coto〜」およびこれに付随するすべての機能</li>
          <li><strong>「ユーザー」</strong>：本サービスを利用するすべての方</li>
          <li><strong>「当社」</strong>：株式会社SELF-CONSULTING</li>
          <li><strong>「プレミアムプラン」</strong>：月額480円（税込）の有料サブスクリプションプラン</li>
          <li><strong>「コンテンツ」</strong>：本サービス上に掲載されるテキスト、画像、ロゴ、AIが生成する献立・レシピ等の一切の情報</li>
        </ul>
      </Section>

      <Section title="第2条（適用）">
        本規約は、ユーザーと当社との間の本サービスの利用に関わる一切の関係に適用されます。当社が本サービス上に掲示するガイドライン・ポリシー等は、本規約の一部を構成します。
      </Section>

      <Section title="第3条（利用登録）">
        本サービスはLINEアカウントによる認証を通じてご利用いただきます。登録申請者が以下のいずれかに該当する場合、当社は利用登録をお断りすることがあります。
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>虚偽の事項を届け出た場合</li>
          <li>本規約に違反したことがある者からの申請である場合</li>
          <li>反社会的勢力等（暴力団、暴力団員、右翼団体、反社会的勢力、その他これに準ずる者）に該当する場合</li>
          <li>その他、当社が利用登録を相当でないと判断した場合</li>
        </ul>
      </Section>

      <Section title="第4条（アカウントの管理）">
        ユーザーは、LINEアカウントを自己の責任において管理するものとします。ユーザーのLINEアカウントを利用して行われた一切の行為は、当該ユーザーによる行為とみなします。第三者によるアカウントの不正利用により生じた損害について、当社は一切の責任を負いません。
      </Section>

      <Section title="第5条（有料サービス・料金）">
        本サービスには無料プランとプレミアムプラン（月額480円税込）があります。有料プランのご利用にあたっては、当社が定める料金を支払っていただきます。料金の支払いはStripe社の決済システムを通じて行われます。一度お支払いいただいた料金は、法令に定める場合および当社の責に帰すべき事由がある場合を除き、返金いたしません。
      </Section>

      <Section title="第6条（サブスクリプションの解約）">
        プレミアムプランはいつでも解約することができます。解約後は次回更新日まで有料プランの機能をご利用いただけます。解約のお手続きはダッシュボード内の「プラン管理」ページから行えます。詳細はキャンセルポリシーをご確認ください。
      </Section>

      <Section title="第7条（著作権・知的財産権）">
        本サービスに関する一切の著作権その他の知的財産権（コンテンツ、ロゴ、デザイン、AIが生成する献立・レシピを含む）は、当社または正当な権利を有する第三者に帰属します。ユーザーは、当社の事前の書面による許可なく、これらを複製・転載・改変・二次利用・商用利用することはできません。
      </Section>

      <Section title="第8条（禁止事項）">
        ユーザーは、本サービスの利用にあたり、以下の行為をしてはなりません。
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>法令または公序良俗に違反する行為</li>
          <li>犯罪行為に関連する行為</li>
          <li>本サービスのサーバーまたはネットワークの機能を破壊・妨害する行為</li>
          <li>他のユーザーに関する個人情報等を収集または蓄積する行為</li>
          <li>不正アクセスをし、またはこれを試みる行為</li>
          <li>当社または第三者の知的財産権、肖像権、プライバシー、名誉その他の権利または利益を侵害する行為</li>
          <li>本サービスのコンテンツを無断で転載・複製・二次利用する行為</li>
          <li>その他、当社が不適切と判断する行為</li>
        </ul>
      </Section>

      <Section title="第9条（反社会的勢力の排除）">
        ユーザーは、現在および将来にわたり、暴力団、暴力団員、暴力団準構成員、暴力団関係企業、総会屋等、社会運動等標ぼうゴロ、特殊知能暴力集団等、その他これらに準ずる者（以下「反社会的勢力等」）に該当しないことを表明し、確約します。ユーザーが反社会的勢力等に該当することが判明した場合、当社は事前通知なく当該ユーザーのサービス利用を停止し、利用契約を解除することができます。
      </Section>

      <Section title="第10条（免責事項）">
        <p className="mb-2">当社は、本サービスに関して以下の事項について責任を負いません。</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>AIが提案する献立・レシピはあくまで参考情報です。食物アレルギー、持病、健康状態に応じた判断は必ずユーザー自身の責任で行ってください。アレルギー情報の正確性は保証しません。</li>
          <li>提案されたレシピの調理・摂取により生じた健康被害、食中毒、アレルギー症状等について、当社は一切の責任を負いません。</li>
          <li>ユーザーと第三者との間において生じた取引、連絡または紛争等について、当社は一切責任を負いません。</li>
          <li>天災、通信障害、システム障害等の不可抗力によりサービスが利用できない場合の損害。</li>
        </ul>
      </Section>

      <Section title="第11条（損害賠償の制限）">
        当社がユーザーに対して損害賠償責任を負う場合、その賠償額は、当該損害が発生した月の直近12ヶ月間にユーザーが当社に支払った利用料金の合計額を上限とします。ただし、当社の故意または重大な過失による場合はこの限りではありません。
      </Section>

      <Section title="第12条（サービスの変更・停止）">
        当社は、以下の場合に事前通知なく本サービスの全部または一部を変更・停止することができます。
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>システムの保守・点検を行う場合</li>
          <li>地震・落雷・火災・停電・天災等の不可抗力が生じた場合</li>
          <li>コンピュータウイルスや不正アクセス等のセキュリティ上の問題が生じた場合</li>
          <li>その他、当社が停止を必要と判断した場合</li>
        </ul>
        これらの事由によりユーザーに生じた損害について、当社は一切の責任を負いません。
      </Section>

      <Section title="第13条（サービス内容の変更）">
        当社は、ユーザーへの事前通知をもって、本サービスの内容、料金プラン、機能等を変更することができます。重要な変更については、本サービス上での掲示またはLINEを通じた通知により告知します。
      </Section>

      <Section title="第14条（利用規約の変更）">
        当社は、民法第548条の4の規定に基づき、ユーザーの個別の承諾を得ることなく本規約を変更することができます。変更後の規約は、本サービス上に掲示した時点から効力を生じるものとします。変更後も本サービスを継続してご利用いただいた場合、変更後の規約に同意したものとみなします。
      </Section>

      <Section title="第15条（準拠法・裁判管轄）">
        本規約の解釈にあたっては、日本法を準拠法とします。本サービスに関して紛争が生じた場合には、東京地方裁判所を専属的合意管轄とします。
      </Section>

      <p className="text-xs text-gray-400 mt-8">以上</p>
      <p className="text-xs text-gray-400 mt-1">制定日：2025年4月1日　最終改定日：2026年4月9日</p>
    </div>
  );
}

function PrivacyContent() {
  return (
    <div className="max-w-none bg-white rounded-2xl p-6 shadow-sm border border-green-50">
      <h1 className="text-xl font-bold text-green-800 mb-2">プライバシーポリシー</h1>
      <p className="text-xs text-gray-400 mb-6">最終更新日：2026年4月9日</p>

      <p className="text-sm leading-relaxed mb-6 text-gray-700">
        株式会社SELF-CONSULTING（以下「当社」）は、献立日和〜coto coto〜（以下「本サービス」）におけるユーザーの個人情報の取扱いについて、以下のとおりプライバシーポリシーを定めます。
      </p>

      <Section title="第1条（収集する情報）">
        本サービスでは、以下の情報を収集します。
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li><strong>LINEアカウント情報：</strong>ユーザーID、表示名、プロフィール画像（LINEログイン時に取得）</li>
          <li><strong>家族構成情報：</strong>家族の名前・年齢・食の好みなど、ユーザーが任意で登録した情報</li>
          <li><strong>冷蔵庫・食材情報：</strong>ユーザーが登録した食材・在庫情報</li>
          <li><strong>献立・利用履歴：</strong>AIが生成した献立の内容と利用日時</li>
          <li><strong>決済情報：</strong>有料プランご利用時の決済情報（Stripe社が管理。カード番号等は当社では保持しません）</li>
          <li><strong>お問い合わせ情報：</strong>お問い合わせフォームからご連絡いただいた際のお名前・メールアドレス・内容</li>
          <li><strong>アクセスログ：</strong>IPアドレス、ブラウザ情報、アクセス日時等</li>
        </ul>
      </Section>

      <Section title="第2条（情報の利用目的）">
        収集した情報は以下の目的で利用します。
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>本サービスの提供・運営</li>
          <li>AIによる献立提案の精度向上</li>
          <li>LINEを通じた献立・情報の配信</li>
          <li>有料プランの決済処理・管理</li>
          <li>お問い合わせへの対応</li>
          <li>サービス改善・新機能開発のための分析</li>
          <li>利用規約違反等の調査・対応</li>
        </ul>
      </Section>

      <Section title="第3条（第三者提供）">
        当社は、以下の場合を除き、ユーザーの個人情報を第三者に提供しません。
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>ユーザーの同意がある場合</li>
          <li>法令に基づく場合</li>
          <li>人の生命・身体・財産の保護のために必要な場合</li>
          <li>公衆衛生の向上または児童の健全な育成の推進のために特に必要な場合</li>
        </ul>
        なお、決済処理にはStripe, Inc.のサービスを利用しており、決済に必要な情報が同社に提供されます。
      </Section>

      <Section title="第4条（外部サービスの利用）">
        本サービスでは以下の外部サービスを利用しています。各サービスのプライバシーポリシーもご確認ください。
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li><strong>LINE：</strong>認証・メッセージ配信（LINE株式会社）</li>
          <li><strong>Stripe：</strong>決済処理（Stripe, Inc.）</li>
          <li><strong>OpenAI：</strong>AIによる献立生成（OpenAI, L.L.C.）※入力情報がAIの学習に利用されない設定を採用しています</li>
        </ul>
      </Section>

      <Section title="第5条（情報の管理）">
        当社は、収集した個人情報を適切に管理し、不正アクセス・紛失・破壊・改ざん・漏洩などを防止するために、適切なセキュリティ対策を実施します。保存期間はサービス利用終了後1年間とし、その後適切に廃棄します。
      </Section>

      <Section title="第6条（開示・訂正・削除）">
        ユーザーは、当社が保有する自己の個人情報の開示・訂正・削除を求めることができます。ご要望は<Link href="/contact"><span className="text-green-600 underline cursor-pointer">お問い合わせフォーム</span></Link>よりご連絡ください。合理的な期間内に対応いたします。
      </Section>

      <Section title="第7条（Cookieの利用）">
        本サービスでは、サービスの品質向上を目的としてCookieを使用する場合があります。ブラウザの設定によりCookieを無効にすることができますが、一部機能が正常に動作しない場合があります。
      </Section>

      <Section title="第8条（未成年者の利用）">
        未成年者が本サービスを利用する場合は、保護者の同意を得た上でご利用ください。
      </Section>

      <Section title="第9条（プライバシーポリシーの変更）">
        本ポリシーの内容は、必要に応じて変更することがあります。重要な変更については事前に通知します。変更後のポリシーは本サービス上に掲示した時点から効力を生じます。
      </Section>

      <p className="text-xs text-gray-400 mt-8">以上</p>
      <p className="text-xs text-gray-400 mt-1">制定日：2025年4月1日　最終改定日：2026年4月9日</p>
    </div>
  );
}

function TokushohoContent() {
  return (
    <div className="max-w-none bg-white rounded-2xl p-6 shadow-sm border border-green-50">
      <h1 className="text-xl font-bold text-green-800 mb-2">特定商取引法に基づく表示</h1>
      <p className="text-xs text-gray-400 mb-6">最終更新日：2026年4月9日</p>

      <div className="border border-green-100 rounded-lg overflow-hidden mb-6">
        <table className="w-full text-sm">
          <tbody>
            {[
              ["販売業者", "株式会社SELF-CONSULTING"],
              ["代表者", "高橋 導成"],
              ["所在地", "〒110-0015\n東京都台東区東上野3-32-14"],
              ["電話番号", "請求があれば遅滞なく開示いたします"],
              ["お問い合わせ", "お問い合わせフォームよりご連絡ください（/contact）"],
              ["販売価格", "プレミアムプラン：月額480円（税込）"],
              ["支払方法", "クレジットカード（Visa / Mastercard / American Express / JCB）"],
              ["支払時期", "お申し込み時および毎月の更新日に自動決済"],
              ["サービス提供時期", "決済完了後、即時ご利用いただけます"],
              ["返品・キャンセル", "デジタルコンテンツの性質上、決済完了後の返金は原則お受けできません。サブスクリプションの解約はいつでも可能で、解約後は次回更新日まで有効です。詳細はキャンセルポリシーをご確認ください。"],
              ["動作環境", "スマートフォン（iOS / Android）、LINEアプリ、インターネット接続環境"],
            ].map(([label, value]) => (
              <tr key={label} className="border-b border-green-50 last:border-0">
                <td className="py-3 px-4 bg-green-50/60 font-medium text-green-900 w-1/3 align-top">{label}</td>
                <td className="py-3 px-4 text-gray-700 whitespace-pre-line">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        ※ 電話番号については、ご請求いただいた場合には遅滞なく開示いたします。<Link href="/contact"><span className="text-green-600 underline cursor-pointer">お問い合わせフォーム</span></Link>よりご連絡ください。
      </p>
    </div>
  );
}

function CancelContent() {
  return (
    <div className="max-w-none bg-white rounded-2xl p-6 shadow-sm border border-green-50">
      <h1 className="text-xl font-bold text-green-800 mb-2">キャンセルポリシー</h1>
      <p className="text-xs text-gray-400 mb-6">最終更新日：2026年4月9日</p>

      <p className="text-sm leading-relaxed mb-6 text-gray-700">
        献立日和〜coto coto〜（以下「本サービス」）のプレミアムプランに関するキャンセル・解約についての方針を以下のとおり定めます。
      </p>

      <Section title="1. 解約の方法">
        プレミアムプランの解約は、ダッシュボード内の「プラン管理」ページからいつでも行うことができます。解約手続きは24時間365日受け付けております。
      </Section>

      <Section title="2. 解約後のサービス利用">
        解約申請を行った場合、その時点で即時にサービスが停止されるわけではありません。解約申請後も、<strong>次回の更新日（課金日）まで引き続きプレミアムプランの全機能をご利用いただけます</strong>。次回更新日以降は、無料プランに自動的に移行します。
      </Section>

      <Section title="3. 返金について">
        デジタルコンテンツ・サブスクリプションサービスの性質上、以下の場合を除き、<strong>すでにお支払いいただいた料金の返金は原則として行いません</strong>。
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>当社の責に帰すべき事由によりサービスを提供できなかった場合</li>
          <li>法令により返金が義務付けられる場合</li>
        </ul>
        上記に該当すると思われる場合は、<Link href="/contact"><span className="text-green-600 underline cursor-pointer">お問い合わせフォーム</span></Link>よりご連絡ください。
      </Section>

      <Section title="4. 無料トライアルについて">
        無料トライアル期間中に解約手続きを行った場合、トライアル期間終了後に課金は発生しません。トライアル期間終了前に解約手続きをお済ませください。
      </Section>

      <Section title="5. 注意事項">
        <ul className="list-disc pl-5 space-y-1">
          <li>解約後に再度プレミアムプランに加入することは可能です</li>
          <li>解約によりユーザーデータ（冷蔵庫情報・家族構成・献立履歴等）が削除されることはありません</li>
          <li>プレミアム機能（献立テーマ・お弁当モード等）は、次回更新日以降ご利用いただけなくなります</li>
        </ul>
      </Section>

      <p className="text-xs text-gray-400 mt-8">以上</p>
      <p className="text-xs text-gray-400 mt-1">制定日：2025年4月1日　最終改定日：2026年4月9日</p>
    </div>
  );
}
