import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Home,
  Rows3,
  ScanLine,
  HelpCircle,
  Settings as Cog,
  Plus,
  X,
  Trash2,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Globe,
  RefreshCw,
  ArrowLeft,
  Menu,
  Calendar as CalIcon,
  MapPin,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

/* ------------------------------------------------------------------
   Kaeru　日本退稅小幫手 / 免税リファンドヘルパー
   規則依據：観光庁 消費税免税店サイト（2026/11/1 リファンド方式）
   - 同一店舗・同一日・税抜合計 5,000 円以上
   - 税関確認は「1 回の購入手続（レシート）」単位
   - 特殊包装は廃止。開封は問題なし。国内で「消費」した場合のみ返金不可
   - 購入日から 90 日以内・手荷物を預ける前に手続
------------------------------------------------------------------ */

const MAIN_KEY = 'jptax:v2';
const photoKey = (id) => `jptax:photo:${id}`;
const STAGES = ['purchased', 'registered', 'verified', 'refunded'];

/* 莫蘭迪色票 */
const FONT =
  '"Noto Sans TC", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", "Microsoft JhengHei", system-ui, -apple-system, "Segoe UI", sans-serif';

const C = {
  bg: '#F2F0ED',
  page: '#FFFFFF',
  card: '#FFFFFF',
  soft: '#F4F2EF',
  ink: '#494640',
  sub: '#8B857D',
  line: '#E1DCD5',
  blue: '#77899A',
  blueDeep: '#5C6D7C',
  blueSoft: '#DFE5EA',
  sage: '#93A392',
  sageSoft: '#E1E8DF',
  clay: '#B08D74',
  claySoft: '#EFE2D6',
  clayInk: '#8A6448',
};

const T = {
  zh: {
    appName: 'Kaeru',
    appSub: '日本退稅　先付後退',
    nav: { home: '總覽', list: '收據', check: '查驗', faq: 'FQA', set: '設定' },
    loading: '讀取中',
    departIn: '距離班機起飛',
    departHint: '設定裡的起飛時間',
    days: '天',
    hours: '小時',
    setDeparture: '設定出發時間',
    arriveBy: '建議抵達機場',
    arriveTagPre: '建議 ',
    arriveTagSuf: ' 抵達',
    beforeCheckin: '託運行李前一定要先辦完海關查驗',
    checkinBadge: '託運前先辦查驗',
    totalSpent: '含稅消費合計',
    estRefund: '預估可退稅額',
    pending: '還沒處理',
    itemsUnit: '張',
    nearestDeadline: '最近到期',
    noDeadline: '沒有待辦',
    emptyHome: '還沒有任何收據。買完東西就記一筆，出境前才不會漏。',
    addFirst: '新增第一張收據',
    departChecklist: '出發當天流程',
    step1: '提早 3 小時到機場，行李先不要託運',
    step2: '連上國際線出發大廳的專用無線網路，登入 VJW',
    step3: '在免稅手續機台掃描護照，等綠色或紅色判定',
    step4: '判定通過後再去航空公司櫃檯託運行李',
    receipts: '收據',
    addReceipt: '新增收據',
    groupHint: '同一間店、同一天會合併計算稅抜金額',
    filters: { all: '全部', todo: '待處理', short: '未達標', done: '已完成' },
    noMatch: '這個篩選沒有符合的收據。',
    reached: '已達 5,000 円',
    notReached: '未達 5,000 円',
    short: '還差',
    netTotal: '稅抜合計',
    netBare: '稅抜',
    emptyList: '這裡會列出你所有的收據。',
    shop: '店名',
    date: '購買日期',
    inclAmount: '含稅金額',
    taxRate: '稅率',
    taxAmount: '稅額',
    taxAuto: '自動計算，可手動改',
    netAmount: '稅抜金額',
    refundReg: '已登記退款方式',
    unpacked: '已拆封',
    unpackedHint: '純記錄，不影響退稅',
    consumed: '這張收據裡有東西已在境內吃掉或用掉',
    consumedHint: '整張收據都會無法退稅',
    packNote:
      '拆開包裝沒關係，衣服穿過也沒關係，只要查驗時東西還在、拿得出來就能退。真的吃掉、用掉，東西不在了，那張收據才會整張失效。',
    photo: '收據照片',
    takePhoto: '拍照或選檔',
    note: '備註',
    save: '儲存',
    edit: '編輯',
    cancel: '取消',
    status: '目前狀態',
    stage: {
      purchased: '已購買',
      registered: '已登記退款方式',
      verified: '已通過海關查驗',
      refunded: '已退款',
    },
    stageShort: {
      purchased: '已購買',
      registered: '已登記',
      verified: '已查驗',
      refunded: '已退款',
    },
    stuckAt: '卡在',
    nextStep: '下一步',
    stageNext: {
      purchased: '登記退款方式',
      registered: '海關查驗',
      verified: '退款',
    },
    warnConsumed:
      '這張收據不能退稅。整張收據只要有一項在境內用掉，其他商品也一起失效。請直接跟海關人員申報，不要去機台辦手續。',
    deadCardNote: '同一張收據只要有一項在境內用掉，其他商品也一起失效。請直接跟海關人員申報。',
    warnShort: '這間店這一天的稅抜合計還沒滿 5,000 円，目前不符合退稅條件。',
    warnHigh:
      '如果裡面有稅抜單價滿 100 萬円的商品，海關可能要求出示鑑定書或保證書，記得帶著。',
    warnDeadline: '期限剩',
    dueLeft: '剩',
    expired: '已超過 90 天期限',
    checkTitle: '查驗進度',
    checkIntro: '機場現場自己對　還沒辦完的收據',
    checkLeft: '還剩',
    checkSub: '逐張確認',
    checkCount: '待查驗',
    checkEmpty: '目前沒有符合查驗條件的收據。',
    checkNote: '查驗以一張收據為單位，商品要全部帶在身上。',
    checkDoneRatio: '已辦完',
    checkRefunded: '已退回',
    markVerified: '全部標記為已通過查驗',
    allDone: '都辦完了',
    markOne: '辦完了',
    checkDone: '完成',
    faqTitle: 'FQA',
    faqSection: { buy: '購買時', exit: '出境時', refund: '退款' },
    tipsTitle: '小撇步',
    trips: '行程',
    currentTrip: '目前行程',
    newTrip: '新增行程',
    tripName: '行程名稱',
    tripNamePh: '例如 大阪 11 月',
    noDeparture: '未設定出發時間',
    tripReceipts: '張收據',
    tripSwitch: '切換到這趟',
    tripDelete: '刪除這趟行程',
    tripDeleteConfirm: '刪除這趟？裡面的收據會一起刪掉，沒辦法復原。',
    depPrefix: '出發',
    tripPast: '過去的行程',
    tripNow: '進行中',
    create: '建立',
    menu: '功能',
    pickDate: '選日期',
    pickDateTime: '選日期和時間',
    today: '今天',
    clearDate: '清除',
    doneDate: '完成',
    time: '時間',
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    navDesc: {
      home: '出發倒數和金額統計',
      list: '新增和管理每一張收據',
      check: '出示給海關的清單',
      faq: '規則、小撇步、情境模擬',
      set: '行程、匯率、語言',
    },
    menuTrip: '切換行程',
    menuLang: '語言',
    menuAdd: '新增收據',
    sim: '情境模擬：一趟大阪之旅',
    simSub: '六個決定，看你最後能退多少',
    startSim: '開始這趟旅程',
    simStep: '決定',
    simGot: '你退到',
    simMax: '這趟最多可退',
    simLost: '漏掉',
    simDone: '這趟走完了',
    simSuccess: '退成功',
    unitDecisions: '個決定',
    simWhy: '漏掉的原因',
    rulesTitle: '規則整理',
    stakeMoney: '會影響金額',
    stakeRule: '規則題',
    stalled: '流程中止 · 不要去機台辦手續',
    stalledShort: '流程中止',
    caseClosed: '已結案',
    cantRefund: '不能退',
    lostTax: '拿不回來',
    refillTip: '當天回同店可補買',
    dead: '整張失效',
    consumedShort: '已在境內消費',
    unpackedShort: '已拆封',
    pendingCheck: '待查驗',
    reachedShort: '已達標',
    markTag: '標記',
    currentTag: '目前',
    delete: '刪除',
    groupTotal: '同店同日合計',
    packNoteShort:
      '拆開包裝、衣服穿過都不算消費。真的吃掉、用掉，東西不在了，才會整張失效。',
    refundedNote:
      '退款由免稅店或它委託的退款業者處理，入帳時間各店不同。對不上的時候先找店家，不是海關。',
    rateHint: '以收據上的標示為準，有 ※ 記號的是 8%。',
    taxRateBoth: '兩種都有',
    tax8Label: '8% 對象',
    tax8Sub: '食品、外帶',
    tax10Label: '10% 對象',
    tax10Sub: '酒類、其他商品',
    inclTotalLabel: '含稅總金額',
    autoFilledHint: '自動帶入',
    taxTotalAuto: '稅額合計（可手動改）',
    notFilled: '還沒填',
    taxMixedPartialHint:
      '照收據上的兩行金額各填一格。這張只有 8% 的話，回上面選 8% 就好。',
    simGood: '這步做對了',
    simBad: '這步有問題',
    simPerfect:
      '全部退成功，沒有漏掉。回收據頁對一次自己的：有沒有未達標的、已經吃掉的、或快到 90 天的。',
    next: '繼續',
    of: '／',
    again: '再走一次',
    backToFaq: '回到 FQA',
    settings: '設定',
    departure: '出發時間（起飛）',
    rate: '匯率 1 円 =',
    twd: '台幣',
    fetchRate: '抓即時匯率',
    fetching: '抓取中',
    rateFail: '抓不到即時匯率，先用現在的數字，也可以自己改。',
    rateAt: '更新於',
    manual: '手動輸入',
    language: '語言',
    dataNote: '資料只存在這台裝置上，不會上傳。',
    clearAll: '清空所有資料',
    clearConfirm: '確定要清空？這個動作沒辦法復原。',
    source: '規則依據：観光庁 消費税免税店サイト',
  },
  ja: {
    appName: 'Kaeru',
    appSub: '免税リファンド方式',
    nav: {
      home: 'ホーム',
      list: 'レシート',
      check: '確認',
      faq: 'FQA',
      set: '設定',
    },
    loading: '読み込み中',
    departIn: '出発便まで',
    departHint: '設定の離陸時刻',
    days: '日',
    hours: '時間',
    setDeparture: '出発時刻を設定',
    arriveBy: '空港到着の目安',
    arriveTagPre: '空港到着 ',
    arriveTagSuf: '',
    beforeCheckin: '手荷物を預ける前に税関確認を終わらせてください',
    checkinBadge: '預ける前に税関確認',
    totalSpent: '税込合計',
    estRefund: '返金見込み額',
    pending: '未処理',
    itemsUnit: '件',
    nearestDeadline: '最短の期限',
    noDeadline: '未処理なし',
    emptyHome:
      'まだレシートがありません。買ったらすぐ登録しておくと出国時に困りません。',
    addFirst: '最初のレシートを追加',
    departChecklist: '出発当日の流れ',
    step1: '3 時間前に空港へ。荷物はまだ預けない',
    step2: '国際線出発ロビーの専用無線 LAN に接続し VJW にログイン',
    step3: '免税手続用の端末でパスポートを読み取り、判定を待つ',
    step4: '判定後に航空会社カウンターで荷物を預ける',
    receipts: 'レシート',
    addReceipt: 'レシートを追加',
    groupHint: '同一店舗・同一日は税抜金額が合算されます',
    filters: {
      all: 'すべて',
      todo: '未処理',
      short: '5,000 円未満',
      done: '完了',
    },
    noMatch: '該当するレシートはありません。',
    reached: '5,000 円達成',
    notReached: '5,000 円未満',
    short: 'あと',
    netTotal: '税抜合計',
    netBare: '税抜',
    emptyList: '登録したレシートがここに並びます。',
    shop: '店舗名',
    date: '購入日',
    inclAmount: '税込金額',
    taxRate: '税率',
    taxAmount: '消費税額',
    taxAuto: '自動計算・手動変更可',
    netAmount: '税抜金額',
    refundReg: '返金方法 登録済み',
    unpacked: '開封済み',
    unpackedHint: '記録のみ・返金に影響なし',
    consumed: 'このレシートに国内で消費した物品がある',
    consumedHint: 'レシート全体が返金対象外になります',
    packNote:
      '開封や着用は問題ありません。確認時に所持していれば対象です。消費して所持していない場合のみ、そのレシート全体が対象外になります。',
    photo: 'レシート写真',
    takePhoto: '撮影または選択',
    note: 'メモ',
    save: '保存',
    edit: '編集',
    cancel: 'キャンセル',
    status: 'ステータス',
    stage: {
      purchased: '購入済み',
      registered: '返金方法 登録済み',
      verified: '税関確認 済み',
      refunded: '返金済み',
    },
    stageShort: {
      purchased: '購入済み',
      registered: '登録済み',
      verified: '確認済み',
      refunded: '返金済み',
    },
    stuckAt: '停滞：',
    nextStep: '次は',
    stageNext: {
      purchased: '返金方法登録',
      registered: '税関確認',
      verified: '返金',
    },
    warnConsumed:
      'このレシートは返金を受けられません。1 つでも国内で消費するとレシート全体が対象外です。端末では手続せず、税関職員に申し出てください。',
    deadCardNote:
      '同一レシート内で 1 つでも国内消費すると、他の商品も対象外になります。税関職員に申し出てください。',
    warnShort: '同一店舗・同一日の税抜合計が 5,000 円に達していません。',
    warnHigh:
      '税抜単価 100 万円以上の商品がある場合、鑑定書や保証書の提示を求められることがあります。',
    warnDeadline: '期限まで残り',
    dueLeft: '残り',
    expired: '90 日の期限を過ぎています',
    checkTitle: '手続きの進捗',
    checkIntro: '空港で自分で確認　未処理のレシート',
    checkLeft: '残り',
    checkSub: '1 件ずつ確認',
    checkCount: '確認待ち',
    checkEmpty: '確認対象のレシートはありません。',
    checkNote: '税関確認はレシート単位です。商品はすべて所持してください。',
    checkDoneRatio: '完了',
    checkRefunded: '返金済み',
    markVerified: 'すべて確認済みにする',
    allDone: 'すべて完了にする',
    markOne: '完了にする',
    checkDone: '完了',
    faqTitle: 'FQA',
    faqSection: { buy: '購入時', exit: '出国時', refund: '返金' },
    tipsTitle: 'コツ',
    trips: '旅程',
    currentTrip: '現在の旅程',
    newTrip: '旅程を追加',
    tripName: '旅程名',
    tripNamePh: '例：大阪 11 月',
    noDeparture: '出発時刻 未設定',
    tripReceipts: '件',
    tripSwitch: 'この旅程に切り替え',
    tripDelete: 'この旅程を削除',
    tripDeleteConfirm:
      '削除しますか。レシートも一緒に削除され、元に戻せません。',
    depPrefix: '出発',
    tripPast: '過去の旅程',
    tripNow: '進行中',
    create: '作成',
    menu: 'メニュー',
    pickDate: '日付を選択',
    pickDateTime: '日時を選択',
    today: '今日',
    clearDate: 'クリア',
    doneDate: '完了',
    time: '時刻',
    weekdays: ['日', '月', '火', '水', '木', '金', '土'],
    navDesc: {
      home: '出発までの残り時間と金額',
      list: 'レシートの追加と管理',
      check: '税関へ提示する一覧',
      faq: 'ルール・コツ・シミュレーション',
      set: '旅程・レート・言語',
    },
    menuTrip: '旅程を切り替え',
    menuLang: '言語',
    menuAdd: 'レシートを追加',
    sim: 'シミュレーション：大阪 4 日間',
    simSub: '6 つの判断で返金額が変わります',
    startSim: '旅を始める',
    simStep: '判断',
    simGot: '返金額',
    simMax: '満額',
    simLost: '損失',
    simDone: 'この旅は終わりました',
    simSuccess: '成功',
    unitDecisions: '件の判断',
    simWhy: '失った理由',
    rulesTitle: 'ルールまとめ',
    stakeMoney: '金額に影響',
    stakeRule: 'ルール問題',
    stalled: '手続中止 · 端末では手続しない',
    stalledShort: '手続中止',
    caseClosed: '対応完了',
    cantRefund: '返金不可',
    lostTax: '返金されません',
    refillTip: '同じ日に同じ店で買い足せば合算',
    dead: 'レシート全体が対象外',
    consumedShort: '国内で消費',
    unpackedShort: '開封済み',
    pendingCheck: '確認待ち',
    reachedShort: '達成',
    markTag: '設定',
    currentTag: '現在',
    delete: '削除',
    groupTotal: '同一店舗・同一日 合計',
    packNoteShort:
      '開封や着用は消費にあたりません。食べた・使い切った場合のみ、レシート全体が対象外になります。',
    refundedNote:
      '返金は免税店または委託された返金事業者が処理します。入金時期は店舗により異なります。合わない場合は店舗に確認してください。',
    rateHint: 'レシートの表示を優先。※ マークは 8% 対象。',
    taxRateBoth: '両方あり',
    tax8Label: '8% 対象',
    tax8Sub: '食品・持ち帰り',
    tax10Label: '10% 対象',
    tax10Sub: '酒類・その他',
    inclTotalLabel: '税込総額',
    autoFilledHint: '自動反映',
    taxTotalAuto: '消費税額合計（手動変更可）',
    notFilled: '未入力',
    taxMixedPartialHint:
      'レシートの 2 行の金額をそれぞれ入力してください。8% だけならレシートの表示に戻って 8% を選んでください。',
    simGood: 'この判断は正解',
    simBad: 'この判断は問題あり',
    simPerfect: '満額返金。自分のレシートも確認しましょう。',
    next: '次へ',
    of: '／',
    again: 'もう一度',
    backToFaq: 'FQA に戻る',
    settings: '設定',
    departure: '出発時刻（離陸）',
    rate: 'レート 1 円 =',
    twd: '台湾ドル',
    fetchRate: '最新レートを取得',
    fetching: '取得中',
    rateFail: 'レートを取得できませんでした。手動で入力できます。',
    rateAt: '更新',
    manual: '手動入力',
    language: '言語',
    dataNote: 'データはこの端末にのみ保存されます。',
    clearAll: 'すべてのデータを削除',
    clearConfirm: '本当に削除しますか？元に戻せません。',
    source: '出典：観光庁 消費税免税店サイト',
  },
};

const QA = [
  {
    sec: 'buy',
    q: { zh: '免稅門檻是多少？', ja: '免税の下限はいくらですか。' },
    a: {
      zh: '同一間店、同一天，稅抜合計滿 5,000 円就符合。新制取消一般品和消耗品的區分，零食、藥妝、家電可以一起合併算。',
      ja: '同一店舗・同一日の税抜合計が 5,000 円以上。一般物品と消耗品の区分が廃止され、まとめて計算できます。',
    },
  },
  {
    sec: 'buy',
    q: { zh: '消費稅是幾 %？', ja: '消費税は何 % ですか。' },
    a: {
      zh: '食品適用輕減稅率 8%，其他商品 10%。要注意酒類和外食不算在輕減稅率裡，一樣是 10%。退稅退的就是這筆稅額，所以同樣金額的食品和化妝品，退回來的錢會不一樣。',
      ja: '飲食料品は軽減税率 8%、その他は 10% です。酒類と外食は軽減税率の対象外で 10% になります。返金されるのはこの消費税額です。',
    },
  },
  {
    sec: 'buy',
    q: { zh: '可以先拆開包裝嗎？', ja: '開封してもいいですか。' },
    a: {
      zh: '可以。新制取消了特殊密封袋，拆開沒問題。但只要在日本境內吃掉、用掉，就不能退稅，這時候不要去機台辦手續，直接跟海關人員申報。',
      ja: '問題ありません。特殊包装は廃止されました。ただし国内で消費した場合は返金を受けられません。端末では手続せず、税関職員に申し出てください。',
    },
  },
  {
    sec: 'buy',
    q: { zh: '結帳時要付多少？', ja: '会計時にいくら払いますか。' },
    a: {
      zh: '付含稅價。消費稅要等出境查驗通過之後才退還。',
      ja: '税込価格を支払います。消費税は出国時の税関確認後に返金されます。',
    },
  },
  {
    sec: 'buy',
    q: { zh: '買的數量有限制嗎？', ja: '数量に制限はありますか。' },
    a: {
      zh: '限本人出境時能自己帶著出去的數量。所有商品都要能拿給海關看。',
      ja: '出国時に自ら所持して持ち出せる数量に限られます。すべて税関に提示できるようにしてください。',
    },
  },
  {
    sec: 'exit',
    q: { zh: '什麼時候辦海關查驗？', ja: '税関確認はいつ行いますか。' },
    a: {
      zh: '託運行李之前。一旦把行李交給航空公司就拉不回來了，要提早到機場先辦完。',
      ja: '手荷物を預ける前です。一度預けた荷物は引き戻せないため、早めに空港へ。',
    },
  },
  {
    sec: 'exit',
    q: { zh: '機台在機場哪裡？', ja: '免税手続用の端末はどこにありますか。' },
    a: {
      zh: '在託運櫃檯前的國際線出發大廳一帶。',
      ja: '手荷物預け入れ前の国際線出発ロビー等に設置されます。',
    },
  },
  {
    sec: 'exit',
    q: {
      zh: '可以用 Visit Japan Web 線上辦嗎？',
      ja: 'Visit Japan Web で手続できますか。',
    },
    a: {
      zh: '成田、羽田、關西、中部、福岡、新千歲、那霸這幾個機場，在保安檢查前、連上手續專用無線網路的區域內可以線上辦，取代機台。',
      ja: '成田・羽田・関西・中部・福岡・新千歳・那覇では、保安検査場前の手続専用無線 LAN エリア内でオンライン手続が可能です。',
    },
  },
  {
    sec: 'exit',
    q: {
      zh: '一張收據裡有東西被吃掉了，其他還能退嗎？',
      ja: 'レシートの一部を消費しました。残りは返金されますか。',
    },
    a: {
      zh: '不行。查驗以一張收據為單位，只要有一項不在身上，整張收據的商品都不能退。',
      ja: 'できません。税関確認はレシート単位のため、1 つでも所持していないと全体が対象外です。',
    },
  },
  {
    sec: 'exit',
    q: {
      zh: '衣服穿過了還能退嗎？',
      ja: '服を着てしまいましたが返金されますか。',
    },
    a: {
      zh: '可以。穿過不算消費，只要出境查驗時衣服還在、拿得出來給海關看就行。不能退的是東西已經不在的情況，像零食吃掉、化妝品用掉。',
      ja: '問題ありません。着用は消費にあたらず、確認時に所持していれば対象です。対象外になるのは、食べた・使い切ったなど所持していない場合です。',
    },
  },
  {
    sec: 'buy',
    q: {
      zh: '打算在日本吃掉的東西怎麼買比較好？',
      ja: '国内で食べるものはどう買うのがよいですか。',
    },
    a: {
      zh: '結帳時跟要帶回國的東西分開結，讓它自己一張收據。這樣就算吃掉了，也只有那張失效，其他商品不受影響。5,000 円門檻是同一間店同一天合計計算，分開結不影響達標，不過各店做法可能不同，結帳時先問店員。',
      ja: '持ち帰る物と分けて会計し、別のレシートにするのがおすすめです。消費しても影響はそのレシートだけに収まります。5,000 円の判定は同一店舗・同一日の合算なので、分けても問題ありません。',
    },
  },
  {
    sec: 'exit',
    q: { zh: '買了很貴的東西要準備什麼？', ja: '高額商品には何が必要ですか。' },
    a: {
      zh: '稅抜單價滿 100 萬円的商品，海關可能要求連同商品出示鑑定書或保證書，先準備好會順很多。',
      ja: '税抜単価 100 万円以上の商品は、鑑定書や保証書の提示を求められることがあります。',
    },
  },
  {
    sec: 'exit',
    q: {
      zh: '國內線轉國際線的話在哪辦？',
      ja: '国内線から国際線に乗り継ぐ場合は。',
    },
    a: {
      zh: '在最後離開日本的那個機場辦，不是在出發的國內線機場。',
      ja: '日本を出国する最終空港で手続を行います。',
    },
  },
  {
    sec: 'refund',
    q: { zh: '什麼時候會拿到退款？', ja: '返金はいつですか。' },
    a: {
      zh: '海關查驗通過、免稅販售成立之後，由免稅店或它委託的退款業者退給你。方式各店不同，購買時要問清楚。',
      ja: '税関確認後に免税店または委託された返金事業者から返金されます。方法は店舗により異なります。',
    },
  },
  {
    sec: 'refund',
    q: { zh: '可以領現金嗎？', ja: '現金で受け取れますか。' },
    a: {
      zh: '看店家。可能是銀行匯款、信用卡、App 匯款，也可能在機場現場給現金，各店做法不一樣。',
      ja: '店舗によります。銀行振込、クレジットカード、アプリ送金、空港での現金返金などが考えられます。',
    },
  },
  {
    sec: 'refund',
    q: { zh: '沒把商品帶出境會怎樣？', ja: '商品を持ち出さなかった場合は。' },
    a: {
      zh: '會被追徵等同消費稅的金額，還會受到處分。',
      ja: '免除された消費税相当額が徴収され、罰則の適用対象になります。',
    },
  },
];

const TIPS = [
  {
    zh: '打算在日本吃掉、用掉的東西，結帳時跟要帶回國的分開結，讓它自己一張收據。查驗是看單張收據，分開結就算吃掉也只損失那張。同一間店同一天的稅抜金額仍會合計算門檻，不影響達標，不過各店做法可能不同，結帳時先問店員。',
    ja: '国内で消費する予定の物は、持ち帰る物と分けて会計し別のレシートにします。税関確認はレシート単位なので、消費しても損失はそのレシートだけに収まります。5,000 円の判定は同一店舗・同一日の合算なので影響しません。',
  },
  {
    zh: '差一點沒到 5,000 円的時候，當天回同一間店補買可以合併計算，隔天就不算了。',
    ja: '5,000 円に少し足りない場合、同じ日に同じ店で買い足せば合算されます。翌日は合算されません。',
  },
  {
    zh: '出發前一晚把要查驗的商品集中放在同一個袋子。機台判定紅色時要到海關檢查場把商品拿出來，分散在各處會很花時間。',
    ja: '出発前夜に対象商品を一つの袋にまとめておきます。レッド判定の場合は税関検査場で提示が必要です。',
  },
  {
    zh: '入境前後先在 VJW 登記好，出境時可以直接線上辦免稅手續，不用排機台。',
    ja: '入国前後に VJW へ登録しておくと、出国時にオンラインで手続でき、端末に並ばずに済みます。',
  },
  {
    zh: '紙本收據容易皺、容易褪色，買完順手拍照存在這個 App 裡比較保險。',
    ja: '紙のレシートは折れたり退色したりします。購入後すぐ写真を撮って保存しておくと安心です。',
  },
];

const RULES = {
  zh: [
    '結帳時付含稅價，出境查驗通過之後才退還消費稅。',
    '稅率：食品是輕減稅率 8%，酒類和外食不算，跟其他商品一樣是 10%。退的就是這筆稅額。',
    '同一間店、同一天，稅抜合計滿 5,000 円就符合，不分商品種類。',
    '海關查驗以一張收據為單位，只要有一項拿不出來，整張收據都不能退。',
    '拆開包裝、衣服穿過都沒關係。吃掉、用掉才會失效，這時候不要用機台，直接跟海關人員申報。',
    '購買日起 90 天內要出境並完成查驗。',
    '稅抜單價滿 100 萬円的商品，海關可能要求出示鑑定書或保證書。',
    '一定要在託運行李之前辦完，建議提早 3 小時到機場。',
    '機台判定綠色代表手續完成，紅色是要到海關檢查場出示商品，不是不能退。',
    '國內線轉國際線時，在最後離開日本的那個機場辦。沒把商品帶出境會被追徵消費稅並受處分。',
  ],
  ja: [
    '会計時は税込価格を支払い、出国時の税関確認後に返金されます。',
    '税率：飲食料品は軽減税率 8%。酒類と外食は対象外で、他の商品と同じ 10% です。',
    '同一店舗・同一日の税抜合計が 5,000 円以上で対象。商品の種類は問いません。',
    '税関確認はレシート単位。1 つでも所持していないと、そのレシート全体が対象外です。',
    '開封や着用は問題ありません。消費した場合は端末を使わず税関職員に申し出ます。',
    '購入日から 90 日以内に出国し、税関確認を受ける必要があります。',
    '税抜単価 100 万円以上の商品は、鑑定書や保証書の提示を求められることがあります。',
    '手荷物を預ける前に手続を終える必要があります。3 時間前の空港到着が目安です。',
    'グリーン判定は手続完了、レッド判定は税関検査場で商品を提示します。',
    '国内線から国際線へ乗り継ぐ場合は最終出国空港で手続します。持ち出さない場合は追徴と罰則の対象です。',
  ],
};

const SIM = {
  max: 15544,
  intro: {
    zh: '你在大阪待四天，最後從關西機場回台灣。手上有藥妝店的零食和面膜、服飾店的外套、電器行的相機，全部退成功可以拿回 ¥15,544。接下來九個問題，有的考規則，有的會直接影響你退到多少。',
    ja: '大阪に 4 日間滞在し、関西空港から出国します。ドラッグストアのお菓子とパック、アパレルのコート、家電量販店のカメラ。すべて成功すれば ¥15,544 戻ります。これから 9 問。ルールを問うものと、返金額に直接響くものがあります。',
  },
  wallet: {
    zh: [
      '零食 稅抜 3,800（8% → 稅 304）',
      '面膜 稅抜 2,400（10% → 稅 240）',
      '外套 稅抜 20,000（10% → 稅 2,000）',
      '相機 稅抜 130,000（10% → 稅 13,000）',
    ],
    ja: [
      'お菓子 税抜 3,800（8% → 税 304）',
      'パック 税抜 2,400（10% → 税 240）',
      'コート 税抜 20,000（10% → 税 2,000）',
      'カメラ 税抜 130,000（10% → 税 13,000）',
    ],
  },
  steps: [
    {
      where: { zh: 'Day 1 · 藥妝店', ja: '1 日目・ドラッグストア' },
      scene: {
        zh: '第一天晚上，藥妝店。你手上有稅抜 3,800 的零食和稅抜 2,400 的面膜。退稅退的是消費稅，所以先搞清楚這兩樣各被課了幾 %。',
        ja: '1 日目の夜、ドラッグストア。税抜 3,800 円のお菓子と 2,400 円のパック。返金されるのは消費税なので、まず税率を確認します。',
      },
      q: { zh: '這兩樣的消費稅率是？', ja: 'この 2 つの消費税率は。' },
      opts: [
        {
          label: { zh: '都是 10%', ja: 'どちらも 10%' },
          lose: 0,
          fb: {
            zh: '食品適用輕減稅率 8%。零食是 3,800 的 8%，也就是 304；面膜是 2,400 的 10%，也就是 240。要注意酒類和外食不算食品，一樣是 10%。',
            ja: '飲食料品は軽減税率 8% です。お菓子は 304 円、パックは 240 円。酒類と外食は対象外で 10% です。',
          },
        },
        {
          label: { zh: '零食 8%，面膜 10%', ja: 'お菓子 8%、パック 10%' },
          lose: 0,
          best: true,
          fb: {
            zh: '對。食品是輕減稅率 8%，其他商品 10%。不過酒類和外食不算在輕減稅率裡，那些是 10%。記收據的時候稅率選錯，退款金額就會算錯。',
            ja: '正解です。飲食料品は 8%、その他は 10%。酒類と外食は軽減税率の対象外で 10% です。',
          },
        },
        {
          label: { zh: '都是 8%', ja: 'どちらも 8%' },
          lose: 0,
          fb: {
            zh: '只有食品是 8%。化妝品、衣服、家電這些都是 10%，酒類和外食也是 10%。',
            ja: '8% は飲食料品のみです。化粧品・衣類・家電、そして酒類と外食は 10% です。',
          },
        },
      ],
    },
    {
      where: { zh: 'Day 1 · 藥妝店', ja: '1 日目・ドラッグストア' },
      scene: {
        zh: '兩樣加起來稅抜 6,200。免稅門檻是同一間店、同一天，稅抜合計滿 5,000 円。',
        ja: '2 つ合わせて税抜 6,200 円。免税の基準は同一店舗・同一日の税抜合計 5,000 円以上です。',
      },
      q: {
        zh: '零食和化妝品可以合併算嗎？',
        ja: 'お菓子と化粧品は合算できますか。',
      },
      opts: [
        {
          label: {
            zh: '可以，新制不分商品種類',
            ja: 'できる。新制度では種類を問わない',
          },
          lose: 0,
          best: true,
          fb: {
            zh: '對。新制取消一般品和消耗品的區分，同一間店同一天合計滿 5,000 円就符合，消耗品原本的 50 萬円上限也一起取消了。',
            ja: '正解です。一般物品と消耗品の区分が廃止され、同一店舗・同一日の合計で判定します。消耗品の 50 万円上限も撤廃されました。',
          },
        },
        {
          label: {
            zh: '不行，食品和化妝品要各自滿 5,000',
            ja: '不可。それぞれ 5,000 円必要',
          },
          lose: 0,
          fb: {
            zh: '那是舊制的做法。2026 年 11 月起取消區分，全部合併算，所以這兩樣加起來 6,200 就達標了。',
            ja: '旧制度の考え方です。2026 年 11 月からは区分が廃止され、合算して判定します。',
          },
        },
      ],
    },
    {
      where: { zh: 'Day 1 · 結帳櫃檯', ja: '1 日目・レジ' },
      scene: {
        zh: '結帳了。零食你打算今天晚上在飯店吃掉。',
        ja: '会計です。お菓子は今夜ホテルで食べるつもりです。',
      },
      q: { zh: '怎麼結？', ja: 'どう会計しますか。' },
      opts: [
        {
          label: {
            zh: '全部一起結，開一張收據',
            ja: 'まとめて会計し、レシート 1 枚にする',
          },
          lose: 544,
          fb: {
            zh: '當晚你把零食吃掉了。查驗以一張收據為單位，零食拿不出來，同一張的面膜也一起失效，¥544 全部拿不回來。',
            ja: 'その夜お菓子を食べました。税関確認はレシート単位のため、同じレシートのパックも対象外になり ¥544 を失います。',
          },
        },
        {
          label: {
            zh: '零食和面膜分開結，變成兩張收據',
            ja: '分けて会計し、レシート 2 枚にする',
          },
          lose: 304,
          best: true,
          fb: {
            zh: '當晚你把零食吃掉了，但只有零食那張失效，面膜那張不受影響，損失縮到 ¥304。門檻是同店同日合計計算，分開結不影響達標，不過各店做法可能不同，結帳時先問店員。',
            ja: 'お菓子のレシートだけが対象外になり、損失は ¥304 のみ。5,000 円の判定は合算なので分けても影響しません。',
          },
        },
        {
          label: {
            zh: '不辦免稅，直接付含稅價',
            ja: '免税手続をせず税込で買う',
          },
          lose: 544,
          fb: {
            zh: '沒登記退款方式就沒有退稅資格，這兩樣的 ¥544 直接放棄。',
            ja: '返金方法を登録しなければ対象になりません。¥544 を放棄することになります。',
          },
        },
      ],
    },
    {
      where: { zh: 'Day 3 · 電器行', ja: '3 日目・家電量販店' },
      scene: {
        zh: '第三天，電器行。你買了一台稅抜 130,000 円的相機。',
        ja: '3 日目、家電量販店。税抜 130,000 円のカメラを購入しました。',
      },
      q: {
        zh: '要不要另外準備鑑定書或保證書？',
        ja: '鑑定書や保証書は必要ですか。',
      },
      opts: [
        {
          label: {
            zh: '要，這種價位海關一定會查',
            ja: '必要。この金額なら必ず求められる',
          },
          lose: 0,
          fb: {
            zh: '不用。門檻是稅抜單價 100 萬円，13 萬還差得遠。這台不需要另外準備文件。',
            ja: '不要です。基準は税抜単価 100 万円以上です。',
          },
        },
        {
          label: {
            zh: '不用，門檻是稅抜單價 100 萬円',
            ja: '不要。基準は税抜単価 100 万円以上',
          },
          lose: 0,
          best: true,
          fb: {
            zh: '對。稅抜單價滿 100 萬円的商品，海關才可能要求連同商品出示鑑定書或保證書。',
            ja: '正解です。税抜単価 100 万円以上の商品で求められることがあります。',
          },
        },
      ],
    },
    {
      where: { zh: 'Day 3 · 飯店', ja: '3 日目・ホテル' },
      scene: {
        zh: '同行的朋友說，他半年前來日本買的東西也想這次一起辦退稅。',
        ja: '同行者が、半年前に日本で買った物も今回まとめて手続したいと言っています。',
      },
      q: { zh: '可以嗎？', ja: '可能ですか。' },
      opts: [
        {
          label: {
            zh: '可以，同一本護照就好',
            ja: '可能。同じパスポートなら問題ない',
          },
          lose: 0,
          fb: {
            zh: '不行。要在購買日起 90 天內出境並完成海關查驗，半年前的已經過期了。',
            ja: 'できません。購入日から 90 日以内の出国と税関確認が必要です。',
          },
        },
        {
          label: {
            zh: '不行，超過購買日起 90 天',
            ja: '不可。購入日から 90 日を超えている',
          },
          lose: 0,
          best: true,
          fb: {
            zh: '對。期限是購買日起 90 天內出境並完成查驗，所以買完之後別拖太久。',
            ja: '正解です。購入日から 90 日以内に出国し確認を受ける必要があります。',
          },
        },
      ],
    },
    {
      where: { zh: 'Day 4 · 出發前', ja: '4 日目・出発前' },
      scene: {
        zh: '回國當天。班機下午三點起飛，你在飯店吃完午餐。',
        ja: '帰国当日。フライトは午後 3 時です。',
      },
      q: { zh: '幾點到機場？', ja: '何時に空港へ向かいますか。' },
      opts: [
        {
          label: { zh: '一點半到，抓一個半小時', ja: '1 時半到着。1 時間半前' },
          lose: 13000,
          fb: {
            zh: '太趕了。人潮多的時候光排隊就吃掉時間，你只辦完外套那張，相機那張還沒查驗就得去登機，¥13,000 沒了。時間不夠沒趕上，航空公司和海關都不會補償。',
            ja: '時間が足りません。カメラのレシートの確認が終わらず ¥13,000 を失います。',
          },
        },
        {
          label: { zh: '十二點到，抓三個小時', ja: '12 時到着。3 時間前' },
          lose: 0,
          best: true,
          fb: {
            zh: '穩。查驗如果被判定要檢查，還得到海關檢查場出示商品，時間要抓夠。先在 VJW 登記好的話，部分機場可以線上辦，不用排機台。',
            ja: '余裕があります。VJW に登録しておくと、一部の空港ではオンライン手続ができます。',
          },
        },
      ],
    },
    {
      where: { zh: 'Day 4 · 關西機場', ja: '4 日目・関西空港' },
      scene: {
        zh: '到了關西機場，外套和相機都在行李箱裡。',
        ja: '関西空港に到着。コートとカメラはスーツケースの中です。',
      },
      q: { zh: '先做哪一件？', ja: '先にどちらをしますか。' },
      opts: [
        {
          label: {
            zh: '先去航空公司櫃檯託運，手上輕鬆一點再辦',
            ja: '先に荷物を預けてから手続する',
          },
          lose: 15000,
          fb: {
            zh: '這樣就沒了。查驗要能拿出商品，而且一旦託運就不能把行李拉回來，外套和相機的 ¥15,000 全部退不了。',
            ja: 'これで終わりです。預けた荷物は引き戻せず ¥15,000 を失います。',
          },
        },
        {
          label: {
            zh: '先在出發大廳辦完海關查驗，再去託運',
            ja: '税関確認を済ませてから預ける',
          },
          lose: 0,
          best: true,
          fb: {
            zh: '對。機台就設在託運櫃檯前的國際線出發大廳，順序不能反。',
            ja: '正解です。端末は手荷物預け入れ前の出発ロビーにあります。',
          },
        },
      ],
    },
    {
      where: { zh: 'Day 4 · 免稅手續區', ja: '4 日目・免税手続カウンター' },
      scene: {
        zh: '排到機台前，你翻出那張有零食的收據。零食第一天晚上就進肚子了。',
        ja: '端末の前で、食べてしまったお菓子のレシートを取り出しました。',
      },
      q: {
        zh: '在機場怎麼處理這張？',
        ja: '空港でこのレシートをどうしますか。',
      },
      opts: [
        {
          label: {
            zh: '照樣拿去免稅手續機台掃描',
            ja: 'そのまま端末で手続する',
          },
          lose: 0,
          penalty: {
            zh: '商品已經不在還去辦手續，等於申報不實。被查出來會被追徵消費稅，還可能受罰。',
            ja: '所持していない物品で手続すると、消費税の追徴や罰則の対象になり得ます。',
          },
          fb: {
            zh: '不能這樣做。商品已經不在了還去辦手續，屬於申報不實，被追徵消費稅之外還可能受罰。',
            ja: 'これは不可です。追徴や罰則の対象になり得ます。',
          },
        },
        {
          label: {
            zh: '不辦手續，直接跟海關人員說明',
            ja: '手続をせず税関職員に申し出る',
          },
          lose: 0,
          best: true,
          fb: {
            zh: '正確。官方寫得很清楚，消耗品全部或一部分被消費掉的時候，不要用機台辦，直接向海關人員申報。順帶一提，拆開包裝、衣服穿過都不算消費，只要東西還在就能退。',
            ja: '正解です。消費した場合は端末を使わず税関職員に申し出ます。開封や着用は消費にあたりません。',
          },
        },
      ],
    },
    {
      where: { zh: 'Day 4 · 免稅手續機台', ja: '4 日目・手続端末' },
      scene: {
        zh: '你在機台掃描護照，畫面跳出紅色判定。',
        ja: '端末でパスポートを読み取ると、レッド判定が表示されました。',
      },
      q: { zh: '接下來？', ja: '次にどうしますか。' },
      opts: [
        {
          label: {
            zh: '紅色代表不能退，直接去託運',
            ja: 'レッドは対象外。そのまま預ける',
          },
          lose: 15000,
          fb: {
            zh: '誤會了。紅色只是代表要人工檢查，不是不能退。直接走掉等於沒完成查驗，¥15,000 拿不回來。',
            ja: '誤解です。レッドは検査が必要という意味です。未完了で ¥15,000 を失います。',
          },
        },
        {
          label: {
            zh: '到海關檢查場，把商品拿出來給海關看',
            ja: '税関検査場で商品を提示する',
          },
          lose: 0,
          best: true,
          fb: {
            zh: '對。綠色代表不用檢查、手續結束；紅色是要到檢查場出示商品，檢查完一樣能退。',
            ja: '正解です。グリーンは手続完了、レッドは検査場で提示すれば問題ありません。',
          },
        },
      ],
    },
  ],
};

/* ---------------- helpers ---------------- */

const yen = (n) => new Intl.NumberFormat('ja-JP').format(Math.round(n || 0));
const twd = (n) =>
  new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 }).format(
    Math.round(n || 0),
  );
const netOf = (incl, rate) =>
  Math.round((incl || 0) / (1 + (rate || 10) / 100));
/* 混合稅率（8% 對象／10% 對象各一筆）：稅抜合計 = 兩段各自試算後相加，不是拿含稅總額套單一稅率 */
const netOfItem = (it) =>
  it.rate === 'mixed'
    ? netOf(it.incl8 || 0, 8) + netOf(it.incl10 || 0, 10)
    : netOf(it.incl, it.rate);
const todayStr = () => new Date().toISOString().slice(0, 10);
const groupKey = (it) => `${(it.shop || '').trim()}||${it.date}`;

function daysLeft(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 90);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d - now) / 86400000);
}

function compressImage(file, maxSide = 1000, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------------- primitives ---------------- */

function FrogMark({ size = 30, color = C.sage, bg = C.page }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label="Kaeru"
    >
      {/* 頭部正面 */}
      <path
        d="M2.4 13.6C2.4 9.2 6.7 6.1 12 6.1s9.6 3.1 9.6 7.5c0 3.3-4.3 5.6-9.6 5.6s-9.6-2.3-9.6-5.6z"
        fill={color}
      />
      {/* 兩顆隆起的眼球 */}
      <circle cx="7.2" cy="6.3" r="3.5" fill={color} />
      <circle cx="16.8" cy="6.3" r="3.5" fill={color} />
      <circle cx="7.2" cy="5.9" r="1.35" fill={bg} />
      <circle cx="16.8" cy="5.9" r="1.35" fill={bg} />
      <circle cx="7.4" cy="5.9" r="0.62" fill={color} />
      <circle cx="16.6" cy="5.9" r="0.62" fill={color} />
      {/* 鼻孔 */}
      <circle cx="10.6" cy="11.4" r="0.55" fill={bg} opacity="0.7" />
      <circle cx="13.4" cy="11.4" r="0.55" fill={bg} opacity="0.7" />
      {/* 嘴 */}
      <path
        d="M6.6 14.1c1.9 2.4 8.9 2.4 10.8 0"
        stroke={bg}
        strokeWidth="0.95"
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
      />
    </svg>
  );
}

function Badge({ tone = 'line', size = 'md', children }) {
  const map = {
    line: { bg: C.soft, fg: C.sub },
    clay: { bg: C.clay, fg: '#FFFFFF' },
    sage: { bg: C.sage, fg: '#FFFFFF' },
    blue: { bg: C.blue, fg: '#FFFFFF' },
    outline: { bg: 'transparent', fg: C.sub, bd: C.line },
    mute: { bg: 'transparent', fg: C.sub, bd: C.sub },
  };
  const s = map[tone];
  const outlineLike = tone === 'outline' || tone === 'mute';
  const padding =
    size === 'lg' ? '4px 8px' : outlineLike ? '2px 6px' : '3px 7px';
  const fontSize = size === 'lg' ? '10.5px' : '10px';
  return (
    <span
      className="inline-flex items-center gap-1 font-semibold"
      style={{
        backgroundColor: s.bg,
        color: s.fg,
        fontSize,
        padding,
        borderRadius: '3px',
        border: s.bd ? `1px solid ${s.bd}` : '1px solid transparent',
      }}
    >
      {children}
    </span>
  );
}

/* 票券：四方角、細框、上緣虛線裁切 */
/* 一組（同店同日）收據共用一個外框，票券感只靠內部虛線分隔——見 ListView 的呼叫方式 */
function Ticket({ children, tone = 'normal', onClick, separator }) {
  const bg = tone === 'dead' ? C.soft : '#FFFFFF';
  const El = onClick ? 'button' : 'div';
  return (
    <El
      onClick={onClick}
      className="block w-full px-3.5 pb-3.5 pt-3 text-left"
      style={{
        backgroundColor: bg,
        borderTop: separator ? `1px dashed ${C.line}` : 'none',
        borderRadius: 0,
      }}
    >
      {children}
    </El>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span
          className="font-bold"
          style={{ color: C.blue, fontSize: '10.5px', letterSpacing: '0.22em' }}
        >
          {label}
        </span>
        {hint && (
          <span className="text-xs" style={{ color: C.sub }}>
            {hint}
          </span>
        )}
      </div>
      {children}
    </label>
  );
}

/* 底線式輸入：無框、無底色，focus 時底線轉 ink（見 App 頂層的 .jp-underline 樣式） */
function Input(props) {
  return (
    <input
      {...props}
      className="jp-underline w-full bg-transparent outline-none"
      style={{
        border: 'none',
        borderBottom: `1px solid ${C.line}`,
        color: C.ink,
        padding: '0 0 10px',
        fontSize: '16px',
      }}
    />
  );
}

function Card({ children, style, ...rest }) {
  return (
    <div
      {...rest}
      className={`py-4 ${rest.className || ''}`}
      style={{ borderTop: `1px solid ${C.line}`, ...style }}
    >
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label, hint, warn }) {
  const on = checked;
  const bg = warn ? (on ? C.claySoft : '#FFFFFF') : on ? C.blueSoft : '#FFFFFF';
  const bd = warn ? C.clay : on ? C.blue : C.line;
  const fg = warn ? C.clayInk : on ? C.blueDeep : C.ink;
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 text-left"
      style={{
        backgroundColor: bg,
        border: `1px solid ${bd}`,
        borderRadius: 0,
        padding: '13px 14px',
      }}
    >
      <span>
        <span className="block" style={{ color: fg, fontSize: '15px' }}>
          {label}
        </span>
        {hint && (
          <span className="mt-0.5 block text-xs" style={{ color: C.sub }}>
            {hint}
          </span>
        )}
      </span>
      <span
        className="relative shrink-0"
        style={{
          width: '34px',
          height: '18px',
          backgroundColor: on ? (warn ? C.clay : C.blue) : C.line,
          borderRadius: 0,
        }}
      >
        <span
          className="absolute transition-transform"
          style={{
            top: '2px',
            left: '2px',
            width: '14px',
            height: '14px',
            backgroundColor: '#FFFFFF',
            transform: on ? 'translateX(16px)' : 'translateX(0)',
          }}
        />
      </span>
    </button>
  );
}

function StageRail({ status, t }) {
  const idx = STAGES.indexOf(status);
  return (
    <div className="flex items-center gap-1.5">
      {STAGES.map((s, i) => (
        <div key={s} className="flex items-center gap-1.5">
          <div
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: i <= idx ? C.blue : C.line }}
          />
          {i < STAGES.length - 1 && (
            <div
              className="h-px w-4"
              style={{ backgroundColor: i < idx ? C.blue : C.line }}
            />
          )}
        </div>
      ))}
      <span className="ml-1 text-xs" style={{ color: C.sub }}>
        {t.stage[status]}
      </span>
    </div>
  );
}

function Notice({ tone = 'clay', children }) {
  const s =
    tone === 'clay'
      ? { bg: C.claySoft, fg: C.clayInk }
      : { bg: C.blueSoft, fg: C.blueDeep };
  return (
    <p
      className="flex gap-2 rounded-xl p-3 text-xs leading-relaxed"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/* ---------------- date picker ---------------- */

const pad2 = (n) => String(n).padStart(2, '0');
const dateOf = (v) => (v ? v.slice(0, 10) : '');
const timeOf = (v) => (v && v.length >= 16 ? v.slice(11, 16) : '');

function Calendar({ value, onPick, t }) {
  const seed = value ? new Date(dateOf(value) + 'T00:00:00') : new Date();
  const [view, setView] = useState(
    new Date(seed.getFullYear(), seed.getMonth(), 1),
  );

  const y = view.getFullYear();
  const m = view.getMonth();
  const first = new Date(y, m, 1).getDay();
  const total = new Date(y, m + 1, 0).getDate();
  const selected = dateOf(value);
  const today = todayStr();

  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(d);

  const shift = (n) => setView(new Date(y, m + n, 1));

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          onClick={() => shift(-1)}
          className="rounded-lg p-1.5"
          style={{ color: C.sub }}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-bold tabular-nums">
          {y} / {pad2(m + 1)}
        </span>
        <button
          onClick={() => shift(1)}
          className="rounded-lg p-1.5"
          style={{ color: C.sub }}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-y-1">
        {t.weekdays.map((w, i) => (
          <span
            key={i}
            className="pb-1 text-center text-xs"
            style={{ color: C.sub }}
          >
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <span key={i} />;
          const iso = `${y}-${pad2(m + 1)}-${pad2(d)}`;
          const on = iso === selected;
          const isToday = iso === today;
          return (
            <button
              key={i}
              onClick={() => onPick(iso)}
              className="mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm tabular-nums"
              style={{
                backgroundColor: on ? C.blue : 'transparent',
                color: on ? '#FFFFFF' : C.ink,
                border:
                  !on && isToday
                    ? `1px solid ${C.blue}`
                    : '1px solid transparent',
              }}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimeRow({ value, onChange, t }) {
  const [hh, mm] = (value || '00:00').split(':');
  const sel = {
    backgroundColor: '#FFFFFF',
    border: `1px solid ${C.line}`,
    color: C.ink,
    fontFamily: 'inherit',
  };
  return (
    <div
      className="mt-4 flex items-center gap-2"
      style={{ borderTop: `1px solid ${C.line}`, paddingTop: '1rem' }}
    >
      <span className="text-xs" style={{ color: C.sub }}>
        {t.time}
      </span>
      <select
        value={hh}
        onChange={(e) => onChange(`${e.target.value}:${mm}`)}
        className="rounded-lg px-2 py-1.5 text-sm tabular-nums outline-none"
        style={sel}
      >
        {Array.from({ length: 24 }, (_, i) => pad2(i)).map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span style={{ color: C.sub }}>:</span>
      <select
        value={mm}
        onChange={(e) => onChange(`${hh}:${e.target.value}`)}
        className="rounded-lg px-2 py-1.5 text-sm tabular-nums outline-none"
        style={sel}
      >
        {Array.from({ length: 12 }, (_, i) => pad2(i * 5)).map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
    </div>
  );
}

function DateField({ value, onChange, t, withTime, fontSize = '16px' }) {
  const [open, setOpen] = useState(false);
  const label = value
    ? withTime
      ? `${dateOf(value).replace(/-/g, '/')}  ${timeOf(value) || '00:00'}`
      : dateOf(value).replace(/-/g, '/')
    : withTime
      ? t.pickDateTime
      : t.pickDate;

  const set = (d, tm) => {
    if (!d) return onChange('');
    onChange(withTime ? `${d}T${tm || timeOf(value) || '00:00'}` : d);
  };

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between pb-2.5 text-left"
        style={{
          borderBottom: `1px solid ${open ? C.ink : C.line}`,
          color: value ? C.ink : C.sub,
        }}
      >
        <span className="font-semibold tabular-nums" style={{ fontSize }}>
          {label}
        </span>
        <CalIcon size={16} style={{ color: C.sub }} />
      </button>

      {open && (
        <div
          className="mt-2 p-3.5"
          style={{
            backgroundColor: C.soft,
            border: `1px solid ${C.line}`,
            borderRadius: 0,
          }}
        >
          <Calendar value={value} onPick={(d) => set(d)} t={t} />
          {withTime && (
            <TimeRow
              value={timeOf(value) || '00:00'}
              onChange={(tm) => set(dateOf(value) || todayStr(), tm)}
              t={t}
            />
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => set(todayStr())}
              className="flex-1 py-2 text-xs"
              style={{
                border: `1px solid ${C.line}`,
                color: C.ink,
                backgroundColor: '#FFFFFF',
                borderRadius: 0,
              }}
            >
              {t.today}
            </button>
            <button
              onClick={() => onChange('')}
              className="flex-1 py-2 text-xs"
              style={{
                border: `1px solid ${C.line}`,
                color: C.sub,
                backgroundColor: '#FFFFFF',
                borderRadius: 0,
              }}
            >
              {t.clearDate}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="flex-1 py-2 text-xs font-medium"
              style={{
                backgroundColor: C.blue,
                color: '#FFFFFF',
                borderRadius: 0,
              }}
            >
              {t.doneDate}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- app ---------------- */

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [items, setItems] = useState([]);
  const [photos, setPhotos] = useState({});
  const [settings, setSettings] = useState({
    rate: 0.21,
    rateAt: null,
    lang: 'zh',
  });
  const [trips, setTrips] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [tripSheet, setTripSheet] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState('home');
  const [editing, setEditing] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [quizOn, setQuizOn] = useState(false);
  const [rateBusy, setRateBusy] = useState(false);
  const [rateErr, setRateErr] = useState(false);

  const lang = settings.lang;
  const t = T[lang];

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(MAIN_KEY);
        if (r && r.value) {
          const parsed = JSON.parse(r.value);
          const list = parsed.items || [];
          const savedSettings = parsed.settings || {};
          let tripList = parsed.trips || [];
          let active = parsed.activeId || null;

          if (!tripList.length) {
            const id = `t_${Date.now()}`;
            tripList = [
              { id, name: '', departure: savedSettings.departure || '' },
            ];
            active = id;
          }
          if (!active || !tripList.some((x) => x.id === active))
            active = tripList[0].id;

          const fallback = active;
          const migrated = list.map((it) =>
            it.tripId ? it : { ...it, tripId: fallback },
          );

          setTrips(tripList);
          setActiveId(active);
          setItems(migrated);
          delete savedSettings.departure;
          setSettings((s) => ({ ...s, ...savedSettings }));
          const map = {};
          for (const it of list.filter((i) => i.hasPhoto)) {
            try {
              const p = await window.storage.get(photoKey(it.id));
              if (p && p.value) map[it.id] = p.value;
            } catch (e) {}
          }
          setPhotos(map);
        }
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded || trips.length) return;
    const id = `t_${Date.now()}`;
    setTrips([{ id, name: '', departure: '' }]);
    setActiveId(id);
  }, [loaded, trips.length]);

  useEffect(() => {
    if (!loaded) return;
    window.storage
      .set(MAIN_KEY, JSON.stringify({ items, settings, trips, activeId }))
      .catch(() => {});
  }, [items, settings, trips, activeId, loaded]);

  const activeTrip = trips.find((x) => x.id === activeId) || null;
  const tripItems = useMemo(
    () => items.filter((it) => it.tripId === activeId),
    [items, activeId],
  );

  const groups = useMemo(() => {
    const m = new Map();
    for (const it of tripItems) {
      const k = groupKey(it);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(it);
    }
    const out = new Map();
    for (const [k, arr] of m) {
      const net = arr.reduce((s, i) => s + netOfItem(i), 0);
      out.set(k, { arr, net, ok: net >= 5000 });
    }
    return out;
  }, [tripItems]);

  function taxOf(it) {
    if (
      it.taxOverride !== null &&
      it.taxOverride !== undefined &&
      it.taxOverride !== ''
    )
      return Number(it.taxOverride) || 0;
    return (it.incl || 0) - netOfItem(it);
  }

  const stats = useMemo(() => {
    let totalIncl = 0,
      refundable = 0,
      pendingCount = 0,
      minDays = null;
    for (const it of tripItems) {
      totalIncl += it.incl || 0;
      const g = groups.get(groupKey(it));
      const eligible = g && g.ok && !it.consumed;
      if (eligible && it.status !== 'refunded') refundable += taxOf(it);
      if (it.status !== 'refunded') {
        pendingCount++;
        const d = daysLeft(it.date);
        if (d !== null && (minDays === null || d < minDays)) minDays = d;
      }
    }
    return { totalIncl, refundable, pendingCount, minDays };
  }, [tripItems, groups]);

  function upsert(input, photoData) {
    const item = { ...input, tripId: input.tripId || activeId };
    setItems((prev) =>
      prev.some((p) => p.id === item.id)
        ? prev.map((p) => (p.id === item.id ? item : p))
        : [item, ...prev],
    );
    if (photoData !== undefined) {
      if (photoData) {
        setPhotos((p) => ({ ...p, [item.id]: photoData }));
        window.storage.set(photoKey(item.id), photoData).catch(() => {});
      } else {
        setPhotos((p) => {
          const n = { ...p };
          delete n[item.id];
          return n;
        });
        window.storage.delete(photoKey(item.id)).catch(() => {});
      }
    }
  }

  function remove(id) {
    setItems((prev) => prev.filter((p) => p.id !== id));
    setPhotos((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });
    window.storage.delete(photoKey(id)).catch(() => {});
    setOpenId(null);
  }

  async function fetchRate() {
    setRateBusy(true);
    setRateErr(false);
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/JPY');
      const d = await res.json();
      const v = d && d.rates && d.rates.TWD;
      if (!v) throw new Error('no rate');
      setSettings((s) => ({
        ...s,
        rate: Number(v.toFixed(4)),
        rateAt: new Date().toISOString(),
      }));
    } catch (e) {
      setRateErr(true);
    }
    setRateBusy(false);
  }

  if (!loaded) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ backgroundColor: C.bg, color: C.sub, fontFamily: FONT }}
      >
        {T.zh.loading}
      </div>
    );
  }

  const openItem = items.find((i) => i.id === openId);

  return (
    <div
      style={{
        minHeight: '100dvh',
        overflowX: 'hidden',
        backgroundColor: C.bg,
        color: C.ink,
        fontFamily: FONT,
        letterSpacing: '0.01em',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <style>{`.jp-underline:focus{border-color:${C.ink} !important}
        input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
        input[type=number]{-moz-appearance:textfield}
        /* RWD：單欄置中，320–480 隨欄寬，480 以上鎖寬只加留白，<390 整體等比縮放 */
        .kaeru-app{width:100%;max-width:480px;margin-inline:auto;min-height:100dvh;display:flex;flex-direction:column}
        @media (min-width:768px){.kaeru-app{border-left:1px solid ${C.line};border-right:1px solid ${C.line}}}
        @media (max-width:389.98px){.kaeru-app{width:390px;zoom:calc(100vw / 390)}}
        .kaeru-pad{padding-left:26px;padding-right:26px}
        @media (min-width:480px){.kaeru-pad{padding-left:30px;padding-right:30px}}
        .kaeru-bignum{font-size:48px}
        @media (min-width:480px){.kaeru-bignum{font-size:52px}}
        .kaeru-refund{font-size:42px}
        @media (min-width:480px){.kaeru-refund{font-size:46px}}
        .kaeru-group-gap{display:flex;flex-direction:column;gap:18px}
        @media (min-width:480px){.kaeru-group-gap{gap:22px}}`}</style>
      <div
        className="kaeru-app"
        style={{
          backgroundColor: C.page,
          opacity: tripSheet ? 0.35 : 1,
          transition: 'opacity 200ms',
        }}
      >
        {!(tab === 'faq' && quizOn) && (
          <header
            className="kaeru-pad sticky top-0 z-30 pb-3"
            style={{
              backgroundColor: C.page,
              borderBottom: `1px solid ${C.line}`,
              paddingTop: 'max(14px, env(safe-area-inset-top))',
            }}
          >
            <div className="flex items-end justify-between">
              {tab === 'home' ? (
                <div className="flex items-center gap-2.5">
                  <FrogMark size={26} />
                  <div>
                    <h1
                      className="font-semibold"
                      style={{
                        color: C.blueDeep,
                        fontSize: '12.5px',
                        letterSpacing: '0.28em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {t.appName}
                    </h1>
                    <button
                      onClick={() => setTripSheet(true)}
                      className="mt-0.5 flex items-center gap-1 text-xs"
                      style={{ color: C.sub }}
                    >
                      {activeTrip && activeTrip.name
                        ? activeTrip.name
                        : t.trips}
                      <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              ) : (
                <h1
                  className="font-bold"
                  style={{ fontSize: '20px', color: C.ink }}
                >
                  {
                    {
                      list: t.receipts,
                      check: t.checkTitle,
                      faq: t.faqTitle,
                      set: t.settings,
                    }[tab]
                  }
                </h1>
              )}
              <div className="relative flex items-center gap-0.5">
                <button
                  onClick={() => setEditing('new')}
                  className="rounded-lg p-2"
                  style={{ color: C.ink }}
                  aria-label={t.menuAdd}
                >
                  <Plus size={20} />
                </button>

                <button
                  onClick={() => {
                    setTab('list');
                    setQuizOn(false);
                  }}
                  className="rounded-lg p-2"
                  style={{ color: tab === 'list' ? C.blue : C.ink }}
                  aria-label={t.nav.list}
                >
                  <Rows3 size={19} strokeWidth={tab === 'list' ? 2.2 : 1.8} />
                </button>

                <span
                  className="mx-1 h-4 w-px"
                  style={{ backgroundColor: C.line }}
                />

                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="rounded-lg p-2"
                  style={{ color: menuOpen ? C.blue : C.ink }}
                  aria-label={t.menu}
                >
                  {menuOpen ? <X size={20} /> : <Menu size={20} />}
                </button>

                {menuOpen && (
                  <MenuDropdown
                    t={t}
                    lang={lang}
                    tab={tab}
                    trip={activeTrip}
                    onClose={() => setMenuOpen(false)}
                    onGo={(k) => {
                      setTab(k);
                      setQuizOn(false);
                      setMenuOpen(false);
                    }}
                    onAdd={() => {
                      setMenuOpen(false);
                      setEditing('new');
                    }}
                    onTrips={() => {
                      setMenuOpen(false);
                      setTripSheet(true);
                    }}
                    onLang={() =>
                      setSettings((s) => ({
                        ...s,
                        lang: s.lang === 'zh' ? 'ja' : 'zh',
                      }))
                    }
                  />
                )}
              </div>
            </div>
          </header>
        )}

        <main className="flex-1 kaeru-pad py-4">
          {tab === 'home' && (
            <HomeView
              t={t}
              stats={stats}
              settings={settings}
              trip={activeTrip}
              hasItems={tripItems.length > 0}
              onAdd={() => setEditing('new')}
              onGoSettings={() => setTab('set')}
            />
          )}

          {tab === 'list' && (
            <ListView
              t={t}
              items={tripItems}
              groups={groups}
              taxOf={taxOf}
              settings={settings}
              onOpen={setOpenId}
              onAdd={() => setEditing('new')}
            />
          )}

          {tab === 'check' && (
            <CheckView
              t={t}
              items={tripItems}
              groups={groups}
              taxOf={taxOf}
              onVerifyOne={(id) =>
                setItems((prev) =>
                  prev.map((p) =>
                    p.id === id ? { ...p, status: 'verified' } : p,
                  ),
                )
              }
              onVerifyAll={() =>
                setItems((prev) =>
                  prev.map((it) => {
                    if (it.tripId !== activeId) return it;
                    const g = groups.get(groupKey(it));
                    const eligible = g && g.ok && !it.consumed;
                    return eligible &&
                      (it.status === 'purchased' || it.status === 'registered')
                      ? { ...it, status: 'verified' }
                      : it;
                  }),
                )
              }
            />
          )}

          {tab === 'faq' &&
            (quizOn ? (
              <Scenario t={t} lang={lang} onExit={() => setQuizOn(false)} />
            ) : (
              <FaqView t={t} lang={lang} onStart={() => setQuizOn(true)} />
            ))}

          {tab === 'set' && (
            <SettingsView
              t={t}
              settings={settings}
              setSettings={setSettings}
              trip={activeTrip}
              count={tripItems.length}
              onTripChange={(patch) =>
                setTrips((prev) =>
                  prev.map((x) => (x.id === activeId ? { ...x, ...patch } : x)),
                )
              }
              onOpenTrips={() => setTripSheet(true)}
              onFetchRate={fetchRate}
              rateBusy={rateBusy}
              rateErr={rateErr}
              onClear={() => {
                setItems([]);
                setPhotos({});
              }}
            />
          )}
        </main>
      </div>

      {tripSheet && (
        <TripSheet
          t={t}
          trips={trips}
          activeId={activeId}
          items={items}
          onClose={() => setTripSheet(false)}
          onSelect={(id) => {
            setActiveId(id);
            setTripSheet(false);
          }}
          onCreate={(name, departure) => {
            const id = `t_${Date.now()}`;
            setTrips((prev) => [...prev, { id, name, departure }]);
            setActiveId(id);
            setTripSheet(false);
          }}
          onDelete={(id) => {
            const rest = trips.filter((x) => x.id !== id);
            items
              .filter((i) => i.tripId === id)
              .forEach((i) => {
                window.storage.delete(photoKey(i.id)).catch(() => {});
              });
            setItems((prev) => prev.filter((i) => i.tripId !== id));
            setTrips(rest);
            if (activeId === id) setActiveId(rest.length ? rest[0].id : null);
          }}
        />
      )}

      {editing && (
        <EditSheet
          t={t}
          initial={editing === 'new' ? null : editing}
          photo={editing === 'new' ? null : photos[editing.id]}
          onClose={() => setEditing(null)}
          onSave={(item, photoData) => {
            upsert(item, photoData);
            setEditing(null);
          }}
        />
      )}

      {openItem && (
        <DetailSheet
          t={t}
          item={openItem}
          group={groups.get(groupKey(openItem))}
          photo={photos[openItem.id]}
          taxOf={taxOf}
          settings={settings}
          onClose={() => setOpenId(null)}
          onEdit={(it) => {
            setOpenId(null);
            setEditing(it);
          }}
          onStatus={(st) =>
            setItems((prev) =>
              prev.map((p) => (p.id === openId ? { ...p, status: st } : p)),
            )
          }
          onDelete={() => remove(openId)}
        />
      )}
    </div>
  );
}

/* ---------------- views ---------------- */

function HomeView({ t, stats, settings, trip, hasItems, onAdd, onGoSettings }) {
  const dep = trip && trip.departure ? new Date(trip.departure) : null;
  const diffMs = dep ? dep - new Date() : null;
  const dDays = diffMs !== null ? Math.floor(diffMs / 86400000) : null;
  const dHours =
    diffMs !== null ? Math.floor((diffMs % 86400000) / 3600000) : null;
  const arriveBy = dep ? new Date(dep.getTime() - 3 * 3600000) : null;
  const fmt = (d) =>
    d
      ? `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      : '';

  return (
    <div className="space-y-10 pb-6">
      <section className="pt-2">
        {dep && diffMs > 0 ? (
          <>
            <p
              style={{
                color: C.sub,
                fontSize: '10.5px',
                letterSpacing: '0.24em',
              }}
            >
              {t.departIn}
            </p>
            <p
              className="mt-2 flex items-baseline tabular-nums"
              style={{ letterSpacing: '-0.01em' }}
            >
              <span
                className="kaeru-bignum font-semibold"
                style={{ color: C.ink, lineHeight: 1 }}
              >
                {dDays}
              </span>
              <span
                style={{
                  color: C.ink,
                  fontSize: '16px',
                  fontWeight: 500,
                  marginLeft: '4px',
                  marginRight: '12px',
                }}
              >
                {t.days}
              </span>
              <span
                className="kaeru-bignum font-semibold"
                style={{ color: C.ink, lineHeight: 1 }}
              >
                {dHours}
              </span>
              <span
                style={{
                  color: C.ink,
                  fontSize: '16px',
                  fontWeight: 500,
                  marginLeft: '4px',
                }}
              >
                {t.hours}
              </span>
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <Badge tone="blue">
                {t.arriveTagPre}
                {fmt(arriveBy)}
                {t.arriveTagSuf}
              </Badge>
              <Badge tone="clay">{t.checkinBadge}</Badge>
            </div>
          </>
        ) : (
          <button
            onClick={onGoSettings}
            className="flex w-full items-center justify-between text-left"
          >
            <span>
              <span className="block text-base font-semibold">
                {t.setDeparture}
              </span>
              <span className="mt-1 block text-xs" style={{ color: C.sub }}>
                {t.beforeCheckin}
              </span>
            </span>
            <ChevronRight size={18} style={{ color: C.sub }} />
          </button>
        )}
      </section>

      <section
        style={{
          borderTop: `1px solid ${C.ink}`,
          borderBottom: `1px solid ${C.ink}`,
        }}
      >
        <Row label={t.totalSpent} align="baseline">
          <span
            className="font-semibold tabular-nums"
            style={{ color: C.ink, fontSize: '24px' }}
          >
            ¥{yen(stats.totalIncl)}
          </span>
        </Row>

        <Row
          label={t.estRefund}
          sub={`≈ NT$${twd(stats.refundable * settings.rate)}`}
          align="end"
        >
          <span
            className="kaeru-refund font-semibold tabular-nums"
            style={{ color: C.blueDeep, lineHeight: 1 }}
          >
            ¥{yen(stats.refundable)}
          </span>
        </Row>

        <Row label={t.pending}>
          {stats.pendingCount > 0 && (
            <Badge tone="blue" size="lg">
              {t.tripNow}
            </Badge>
          )}
          <span className="tabular-nums">
            <span
              className="font-semibold"
              style={{ color: C.ink, fontSize: '24px' }}
            >
              {stats.pendingCount}
            </span>
            <span className="ml-1 text-xs" style={{ color: C.sub }}>
              {t.itemsUnit}
            </span>
          </span>
        </Row>

        <Row label={t.nearestDeadline} last>
          {stats.minDays === null ? (
            <span className="text-sm" style={{ color: C.sub }}>
              {t.noDeadline}
            </span>
          ) : (
            <>
              <Badge tone={stats.minDays <= 14 ? 'clay' : 'outline'} size="lg">
                {t.dueLeft} {stats.minDays} {t.days}
              </Badge>
              <span className="tabular-nums">
                <span
                  className="font-semibold"
                  style={{ color: C.ink, fontSize: '24px' }}
                >
                  {stats.minDays}
                </span>
                <span className="ml-1 text-xs" style={{ color: C.sub }}>
                  {t.days}
                </span>
              </span>
            </>
          )}
        </Row>
      </section>

      {!hasItems && (
        <section>
          <p className="text-sm leading-7" style={{ color: C.sub }}>
            {t.emptyHome}
          </p>
          <button
            onClick={onAdd}
            className="mt-4 w-full py-3 text-sm font-semibold"
            style={{
              backgroundColor: C.blue,
              color: '#FFFFFF',
              borderRadius: 0,
            }}
          >
            {t.addFirst}
          </button>
        </section>
      )}

      <section>
        <h3
          className="font-bold"
          style={{ color: C.blue, fontSize: '10.5px', letterSpacing: '0.24em' }}
        >
          {t.departChecklist}
        </h3>
        <ol
          className="mt-4"
          style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          {[t.step1, t.step2, t.step3, t.step4].map((x, n) => (
            <li key={n} className="flex" style={{ gap: '14px' }}>
              <span
                className="shrink-0 font-bold tabular-nums"
                style={{ color: C.blue, fontSize: '11px' }}
              >
                {String(n + 1).padStart(2, '0')}
              </span>
              <span style={{ fontSize: '13px', lineHeight: 1.75 }}>{x}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Row({ label, sub, last, align = 'center', children }) {
  return (
    <div
      className="flex justify-between gap-3 py-3"
      style={{
        borderBottom: last ? 'none' : `1px solid ${C.line}`,
        alignItems:
          align === 'end'
            ? 'flex-end'
            : align === 'baseline'
              ? 'baseline'
              : 'center',
      }}
    >
      <span>
        <span className="block" style={{ color: C.sub, fontSize: '12.5px' }}>
          {label}
        </span>
        {sub && (
          <span
            className="mt-0.5 block tabular-nums"
            style={{ color: C.sub, fontSize: '11px' }}
          >
            {sub}
          </span>
        )}
      </span>
      <span className="flex items-center" style={{ gap: '9px' }}>
        {children}
      </span>
    </div>
  );
}

function ListView({ t, items, groups, taxOf, settings, onOpen, onAdd }) {
  const [filter, setFilter] = useState('all');

  if (!items.length) {
    return (
      <div
        className="rounded-2xl p-6 text-center"
        style={{ backgroundColor: C.card, border: `1px dashed ${C.line}` }}
      >
        <p className="text-sm" style={{ color: C.sub }}>
          {t.emptyList}
        </p>
        <button
          onClick={onAdd}
          className="mt-3 rounded-lg px-4 py-2 text-sm font-medium"
          style={{ backgroundColor: C.blue, color: '#FFFFFF' }}
        >
          {t.addReceipt}
        </button>
      </div>
    );
  }

  const match = (it) => {
    const g = groups.get(groupKey(it));
    if (filter === 'all') return true;
    if (filter === 'short') return !(g && g.ok);
    if (filter === 'done') return it.status === 'refunded';
    if (filter === 'todo') return it.status !== 'refunded';
    return true;
  };

  const keys = Array.from(groups.keys())
    .filter((k) => groups.get(k).arr.some(match))
    .sort((a, b) => b.split('||')[1].localeCompare(a.split('||')[1]));

  return (
    <div className="space-y-4">
      <div
        className="flex"
        style={{ gap: '16px', borderBottom: `1px solid ${C.line}` }}
      >
        {['all', 'todo', 'short', 'done'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="shrink-0 pb-2.5"
            style={{
              fontSize: '12.5px',
              fontWeight: filter === f ? 700 : 500,
              color: filter === f ? C.ink : C.sub,
              borderBottom:
                filter === f ? `2px solid ${C.ink}` : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {t.filters[f]}
          </button>
        ))}
      </div>

      {!keys.length && (
        <p
          className="rounded-xl p-6 text-center text-sm"
          style={{
            backgroundColor: C.card,
            color: C.sub,
            border: `1px dashed ${C.line}`,
          }}
        >
          {t.noMatch}
        </p>
      )}

      <div className="kaeru-group-gap">
        {keys.map((k) => {
          const g = groups.get(k);
          const [shop, date] = k.split('||');
          return (
            <section key={k}>
              <div
                className="flex items-end justify-between gap-3 pb-2"
                style={{ borderBottom: `1px solid ${g.ok ? C.ink : C.clay}` }}
              >
                <div className="min-w-0">
                  <h3
                    className="truncate font-bold"
                    style={{ fontSize: '13.5px' }}
                  >
                    {shop || '—'}
                  </h3>
                  <p
                    className="tabular-nums"
                    style={{ color: C.sub, fontSize: '11px' }}
                  >
                    {date} · {g.arr.length} {t.itemsUnit}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className="tabular-nums"
                    style={{ color: C.sub, fontSize: '11px' }}
                  >
                    {t.netTotal} ¥{yen(g.net)}
                  </p>
                  <span className="mt-1 inline-block">
                    {g.ok ? (
                      <Badge tone="sage">{t.reached}</Badge>
                    ) : (
                      <Badge tone="clay">
                        {t.short} ¥{yen(5000 - g.net)}
                      </Badge>
                    )}
                  </span>
                </div>
              </div>
              <div style={{ border: `1px solid ${C.line}` }}>
                {g.arr.filter(match).map((it, i) => (
                  <ReceiptCard
                    key={it.id}
                    it={it}
                    t={t}
                    taxOf={taxOf}
                    settings={settings}
                    groupOk={g.ok}
                    separator={i > 0}
                    onClick={() => onOpen(it.id)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ReceiptCard({ it, t, taxOf, settings, groupOk, separator, onClick }) {
  const d = daysLeft(it.date);
  const tax = taxOf(it);
  const dead = !!it.consumed;
  const warn = !dead && !groupOk;
  const stageIdx = STAGES.indexOf(it.status);
  const deadlineText =
    d === null ? null : d < 0 ? t.expired : `${t.warnDeadline} ${d} ${t.days}`;
  const showDeadlineBadge = !dead && d !== null && d <= 30;
  const showPendingBadge = !dead && !warn && stageIdx < 2;
  const tone = warn ? C.clay : C.blue;

  return (
    <Ticket
      tone={dead ? 'dead' : 'normal'}
      onClick={onClick}
      separator={separator}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p
          className="font-semibold tabular-nums"
          style={{
            fontSize: '18px',
            color: dead ? C.sub : C.ink,
            textDecoration: dead ? 'line-through' : 'none',
            textDecorationColor: dead ? C.clay : 'currentColor',
          }}
        >
          ¥{yen(it.incl)}
        </p>
        <p className="tabular-nums" style={{ color: C.sub, fontSize: '11px' }}>
          {t.taxAmount} ¥{yen(tax)}
          {dead ? ` ${t.lostTax}` : ` ≈ NT$${twd(tax * settings.rate)}`}
        </p>
      </div>

      {/* 四段進度：7×7px 方點，中間連線撐滿。已消費時第一點填色、其餘變空心 */}
      <div className="mt-2.5 flex items-center">
        {STAGES.map((sname, n) => (
          <div key={sname} className="flex flex-1 items-center last:flex-none">
            <div
              className="shrink-0"
              style={
                dead
                  ? n === 0
                    ? { width: '7px', height: '7px', backgroundColor: C.clay }
                    : {
                        width: '7px',
                        height: '7px',
                        border: `1px solid ${C.line}`,
                        backgroundColor: '#FFFFFF',
                      }
                  : {
                      width: '7px',
                      height: '7px',
                      backgroundColor: n <= stageIdx ? tone : C.line,
                    }
              }
            />
            {n < STAGES.length - 1 && (
              <div
                style={{
                  height: '1px',
                  flex: 1,
                  backgroundColor:
                    !dead && n < stageIdx ? tone : C.line,
                }}
              />
            )}
          </div>
        ))}
      </div>

      {dead ? (
        <p
          className="mt-1.5"
          style={{ color: C.clayInk, fontSize: '9.5px', fontWeight: 600 }}
        >
          {t.stalled}
        </p>
      ) : (
        <div className="mt-1.5 flex justify-between" style={{ fontSize: '9.5px' }}>
          {STAGES.map((sname, n) =>
            n === stageIdx ? (
              <span
                key={sname}
                className="font-semibold"
                style={{ color: warn ? C.clayInk : C.blueDeep }}
              >
                {warn ? `${t.stuckAt}${t.stageShort[sname]}` : t.stageShort[sname]}
              </span>
            ) : (
              <span key={sname} style={{ color: C.sub }}>
                {t.stageShort[sname]}
              </span>
            )
          )}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {dead ? (
          <>
            <Badge tone="clay">{t.consumedShort}</Badge>
            <Badge tone="clay">{t.dead}</Badge>
            {it.unpacked && <Badge tone="outline">{t.unpackedShort}</Badge>}
          </>
        ) : warn ? (
          <>
            <Badge tone="clay">{t.notReached}</Badge>
            <Badge tone="outline">{t.refillTip}</Badge>
          </>
        ) : (
          <>
            {showPendingBadge && <Badge tone="blue">{t.pendingCheck}</Badge>}
            {it.unpacked && <Badge tone="outline">{t.unpackedShort}</Badge>}
            {showDeadlineBadge && (
              <Badge tone={d <= 14 ? 'clay' : 'outline'}>{deadlineText}</Badge>
            )}
            {netOfItem(it) >= 1000000 && <Badge tone="blue">100万円+</Badge>}
          </>
        )}
      </div>

      {dead && (
        <p
          className="mt-2.5"
          style={{ color: C.clayInk, fontSize: '11.5px', lineHeight: 1.8 }}
        >
          {t.deadCardNote}
        </p>
      )}
    </Ticket>
  );
}

function CheckView({ t, items, groups, taxOf, onVerifyAll, onVerifyOne }) {
  const eligible = items.filter((it) => {
    const g = groups.get(groupKey(it));
    return g && g.ok && !it.consumed;
  });
  const todo = eligible
    .filter((it) => it.status === 'purchased' || it.status === 'registered')
    .sort((a, b) => a.date.localeCompare(b.date));
  const done = eligible.length - todo.length;
  const total = todo.reduce((s, i) => s + taxOf(i), 0);
  const refunded = eligible
    .filter((it) => it.status === 'refunded')
    .reduce((s, i) => s + taxOf(i), 0);
  const pct = eligible.length ? Math.round((done / eligible.length) * 100) : 0;

  return (
    <div className="pb-6">
      <section className="pt-2">
        <p
          className="text-xs"
          style={{ color: C.sub, letterSpacing: '0.16em' }}
        >
          {t.checkIntro}
        </p>

        <div className="mt-3 flex items-baseline justify-between gap-3">
          <p
            className="flex items-baseline tabular-nums"
            style={{ letterSpacing: '-0.01em' }}
          >
            <span
              className="kaeru-bignum font-semibold"
              style={{ color: C.ink, lineHeight: 1 }}
            >
              {t.checkLeft} {todo.length}
            </span>
            <span
              style={{
                color: C.sub,
                fontSize: '16px',
                fontWeight: 500,
                marginLeft: '4px',
              }}
            >
              {t.itemsUnit}
            </span>
          </p>
          <span
            className="shrink-0 font-semibold tabular-nums"
            style={{ color: C.blueDeep, fontSize: '18px' }}
          >
            ¥{yen(total)}
          </span>
        </div>

        {eligible.length > 0 && (
          <div className="mt-3 flex" style={{ height: '1px' }}>
            <div
              style={{
                width: `${pct}%`,
                backgroundColor: C.sage,
                transition: 'width 400ms ease-out',
              }}
            />
            <div style={{ width: `${100 - pct}%`, backgroundColor: C.line }} />
          </div>
        )}

        <div
          className="mt-2.5 flex items-baseline justify-between"
          style={{ fontSize: '11.5px' }}
        >
          <span style={{ color: C.sub }}>
            {t.checkDoneRatio} {done} ／ {eligible.length} {t.itemsUnit}
          </span>
          <span style={{ color: C.sub }}>
            {t.checkRefunded} ¥{yen(refunded)}
          </span>
        </div>
      </section>

      {!todo.length && (
        <p
          className="mt-8 py-10 text-center text-sm"
          style={{ color: C.sub, borderTop: `1px solid ${C.line}` }}
        >
          {t.checkEmpty}
        </p>
      )}

      <div className="mt-6">
        {todo.map((it, n) => (
          <div
            key={it.id}
            className="py-2.5"
            style={{ borderTop: `1px solid ${n === 0 ? C.ink : C.line}` }}
          >
            <div className="flex items-baseline justify-between">
              <span
                className="font-bold tabular-nums"
                style={{ color: C.blue, fontSize: '12px' }}
              >
                {String(n + 1).padStart(2, '0')}
              </span>
              <span
                className="tabular-nums"
                style={{ color: C.sub, fontSize: '12px' }}
              >
                {it.date}
              </span>
            </div>

            <p className="mt-1.5 font-bold" style={{ fontSize: '20px' }}>
              {it.shop}
            </p>

            <div className="mt-3 flex items-baseline gap-8">
              <span>
                <span
                  className="block"
                  style={{ color: C.sub, fontSize: '11px' }}
                >
                  {t.inclAmount}
                </span>
                <span
                  className="mt-0.5 block font-semibold tabular-nums"
                  style={{ fontSize: '18px' }}
                >
                  ¥{yen(it.incl)}
                </span>
              </span>
              <span>
                <span
                  className="block"
                  style={{ color: C.sub, fontSize: '11px' }}
                >
                  {t.taxAmount}
                </span>
                <span
                  className="mt-0.5 block font-semibold tabular-nums"
                  style={{ color: C.blueDeep, fontSize: '18px' }}
                >
                  ¥{yen(taxOf(it))}
                </span>
              </span>
            </div>

            {it.note && (
              <p className="mt-2" style={{ color: C.sub, fontSize: '12px' }}>
                {it.note}
              </p>
            )}

            <button
              onClick={() => onVerifyOne(it.id)}
              className="mt-3 flex w-full items-center justify-center py-2.5 font-semibold"
              style={{
                border: `1px solid ${C.blue}`,
                color: C.blueDeep,
                fontSize: '12.5px',
                borderRadius: 0,
              }}
            >
              {t.markOne}
            </button>
          </div>
        ))}
      </div>

      {todo.length > 1 && (
        <button
          onClick={onVerifyAll}
          className="mt-6 w-full py-3.5 text-sm font-semibold"
          style={{
            backgroundColor: C.blue,
            color: '#FFFFFF',
            borderRadius: 0,
            borderTop: `1px solid ${C.ink}`,
          }}
        >
          {todo.length} {t.itemsUnit}
          {t.allDone}
        </button>
      )}

      <p
        className="mt-3 text-center"
        style={{ color: C.sub, fontSize: '11px' }}
      >
        {t.checkNote}
      </p>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-2.5">
      <h3
        className="font-bold"
        style={{ color: C.blue, fontSize: '10.5px', letterSpacing: '0.22em' }}
      >
        {children}
      </h3>
    </div>
  );
}

function FaqRow({ item, lang, open, onToggle }) {
  return (
    <div style={{ borderTop: `1px solid ${C.line}` }}>
      <button
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 text-left"
        style={{ padding: '15px 0' }}
      >
        <span style={{ fontSize: '15px', lineHeight: 1.7 }}>
          {item.q[lang]}
        </span>
        <ChevronRight
          size={16}
          className="mt-1 shrink-0"
          style={{
            color: C.sub,
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 150ms',
          }}
        />
      </button>
      {open && (
        <p
          style={{
            color: C.sub,
            fontSize: '13px',
            lineHeight: 2,
            margin: '0 24px 20px 0',
          }}
        >
          {item.a[lang]}
        </p>
      )}
    </div>
  );
}

function FaqView({ t, lang, onStart }) {
  const [open, setOpen] = useState(null);
  const sections = ['buy', 'exit', 'refund'];

  return (
    <div className="space-y-12 pb-6 pt-2">
      {sections.map((sec) => (
        <section key={sec}>
          <SectionLabel>{t.faqSection[sec]}</SectionLabel>
          <div className="mt-3">
            {QA.filter((x) => x.sec === sec).map((item, i) => {
              const key = `${sec}-${i}`;
              return (
                <FaqRow
                  key={key}
                  item={item}
                  lang={lang}
                  open={open === key}
                  onToggle={() => setOpen(open === key ? null : key)}
                />
              );
            })}
          </div>
        </section>
      ))}

      <section>
        <SectionLabel>{t.tipsTitle}</SectionLabel>
        <ol
          className="mt-6"
          style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}
        >
          {TIPS.map((tip, i) => (
            <li key={i} className="flex gap-5">
              <span
                className="shrink-0 font-bold tabular-nums"
                style={{ color: C.blue, opacity: 0.7, fontSize: '12px' }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <p style={{ fontSize: '13px', lineHeight: 2 }}>{tip[lang]}</p>
            </li>
          ))}
        </ol>
      </section>

      <button
        onClick={onStart}
        className="block w-full text-left"
        style={{ backgroundColor: C.soft, padding: '22px', borderRadius: 0 }}
      >
        <p className="font-bold" style={{ fontSize: '18px', lineHeight: 1.4 }}>
          {t.sim}
        </p>
        <p className="mt-2" style={{ color: C.sub, fontSize: '12.5px' }}>
          {t.simSub}
        </p>
        <span
          className="mt-5 inline-flex items-center gap-1 font-semibold"
          style={{ color: C.blueDeep, fontSize: '13px' }}
        >
          {t.startSim}
          <ChevronRight size={15} />
        </span>
      </button>

      <p className="text-center text-xs" style={{ color: C.sub }}>
        {t.source}
      </p>
    </div>
  );
}

function useCountUp(target, ms = 500) {
  const [n, setN] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const b = target;
    if (a === b) return;
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setN(Math.round(a + (b - a) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}

function Scenario({ t, lang, onExit }) {
  const [i, setI] = useState(-1);
  const [picked, setPicked] = useState(null);
  const [log, setLog] = useState([]);

  const total = log.reduce((s, x) => s + x.lose, 0);
  const lost = Math.min(total, SIM.max);
  const got = SIM.max - lost;
  const shown = useCountUp(got);

  const stepCount = i === -1 ? null : Math.min(i + 1, SIM.steps.length);
  const navBar = (
    <div
      className="flex items-center justify-between pb-3"
      style={{ borderBottom: `1px solid ${C.line}` }}
    >
      <button
        onClick={onExit}
        className="flex items-center gap-1"
        style={{ color: C.sub, fontSize: '13px' }}
      >
        <ChevronLeft size={15} /> {t.backToFaq}
      </button>
      {stepCount && (
        <span
          className="font-semibold tabular-nums"
          style={{ color: C.ink, fontSize: '13px' }}
        >
          {t.simStep} {stepCount}
          {t.of}
          {SIM.steps.length}
        </span>
      )}
    </div>
  );

  const keyframes = `@keyframes jpFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}`;

  if (i === -1) {
    return (
      <div className="space-y-8 pb-6 pt-2">
        {navBar}
        <div>
          <h2
            className="font-bold"
            style={{ fontSize: '22px', lineHeight: 1.4 }}
          >
            {t.sim}
          </h2>
          <p
            className="mt-4"
            style={{ color: C.sub, fontSize: '14px', lineHeight: 2 }}
          >
            {SIM.intro[lang]}
          </p>
        </div>

        <div
          style={{ backgroundColor: C.soft, padding: '22px', borderRadius: 0 }}
        >
          <p style={{ color: C.sub, fontSize: '12.5px' }}>{t.simMax}</p>
          <p
            className="mt-1 font-bold tabular-nums"
            style={{ color: C.blueDeep, fontSize: '28px' }}
          >
            ¥{yen(SIM.max)}
          </p>
          <ul
            className="mt-4"
            style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
          >
            {SIM.wallet[lang].map((w, n) => (
              <li
                key={n}
                className="flex items-baseline gap-2.5"
                style={{ fontSize: '13px' }}
              >
                <span
                  className="shrink-0"
                  style={{
                    width: '4px',
                    height: '4px',
                    backgroundColor: C.blue,
                  }}
                />
                <span style={{ lineHeight: 1.6 }}>{w}</span>
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={() => setI(0)}
          className="w-full py-3.5 text-sm font-semibold"
          style={{ backgroundColor: C.blue, color: '#FFFFFF', borderRadius: 0 }}
        >
          {t.startSim}
        </button>
      </div>
    );
  }

  if (i >= SIM.steps.length) {
    const misses = log.filter((x) => x.lose > 0 || x.penalty);
    const successCount = SIM.steps.length - misses.length;
    const pct = Math.round((got / SIM.max) * 100);
    return (
      <div className="space-y-10 pb-6 pt-2">
        <style>{keyframes}</style>
        {navBar}

        <div>
          <p
            className="font-bold"
            style={{
              color: C.sub,
              fontSize: '10.5px',
              letterSpacing: '0.24em',
            }}
          >
            {t.simDone}
          </p>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <p style={{ color: C.sub, fontSize: '11px' }}>{t.simGot}</p>
              <p
                className="font-bold tabular-nums"
                style={{ color: C.blueDeep, fontSize: '48px', lineHeight: 1 }}
              >
                ¥{yen(shown)}
              </p>
            </div>
            <div className="text-right">
              <p style={{ color: C.sub, fontSize: '11px' }}>{t.simMax}</p>
              <p
                className="font-semibold tabular-nums"
                style={{ color: C.ink, fontSize: '17px' }}
              >
                ¥{yen(SIM.max)}
              </p>
            </div>
          </div>

          <div className="mt-4 flex" style={{ height: '1px' }}>
            <div
              style={{
                width: `${pct}%`,
                backgroundColor: C.sage,
                transition: 'width 600ms ease-out',
              }}
            />
            <div style={{ width: `${100 - pct}%`, backgroundColor: C.clay }} />
          </div>

          <div
            className="mt-2.5 flex items-baseline justify-between"
            style={{ fontSize: '11.5px' }}
          >
            <span style={{ color: C.sub }}>
              {t.simSuccess} {successCount} ／ {SIM.steps.length}{' '}
              {t.unitDecisions}
            </span>
            {lost > 0 && (
              <span className="font-semibold" style={{ color: C.clayInk }}>
                {t.simLost} ¥{yen(lost)}
              </span>
            )}
          </div>
        </div>

        {misses.length === 0 ? (
          <p
            style={{
              color: C.sub,
              fontSize: '14px',
              lineHeight: 1.8,
              borderTop: `1px solid ${C.ink}`,
              paddingTop: '16px',
            }}
          >
            {t.simPerfect}
          </p>
        ) : (
          <section style={{ borderTop: `1px solid ${C.ink}`, paddingTop: '16px' }}>
            <SectionLabel>{t.simWhy}</SectionLabel>
            <div className="mt-3">
              {misses.map((m, n) => (
                <div
                  key={n}
                  className="py-5"
                  style={{ borderTop: `1px solid ${C.line}` }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="font-bold tabular-nums"
                      style={{ color: C.blue, fontSize: '12px' }}
                    >
                      {t.simStep} {String(m.step + 1).padStart(2, '0')}
                    </span>
                    {m.lose > 0 && (
                      <Badge tone="clay">
                        {t.simLost} ¥{yen(m.lose)}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 font-bold" style={{ fontSize: '15px' }}>
                    {m.label[lang]}
                  </p>
                  <p
                    className="mt-1.5"
                    style={{ fontSize: '12.5px', lineHeight: 1.95 }}
                  >
                    {(m.penalty || m.fb)[lang]}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section style={{ borderTop: `1px solid ${C.line}`, paddingTop: '16px' }}>
          <SectionLabel>{t.rulesTitle}</SectionLabel>
          <ol className="mt-4 space-y-5">
            {RULES[lang].slice(0, 3).map((r, n) => (
              <li key={n} className="flex gap-4">
                <span
                  className="shrink-0 font-bold tabular-nums"
                  style={{ color: C.blue, fontSize: '12px' }}
                >
                  {String(n + 1).padStart(2, '0')}
                </span>
                <p style={{ fontSize: '14px', lineHeight: 1.75 }}>{r}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="flex gap-3">
          <button
            onClick={() => {
              setI(-1);
              setPicked(null);
              setLog([]);
            }}
            className="flex-1 py-3.5 text-sm font-semibold"
            style={{
              border: `1px solid ${C.blue}`,
              color: C.blueDeep,
              borderRadius: 0,
            }}
          >
            {t.again}
          </button>
          <button
            onClick={onExit}
            className="flex-1 py-3.5 text-sm font-semibold"
            style={{
              backgroundColor: C.blue,
              color: '#FFFFFF',
              borderRadius: 0,
            }}
          >
            {t.backToFaq}
          </button>
        </div>
      </div>
    );
  }

  const step = SIM.steps[i];
  const canContinue = picked !== null;

  return (
    <div className="pb-6 pt-2">
      <style>{keyframes}</style>
      {navBar}

      {/* 九段進度 */}
      <div className="mt-5 flex" style={{ gap: '3px' }}>
        {SIM.steps.map((_, n) => (
          <div
            key={n}
            style={{
              height: '3px',
              flex: 1,
              backgroundColor: n <= i ? C.blue : C.line,
            }}
          />
        ))}
      </div>

      <div className="mt-6 flex items-baseline justify-between gap-3">
        <span
          className="font-bold"
          style={{ color: C.blue, fontSize: '10.5px', letterSpacing: '0.2em' }}
        >
          {step.where[lang]}
        </span>
        <span
          className="font-semibold tabular-nums"
          style={{ color: C.blueDeep, fontSize: '17px' }}
        >
          {t.simGot} ¥{yen(shown)}
        </span>
      </div>

      <p className="mt-4" style={{ fontSize: '14px', lineHeight: 2 }}>
        {step.scene[lang]}
      </p>
      <p className="mt-2 font-bold" style={{ fontSize: '19px' }}>
        {step.q[lang]}
      </p>

      {/* 選項 */}
      <div
        className="mt-5"
        style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
      >
        {step.opts.map((o, n) => {
          const isChosen = picked === n;
          if (!isChosen) {
            return (
              <button
                key={n}
                disabled={picked !== null}
                onClick={() => {
                  setPicked(n);
                  setLog((l) => [
                    ...l,
                    {
                      step: i,
                      lose: o.lose || 0,
                      fb: o.fb,
                      penalty: o.penalty,
                      label: o.label,
                    },
                  ]);
                }}
                className="w-full text-left"
                style={{
                  border: `1px solid ${C.line}`,
                  color: C.sub,
                  fontSize: '14px',
                  lineHeight: 1.6,
                  padding: '14px 16px',
                  opacity: picked !== null ? 0.5 : 1,
                }}
              >
                {o.label[lang]}
              </button>
            );
          }
          const good = !!o.best;
          return (
            <div
              key={n}
              style={{
                border: `1px solid ${good ? C.sage : C.clay}`,
                backgroundColor: C.soft,
                padding: '14px 16px',
                animation: 'jpFade 220ms ease-out',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className="font-bold"
                  style={{ fontSize: '14px', lineHeight: 1.6 }}
                >
                  {o.label[lang]}
                </span>
                <Badge tone={good ? 'sage' : 'clay'}>
                  {good ? t.simGood : t.simBad}
                </Badge>
              </div>
              <p
                className="mt-2.5"
                style={{ fontSize: '12.5px', lineHeight: 1.95 }}
              >
                {o.fb[lang]}
              </p>
              {o.lose > 0 && (
                <span className="mt-2 inline-block">
                  <Badge tone="clay">
                    {t.simLost} ¥{yen(o.lose)}
                  </Badge>
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div
        className="mt-6 flex items-center justify-between gap-3 pt-4"
        style={{ borderTop: `1px solid ${C.line}` }}
      >
        <span style={{ color: C.sub, fontSize: '11px' }}>
          {t.simMax} ¥{yen(SIM.max)}
        </span>
        <button
          onClick={() => {
            setI(i + 1);
            setPicked(null);
          }}
          disabled={!canContinue}
          className="flex items-center gap-1 font-semibold disabled:opacity-40"
          style={{
            backgroundColor: C.blue,
            color: '#FFFFFF',
            fontSize: '13px',
            padding: '10px 20px',
            borderRadius: 0,
          }}
        >
          {t.next} <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function SettingsView({
  t,
  settings,
  setSettings,
  trip,
  count,
  onTripChange,
  onOpenTrips,
  onFetchRate,
  rateBusy,
  rateErr,
  onClear,
}) {
  const [confirm, setConfirm] = useState(false);
  const rowStyle = (first) => ({
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '18px 0',
    borderBottom: `1px solid ${C.line}`,
    borderTop: first ? `1px solid ${C.ink}` : 'none',
  });
  const labelStyle = {
    color: C.blue,
    fontSize: '10.5px',
    letterSpacing: '0.24em',
    fontWeight: 700,
  };

  return (
    <div className="pb-6 pt-2">
      <button onClick={onOpenTrips} style={rowStyle(true)}>
        <span className="block" style={labelStyle}>
          {t.trips}
        </span>
        <span className="mt-2 flex items-center justify-between gap-2">
          <span style={{ fontSize: '17px' }}>
            {trip && trip.name ? trip.name : t.tripNow}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <Badge tone="blue">{t.tripNow}</Badge>
            <span
              className="flex items-center tabular-nums"
              style={{ color: C.sub, fontSize: '11.5px' }}
            >
              {count} {t.itemsUnit} <ChevronRight size={13} />
            </span>
          </span>
        </span>
      </button>

      <div style={rowStyle(false)}>
        <span className="block" style={labelStyle}>
          {t.departure}
        </span>
        <div className="mt-2">
          <DateField
            withTime
            value={(trip && trip.departure) || ''}
            onChange={(v) => onTripChange({ departure: v })}
            t={t}
            fontSize="17px"
          />
        </div>
      </div>

      <div style={rowStyle(false)}>
        <div className="flex items-baseline justify-between gap-2">
          <span style={labelStyle}>
            {t.rate} {t.twd}
          </span>
          <button
            onClick={onFetchRate}
            disabled={rateBusy}
            className="shrink-0 text-xs disabled:opacity-50"
            style={{ color: C.blueDeep, textDecoration: 'underline' }}
          >
            {rateBusy ? t.fetching : t.fetchRate}
          </button>
        </div>
        <input
          type="number"
          step="0.0001"
          value={settings.rate}
          onChange={(e) =>
            setSettings((s) => ({
              ...s,
              rate: Number(e.target.value) || 0,
              rateAt: null,
            }))
          }
          className="mt-2 block w-full bg-transparent font-semibold tabular-nums outline-none"
          style={{ border: 'none', fontSize: '17px', color: C.ink }}
        />
        <p className="mt-1 text-xs" style={{ color: C.sub }}>
          {settings.rateAt
            ? `${t.rateAt} ${(() => {
                const d = new Date(settings.rateAt);
                return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
              })()}`
            : t.manual}
        </p>
        {rateErr && (
          <p className="mt-1.5 text-xs" style={{ color: C.clayInk }}>
            {t.rateFail}
          </p>
        )}
      </div>

      <div style={rowStyle(false)}>
        <span className="block" style={labelStyle}>
          {t.language}
        </span>
        <div className="mt-2.5 flex gap-6">
          {[
            ['zh', '繁體中文'],
            ['ja', '日本語'],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSettings((s) => ({ ...s, lang: k }))}
              className="pb-1.5"
              style={{
                fontSize: '15px',
                fontWeight: settings.lang === k ? 700 : 400,
                color: settings.lang === k ? C.ink : C.sub,
                borderBottom:
                  settings.lang === k
                    ? `2px solid ${C.ink}`
                    : '2px solid transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={rowStyle(false)}>
        <p style={{ color: C.sub, fontSize: '12px', lineHeight: 1.9 }}>
          {t.dataNote}
        </p>
        {!confirm ? (
          <button
            onClick={() => setConfirm(true)}
            className="mt-3.5 inline-block text-sm"
            style={{
              color: C.clayInk,
              borderBottom: `1px solid ${C.clay}`,
              paddingBottom: '3px',
            }}
          >
            {t.clearAll}
          </button>
        ) : (
          <div
            className="mt-3"
            style={{
              backgroundColor: C.soft,
              borderLeft: `3px solid ${C.clay}`,
              padding: '14px',
            }}
          >
            <p className="text-sm" style={{ color: C.clayInk }}>
              {t.clearConfirm}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  onClear();
                  setConfirm(false);
                }}
                className="px-3 py-1.5 text-sm font-medium"
                style={{
                  backgroundColor: C.clay,
                  color: '#FFFFFF',
                  borderRadius: 0,
                }}
              >
                {t.clearAll}
              </button>
              <button
                onClick={() => setConfirm(false)}
                className="px-3 py-1.5 text-sm"
                style={{
                  border: `1px solid ${C.line}`,
                  color: C.ink,
                  borderRadius: 0,
                }}
              >
                {t.cancel}
              </button>
            </div>
          </div>
        )}
      </div>

      <p
        className="mt-10 pb-2 text-center"
        style={{ color: C.sub, fontSize: '10.5px' }}
      >
        {t.source}
      </p>
    </div>
  );
}

/* ---------------- sheets ---------------- */

/* 新增收據／收據詳情：整頁覆蓋，自己的標題列 */
function FullScreenSheet({ children }) {
  return (
    <div
      className="fixed inset-0 z-40 overflow-y-auto"
      style={{
        backgroundColor: C.bg,
        fontFamily: FONT,
        letterSpacing: '0.01em',
        color: C.ink,
      }}
    >
      <div
        className="kaeru-app"
        style={{ backgroundColor: C.page, paddingBottom: '40px' }}
      >
        {children}
      </div>
    </div>
  );
}

/* 行程切換：貼底 bottom sheet，不做圓角 */
function BottomSheet({ onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-40"
      style={{ fontFamily: FONT, letterSpacing: '0.01em', color: C.ink }}
    >
      <style>{`@keyframes jpSlideUp{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}`}</style>
      {/* 面板固定在「欄」內，不是整個 viewport：寬度／置中沿用 .kaeru-app 同一套規則 */}
      <div className="absolute inset-0 kaeru-app">
        <div
          className="absolute inset-0"
          style={{ backgroundColor: 'rgba(73,70,64,0.28)' }}
          onClick={onClose}
        />
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-0 bottom-0 overflow-y-auto"
          style={{
            maxHeight: '86vh',
            backgroundColor: C.page,
            borderTop: `1px solid ${C.ink}`,
            borderRadius: 0,
            padding: '22px 26px 30px',
            animation: 'jpSlideUp 200ms cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function MenuDropdown({
  t,
  lang,
  tab,
  trip,
  onClose,
  onGo,
  onAdd,
  onTrips,
  onLang,
}) {
  const rows = [
    ['home', Home],
    ['list', Rows3],
    ['check', ScanLine],
    ['faq', HelpCircle],
    ['set', Cog],
  ];

  const rowCls = 'flex w-full items-center gap-3 px-4 py-3 text-left';

  return (
    <>
      <style>{`@keyframes jpMenuIn{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:none}}`}</style>

      <div className="fixed inset-0 z-30" onClick={onClose} />

      <div
        className="absolute right-0 z-40 overflow-hidden rounded-2xl"
        style={{
          top: 'calc(100% + 8px)',
          width: '17.5rem',
          maxWidth: 'calc(100vw - 2rem)',
          backgroundColor: C.card,
          border: `1px solid ${C.line}`,
          boxShadow: '0 12px 32px rgba(73,70,64,0.14)',
          transformOrigin: 'top right',
          animation: 'jpMenuIn 140ms ease-out',
        }}
      >
        <div className="p-3">
          <button
            onClick={onAdd}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold"
            style={{ backgroundColor: C.blue, color: '#FFFFFF' }}
          >
            <Plus size={16} /> {t.menuAdd}
          </button>
        </div>

        <div style={{ borderTop: `1px solid ${C.line}` }}>
          {rows.map(([k, Icon], i) => {
            const on = tab === k;
            return (
              <button
                key={k}
                onClick={() => onGo(k)}
                className={rowCls}
                style={{
                  borderTop: i === 0 ? 'none' : `1px solid ${C.line}`,
                  backgroundColor: on ? C.blueSoft : 'transparent',
                }}
              >
                <Icon
                  size={17}
                  style={{ color: on ? C.blue : C.sub }}
                  strokeWidth={on ? 2.2 : 1.7}
                />
                <span className="flex-1">
                  <span
                    className="block text-sm"
                    style={{ color: on ? C.blueDeep : C.ink }}
                  >
                    {t.nav[k]}
                  </span>
                  <span
                    className="mt-0.5 block text-xs leading-5"
                    style={{ color: C.sub }}
                  >
                    {t.navDesc[k]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={onTrips}
          className={rowCls}
          style={{ borderTop: `1px solid ${C.line}` }}
        >
          <MapPin size={17} style={{ color: C.sub }} strokeWidth={1.7} />
          <span className="flex-1">
            <span className="block text-sm">{t.menuTrip}</span>
            <span className="mt-0.5 block text-xs" style={{ color: C.sub }}>
              {trip && trip.name ? trip.name : t.tripNow}
            </span>
          </span>
          <ChevronRight size={14} style={{ color: C.sub }} />
        </button>

        <button
          onClick={onLang}
          className={rowCls}
          style={{ borderTop: `1px solid ${C.line}` }}
        >
          <Globe size={17} style={{ color: C.sub }} strokeWidth={1.7} />
          <span className="flex-1 text-sm">{t.menuLang}</span>
          <span className="text-xs font-medium" style={{ color: C.blueDeep }}>
            {lang === 'zh' ? '日本語' : '中文'}
          </span>
        </button>
      </div>
    </>
  );
}

function TripSheet({
  t,
  trips,
  activeId,
  items,
  onClose,
  onSelect,
  onCreate,
  onDelete,
}) {
  const [name, setName] = useState('');
  const [departure, setDeparture] = useState('');
  const [confirmId, setConfirmId] = useState(null);

  const countOf = (id) => items.filter((i) => i.tripId === id).length;
  const fmtDep = (v) =>
    `${v.slice(0, 10).replace(/-/g, '/')} ${v.slice(11, 16)}`;
  const active = trips.find((x) => x.id === activeId);
  const others = [...trips]
    .filter((x) => x.id !== activeId)
    .sort((a, b) => (b.departure || '').localeCompare(a.departure || ''));

  return (
    <BottomSheet onClose={onClose}>
      <div className="flex items-center justify-between pb-4">
        <h2 className="font-bold" style={{ fontSize: '18px' }}>
          {t.trips}
        </h2>
        <button onClick={onClose} style={{ color: C.sub }}>
          <X size={20} />
        </button>
      </div>

      {active && (
        <div style={{ borderTop: `1px solid ${C.ink}`, paddingTop: '14px' }}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-bold" style={{ fontSize: '17px' }}>
              {active.name || t.tripNow}
            </span>
            <Badge tone="blue">{t.tripNow}</Badge>
          </div>
          <p className="mt-1.5" style={{ color: C.sub, fontSize: '11.5px' }}>
            {countOf(active.id)} {t.tripReceipts}
            {active.departure
              ? ` · ${t.depPrefix} ${fmtDep(active.departure)}`
              : ` · ${t.noDeparture}`}
          </p>

          {trips.length > 1 &&
            (confirmId === active.id ? (
              <div
                className="mt-3"
                style={{
                  backgroundColor: C.soft,
                  borderLeft: `3px solid ${C.clay}`,
                  padding: '12px 14px',
                }}
              >
                <p
                  style={{
                    color: C.clayInk,
                    fontSize: '12.5px',
                    lineHeight: 1.7,
                  }}
                >
                  {t.tripDeleteConfirm}
                </p>
                <div className="mt-2.5 flex gap-2">
                  <button
                    onClick={() => {
                      onDelete(active.id);
                      setConfirmId(null);
                    }}
                    className="px-3 py-1.5 text-xs font-medium"
                    style={{
                      backgroundColor: C.clay,
                      color: '#FFFFFF',
                      borderRadius: 0,
                    }}
                  >
                    {t.tripDelete}
                  </button>
                  <button
                    onClick={() => setConfirmId(null)}
                    className="px-3 py-1.5 text-xs"
                    style={{
                      border: `1px solid ${C.line}`,
                      color: C.ink,
                      borderRadius: 0,
                    }}
                  >
                    {t.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmId(active.id)}
                className="mt-3 flex w-full items-center justify-center py-2.5"
                style={{
                  border: `1px solid ${C.line}`,
                  color: C.sub,
                  fontSize: '12.5px',
                  borderRadius: 0,
                }}
              >
                {t.tripDelete}
              </button>
            ))}
        </div>
      )}

      {others.length > 0 && (
        <div className="mt-6 pt-5" style={{ borderTop: `1px solid ${C.line}` }}>
          <SectionLabel>{t.tripPast}</SectionLabel>
          <div className="mt-1">
            {others.map((trip, idx) => (
              <div
                key={trip.id}
                className="flex items-baseline justify-between gap-3 py-3"
                style={idx > 0 ? { borderTop: `1px solid ${C.line}` } : {}}
              >
                <div className="min-w-0">
                  <p className="truncate" style={{ fontSize: '15px' }}>
                    {trip.name || t.tripNow}
                  </p>
                  <p
                    className="mt-0.5"
                    style={{ color: C.sub, fontSize: '11.5px' }}
                  >
                    {countOf(trip.id)} {t.tripReceipts}
                    {trip.departure &&
                      ` · ${t.depPrefix} ${fmtDep(trip.departure)}`}
                  </p>
                </div>
                <button
                  onClick={() => onSelect(trip.id)}
                  className="shrink-0"
                  style={{
                    color: C.blueDeep,
                    fontSize: '12.5px',
                    textDecoration: 'underline',
                  }}
                >
                  {t.tripSwitch}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 pt-5" style={{ borderTop: `1px solid ${C.ink}` }}>
        <SectionLabel>{t.newTrip}</SectionLabel>
        <div
          className="mt-4"
          style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
        >
          <Input
            value={name}
            placeholder={`${t.tripName}　${t.tripNamePh}`}
            onChange={(e) => setName(e.target.value)}
          />
          <DateField
            withTime
            value={departure}
            onChange={setDeparture}
            t={t}
            fontSize="15px"
          />
          <button
            onClick={() => {
              if (!name.trim()) return;
              onCreate(name.trim(), departure);
              setName('');
              setDeparture('');
            }}
            disabled={!name.trim()}
            className="w-full py-3.5 text-sm font-semibold disabled:opacity-40"
            style={{
              backgroundColor: C.blue,
              color: '#FFFFFF',
              borderRadius: 0,
            }}
          >
            {t.create}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

function EditSheet({ t, initial, photo, onClose, onSave }) {
  const [shop, setShop] = useState(initial?.shop || '');
  const [date, setDate] = useState(initial?.date || todayStr());
  const [incl, setIncl] = useState(initial?.incl ?? '');
  const [incl8, setIncl8] = useState(initial?.incl8 ?? '');
  const [incl10, setIncl10] = useState(initial?.incl10 ?? '');
  const [rate, setRate] = useState(initial?.rate ?? 10);
  const [taxOverride, setTaxOverride] = useState(
    initial?.taxOverride === null || initial?.taxOverride === undefined
      ? ''
      : initial.taxOverride,
  );
  const [refundReg, setRefundReg] = useState(
    initial ? STAGES.indexOf(initial.status) >= 1 : false,
  );
  const [unpacked, setUnpacked] = useState(initial?.unpacked || false);
  const [consumed, setConsumed] = useState(initial?.consumed || false);
  const [note, setNote] = useState(initial?.note || '');
  const [img, setImg] = useState(photo || null);
  const fileRef = useRef(null);

  const mixed = rate === 'mixed';
  const v8 = Number(incl8) || 0;
  const v10 = Number(incl10) || 0;
  const incl8Filled = incl8 !== '' && incl8 !== null;
  const incl10Filled = incl10 !== '' && incl10 !== null;
  const net8 = netOf(v8, 8);
  const net10 = netOf(v10, 10);
  const tax8 = v8 - net8;
  const tax10 = v10 - net10;
  const singleNet = netOf(Number(incl) || 0, mixed ? 10 : rate);
  const singleAutoTax = (Number(incl) || 0) - singleNet;
  const net = mixed ? net8 + net10 : singleNet;
  const autoTax = mixed ? tax8 + tax10 : singleAutoTax;
  const effectiveIncl = mixed ? v8 + v10 : Number(incl) || 0;
  const bothFilled = incl8Filled && incl10Filled;
  const showPartialWarn = mixed && incl8Filled !== incl10Filled;
  // 稅抜合計對 5,000 円門檻的即時判定：達標用 sage，未達用 clay + 還差多少
  const metThreshold = net >= 5000;
  const thresholdText = metThreshold
    ? t.reached
    : `${t.notReached} · ${t.short} ¥${yen(5000 - net)}`;
  const thresholdColor = metThreshold ? C.sage : C.clay;

  function pickRate(r) {
    if (r !== 'mixed' && mixed) {
      // 從混合切回單一：兩格加總帶回含稅金額，兩格本身不清空
      setIncl(v8 + v10 ? String(v8 + v10) : '');
    }
    setRate(r);
  }

  async function onPick(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      setImg(await compressImage(f));
    } catch (err) {}
  }

  async function pickPhoto() {
    if (Capacitor.isNativePlatform()) {
      try {
        const shot = await Camera.getPhoto({
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Prompt,
          quality: 60,
          width: 1000,
          promptLabelHeader: t.takePhoto,
        });
        if (shot?.dataUrl) setImg(shot.dataUrl);
      } catch (err) {
        // 使用者取消選擇時 Camera.getPhoto 會 reject，忽略即可
      }
      return;
    }
    fileRef.current && fileRef.current.click();
  }

  function save() {
    const id =
      initial?.id ||
      `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let status = initial?.status || 'purchased';
    if (refundReg && STAGES.indexOf(status) < 1) status = 'registered';
    if (!refundReg && STAGES.indexOf(status) === 1) status = 'purchased';
    if (consumed && STAGES.indexOf(status) > 1) status = 'registered';

    let finalRate = rate;
    let finalIncl = effectiveIncl;
    if (mixed && !bothFilled) {
      // 只填一格：儲存時自動降回該單一稅率模式
      if (incl8Filled) {
        finalRate = 8;
        finalIncl = v8;
      } else if (incl10Filled) {
        finalRate = 10;
        finalIncl = v10;
      }
    }

    onSave(
      {
        id,
        shop: shop.trim(),
        date,
        incl: finalIncl,
        rate: finalRate,
        incl8: incl8Filled ? v8 : null,
        incl10: incl10Filled ? v10 : null,
        taxOverride: taxOverride === '' ? null : Number(taxOverride),
        unpacked,
        consumed,
        note: note.trim(),
        status,
        hasPhoto: !!img,
        tripId: initial?.tripId,
      },
      img,
    );
  }

  return (
    <FullScreenSheet>
      <div
        className="sticky top-0 z-10 flex items-center justify-between kaeru-pad py-4"
        style={{ backgroundColor: C.page, borderBottom: `1px solid ${C.ink}` }}
      >
        <button onClick={onClose} style={{ fontSize: '15px', color: C.sub }}>
          {t.cancel}
        </button>
        <h2 className="font-bold" style={{ fontSize: '15px' }}>
          {initial ? t.edit : t.addReceipt}
        </h2>
        <button
          onClick={save}
          disabled={!shop.trim() || !effectiveIncl}
          className="font-bold disabled:opacity-40"
          style={{ fontSize: '13px', color: C.blueDeep }}
        >
          {t.save}
        </button>
      </div>

      <div
        className="kaeru-pad py-6"
        style={{ display: 'flex', flexDirection: 'column', gap: '26px' }}
      >
        <Field label={t.shop}>
          <Input value={shop} onChange={(e) => setShop(e.target.value)} />
        </Field>

        <Field label={t.date}>
          <DateField
            value={date}
            onChange={(v) => setDate(v || todayStr())}
            t={t}
          />
        </Field>

        <Field label={t.taxRate}>
          <div className="flex gap-1.5">
            {[8, 10].map((r) => (
              <button
                key={r}
                onClick={() => pickRate(r)}
                className="font-semibold"
                style={{
                  flex: 1,
                  padding: '10px 0',
                  fontSize: '13px',
                  backgroundColor: rate === r ? C.blue : C.soft,
                  color: rate === r ? '#FFFFFF' : C.ink,
                  border: `1px solid ${rate === r ? C.blue : C.line}`,
                  borderRadius: 0,
                }}
              >
                {r}%
              </button>
            ))}
            <button
              onClick={() => pickRate('mixed')}
              className="font-semibold"
              style={{
                flex: 1.5,
                padding: '10px 0',
                fontSize: '13px',
                backgroundColor: mixed ? C.blue : C.soft,
                color: mixed ? '#FFFFFF' : C.ink,
                border: `1px solid ${mixed ? C.blue : C.line}`,
                borderRadius: 0,
              }}
            >
              {t.taxRateBoth}
            </button>
          </div>
        </Field>
        <p
          className="-mt-3"
          style={{ color: C.sub, fontSize: '11.5px', lineHeight: 1.75 }}
        >
          {t.rateHint}
        </p>

        {!mixed && (
          <Field label={t.inclAmount}>
            <input
              type="text"
              inputMode="numeric"
              value={incl === '' ? '' : `¥${yen(incl)}`}
              onChange={(e) => setIncl(e.target.value.replace(/[^\d]/g, ''))}
              className="jp-underline w-full bg-transparent font-semibold tabular-nums outline-none"
              style={{
                border: 'none',
                borderBottom: `1px solid ${C.line}`,
                color: C.ink,
                padding: '0 0 10px',
                fontSize: '20px',
              }}
            />
          </Field>
        )}

        {mixed && (
          <div
            style={{
              borderTop: `1px solid ${C.line}`,
              paddingTop: '15px',
              display: 'flex',
              flexDirection: 'column',
              gap: '15px',
            }}
          >
            {[
              {
                label: t.tax8Label,
                sub: t.tax8Sub,
                value: incl8,
                set: setIncl8,
              },
              {
                label: t.tax10Label,
                sub: t.tax10Sub,
                value: incl10,
                set: setIncl10,
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-end justify-between gap-3"
              >
                <span className="shrink-0">
                  <span
                    className="block font-bold"
                    style={{ fontSize: '12.5px', color: C.ink }}
                  >
                    {row.label}
                  </span>
                  <span
                    className="mt-0.5 block"
                    style={{ fontSize: '10.5px', color: C.sub }}
                  >
                    {row.sub}
                  </span>
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={t.inclAmount}
                  value={row.value === '' ? '' : `¥${yen(row.value)}`}
                  onChange={(e) => row.set(e.target.value.replace(/[^\d]/g, ''))}
                  className="jp-underline bg-transparent text-right font-semibold tabular-nums outline-none"
                  style={{
                    flex: 1,
                    maxWidth: '168px',
                    border: 'none',
                    borderBottom: `1px solid ${C.line}`,
                    color: C.ink,
                    fontSize: '19px',
                    padding: '0 0 8px',
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {!mixed ? (
          <div style={{ backgroundColor: C.soft, padding: '16px' }}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p style={{ fontSize: '13px', color: C.ink }}>
                  {t.taxAmount}（{t.taxAuto}）
                </p>
                <p
                  className="mt-1 tabular-nums"
                  style={{ fontSize: '12px', color: C.sub }}
                >
                  {t.netTotal} ¥{yen(net)}
                  <span
                    style={{
                      marginLeft: '7px',
                      fontSize: '10.5px',
                      fontWeight: 600,
                      color: thresholdColor,
                    }}
                  >
                    {thresholdText}
                  </span>
                </p>
              </div>
              <input
                type="text"
                inputMode="numeric"
                placeholder={`¥${yen(autoTax)}`}
                value={taxOverride === '' ? '' : `¥${yen(taxOverride)}`}
                onChange={(e) =>
                  setTaxOverride(e.target.value.replace(/[^\d]/g, ''))
                }
                className="bg-transparent text-right font-semibold tabular-nums outline-none"
                style={{
                  border: 'none',
                  color: C.blueDeep,
                  fontSize: '22px',
                  width: '45%',
                }}
              />
            </div>
          </div>
        ) : (
          <div style={{ backgroundColor: C.soft, padding: '14px' }}>
            <div className="flex items-baseline justify-between gap-3">
              <span style={{ fontSize: '11px', color: C.sub }}>
                {t.inclTotalLabel}　{t.autoFilledHint}
              </span>
              <span
                className="font-semibold tabular-nums"
                style={{ fontSize: '20px', color: bothFilled ? C.ink : C.sub }}
              >
                ¥{yen(effectiveIncl)}
              </span>
            </div>

            <div
              style={{
                borderTop: `1px solid ${C.line}`,
                marginTop: '10px',
                paddingTop: '10px',
              }}
            >
              <div
                className="flex items-baseline justify-between tabular-nums"
                style={{ fontSize: '11.5px', color: C.sub }}
              >
                <span>
                  {incl8Filled
                    ? `${t.tax8Label} ${t.netBare} ¥${yen(net8)}`
                    : t.tax8Label}
                </span>
                <span>
                  {incl8Filled ? `${t.taxAmount} ¥${yen(tax8)}` : t.notFilled}
                </span>
              </div>
              <div
                className="mt-1.5 flex items-baseline justify-between tabular-nums"
                style={{ fontSize: '11.5px', color: C.sub }}
              >
                <span>
                  {incl10Filled
                    ? `${t.tax10Label} ${t.netBare} ¥${yen(net10)}`
                    : t.tax10Label}
                </span>
                <span>
                  {incl10Filled ? `${t.taxAmount} ¥${yen(tax10)}` : t.notFilled}
                </span>
              </div>
            </div>

            {bothFilled && (
              <div
                style={{
                  borderTop: `1px solid ${C.line}`,
                  marginTop: '10px',
                  paddingTop: '10px',
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p style={{ fontSize: '13px', color: C.ink }}>
                      {t.taxTotalAuto}
                    </p>
                    <p
                      className="mt-1 tabular-nums"
                      style={{ fontSize: '12px', color: C.sub }}
                    >
                      {t.netTotal} ¥{yen(net)}
                      <span
                        style={{
                          marginLeft: '7px',
                          fontSize: '10.5px',
                          fontWeight: 600,
                          color: thresholdColor,
                        }}
                      >
                        {thresholdText}
                      </span>
                    </p>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder={`¥${yen(autoTax)}`}
                    value={taxOverride === '' ? '' : `¥${yen(taxOverride)}`}
                    onChange={(e) =>
                      setTaxOverride(e.target.value.replace(/[^\d]/g, ''))
                    }
                    className="bg-transparent text-right font-semibold tabular-nums outline-none"
                    style={{
                      border: 'none',
                      color: C.blueDeep,
                      fontSize: '22px',
                      width: '45%',
                    }}
                  />
                </div>
              </div>
            )}

            {showPartialWarn && (
              <div className="mt-3">
                <Badge tone="clay">
                  {incl8Filled ? t.tax10Label : t.tax8Label}
                  {t.notFilled}
                </Badge>
                <p
                  className="mt-2"
                  style={{ fontSize: '11.5px', color: C.sub, lineHeight: 1.75 }}
                >
                  {t.taxMixedPartialHint}
                </p>
              </div>
            )}
          </div>
        )}

        {net >= 1000000 && <Notice tone="blue">{t.warnHigh}</Notice>}

        <Toggle
          checked={refundReg}
          onChange={setRefundReg}
          label={t.refundReg}
        />
        <Toggle
          checked={unpacked}
          onChange={setUnpacked}
          label={t.unpacked}
          hint={t.unpackedHint}
        />
        <Toggle
          checked={consumed}
          onChange={setConsumed}
          label={t.consumed}
          hint={t.consumedHint}
          warn
        />

        {consumed && (
          <p
            style={{
              backgroundColor: C.soft,
              borderLeft: `3px solid ${C.clay}`,
              color: C.clayInk,
              fontSize: '12.5px',
              lineHeight: 1.7,
              padding: '12px 14px',
            }}
          >
            {t.warnConsumed}
          </p>
        )}

        <Field label={t.photo}>
          {img ? (
            <div className="relative">
              <img
                src={img}
                alt=""
                className="w-full"
                style={{ border: `1px solid ${C.line}` }}
              />
              <button
                onClick={() => setImg(null)}
                className="absolute right-2 top-2 rounded-full p-1.5"
                style={{ backgroundColor: C.ink, color: '#FFFFFF' }}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={pickPhoto}
              className="flex w-full items-center justify-center text-sm"
              style={{
                border: `1px dashed ${C.line}`,
                color: C.sub,
                height: '74px',
              }}
            >
              {t.takePhoto}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPick}
            className="hidden"
          />
        </Field>

        <Field label={t.note}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </FullScreenSheet>
  );
}

function DetailSheet({
  t,
  item,
  group,
  photo,
  taxOf,
  settings,
  onClose,
  onEdit,
  onStatus,
  onDelete,
}) {
  const d = daysLeft(item.date);
  const tax = taxOf(item);
  const dead = !!item.consumed;
  const groupOk = !!(group && group.ok);
  const blocked = dead || !groupOk;
  const cur = STAGES.indexOf(item.status);
  const refunded = item.status === 'refunded';
  const fmtShort = (iso) => {
    const dt = new Date(iso + 'T00:00:00');
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
  };
  const strike = {
    textDecoration: 'line-through',
    textDecorationColor: C.clay,
  };

  return (
    <FullScreenSheet>
      <div
        className="sticky top-0 z-10 flex items-center justify-between kaeru-pad py-4"
        style={{ backgroundColor: C.page, borderBottom: `1px solid ${C.line}` }}
      >
        <button onClick={onClose} style={{ fontSize: '13px', color: C.sub }}>
          ‹ {t.receipts}
        </button>
        <div className="flex items-center gap-4">
          <button
            onClick={() => onEdit(item)}
            className="font-semibold"
            style={{ fontSize: '13px', color: C.blueDeep }}
          >
            {t.edit}
          </button>
          <button onClick={onDelete} style={{ fontSize: '13px', color: C.clayInk }}>
            {t.delete}
          </button>
        </div>
      </div>

      <div className="kaeru-pad py-6">
        <h1 className="font-bold" style={{ fontSize: '19px' }}>
          {item.shop}
        </h1>
        <p
          className="mt-1.5 tabular-nums"
          style={{ color: C.sub, fontSize: '11.5px' }}
        >
          {item.date}
          {dead
            ? ` · ${t.stalledShort}`
            : refunded
              ? ` · ${t.caseClosed}`
              : d !== null
                ? ` · ${d < 0 ? t.expired : `${t.warnDeadline} ${d} ${t.days}`}`
                : ''}
        </p>

        <div
          className="mt-4 flex items-end justify-between gap-4"
          style={{ borderTop: `1px solid ${C.ink}`, paddingTop: '14px' }}
        >
          <div>
            <p style={{ color: C.sub, fontSize: '11.5px' }}>{t.inclAmount}</p>
            <p
              className="mt-1 font-semibold tabular-nums"
              style={{
                fontSize: '26px',
                color: dead ? C.sub : C.ink,
                ...(dead ? strike : {}),
              }}
            >
              ¥{yen(item.incl)}
            </p>
          </div>
          <div className="text-right">
            <p style={{ color: C.sub, fontSize: '11.5px' }}>
              {dead
                ? `${t.taxAmount} ${t.lostTax}`
                : refunded
                  ? `${t.checkRefunded} ≈ NT$${twd(tax * settings.rate)}`
                  : `${t.taxAmount} ≈ NT$${twd(tax * settings.rate)}`}
            </p>
            <p
              className="mt-1 font-semibold tabular-nums"
              style={{
                fontSize: '26px',
                color: dead ? C.sub : C.blueDeep,
                ...(dead ? strike : {}),
              }}
            >
              ¥{yen(tax)}
            </p>
          </div>
        </div>

        <div
          className="mt-3 grid grid-cols-3 gap-2"
          style={{
            fontSize: '11.5px',
            color: C.sub,
            borderTop: `1px solid ${C.line}`,
            paddingTop: '10px',
          }}
        >
          <span>
            {t.taxRate} {item.rate === 'mixed' ? '8% / 10%' : `${item.rate}%`}
          </span>
          <span>
            {t.netAmount} ¥{yen(netOfItem(item))}
          </span>
          <span>
            {t.groupTotal} ¥{yen(group ? group.net : netOfItem(item))}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {dead ? (
            <>
              <Badge tone="clay">{t.consumedShort}</Badge>
              <Badge tone="clay">{t.dead}</Badge>
              {item.unpacked && <Badge tone="outline">{t.unpackedShort}</Badge>}
            </>
          ) : refunded ? (
            <Badge tone="sage">{t.stage.refunded}</Badge>
          ) : (
            <>
              {groupOk ? (
                <Badge tone="sage">{t.reachedShort}</Badge>
              ) : (
                <Badge tone="clay">{t.notReached}</Badge>
              )}
              {!blocked && cur < 2 && (
                <Badge tone="blue">{t.pendingCheck}</Badge>
              )}
              {item.unpacked && <Badge tone="outline">{t.unpackedShort}</Badge>}
            </>
          )}
        </div>

        <div className="mt-8">
          <p
            className="font-bold"
            style={{
              color: C.blue,
              fontSize: '10.5px',
              letterSpacing: '0.22em',
            }}
          >
            {t.status}
          </p>
          <div className="mt-3">
            {STAGES.map((s, i) => {
              const reached = i <= cur;
              const isCur = i === cur && !dead;
              const stalledRow = dead && i === 1;
              const dis = blocked && i >= 2;
              const label = stalledRow ? t.stalledShort : t.stage[s];
              const sqStyle = stalledRow
                ? {
                    border: `1px solid ${C.clay}`,
                    backgroundColor: 'transparent',
                  }
                : dead && i > 1
                  ? {
                      border: `1px solid ${C.line}`,
                      backgroundColor: 'transparent',
                    }
                  : dead && i === 0
                    ? { border: `1px solid ${C.clay}`, backgroundColor: C.clay }
                    : reached && refunded
                      ? {
                          border: `1px solid ${C.sage}`,
                          backgroundColor: C.sage,
                        }
                      : reached
                        ? {
                            border: `1px solid ${C.blue}`,
                            backgroundColor: C.blue,
                          }
                        : {
                            border: `1px solid ${C.line}`,
                            backgroundColor: 'transparent',
                          };
              return (
                <button
                  key={s}
                  onClick={() => onStatus(s)}
                  disabled={dis}
                  className="flex w-full items-center gap-3 py-3 text-left"
                  style={{
                    backgroundColor:
                      isCur || stalledRow ? C.soft : 'transparent',
                    borderTop: `1px solid ${i === 0 ? C.ink : C.line}`,
                    ...(isCur || stalledRow
                      ? {
                          margin: '0 -8px',
                          paddingLeft: '8px',
                          paddingRight: '8px',
                        }
                      : {}),
                  }}
                >
                  <span
                    className="shrink-0"
                    style={{ width: '9px', height: '9px', ...sqStyle }}
                  />
                  <span
                    className="flex-1"
                    style={{
                      fontSize: '15px',
                      fontWeight: isCur || stalledRow ? 700 : 400,
                      color: stalledRow ? C.clayInk : reached ? C.ink : C.sub,
                    }}
                  >
                    {label}
                  </span>
                  <span className="shrink-0" style={{ fontSize: '12px' }}>
                    {stalledRow ? (
                      <Badge tone="clay">{t.cantRefund}</Badge>
                    ) : isCur && refunded ? (
                      <Badge tone="sage">{t.checkDone}</Badge>
                    ) : isCur ? (
                      <Badge tone="blue">{t.currentTag}</Badge>
                    ) : dis ? (
                      <span style={{ color: C.sub }}>—</span>
                    ) : reached ? (
                      i === 0 && (
                        <span className="tabular-nums" style={{ color: C.sub }}>
                          {fmtShort(item.date)}
                        </span>
                      )
                    ) : (
                      <span
                        className="flex items-center gap-0.5"
                        style={{ color: C.blueDeep }}
                      >
                        {t.markTag} <ChevronRight size={12} />
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {dead ? (
          <>
            <p
              className="mt-6"
              style={{
                backgroundColor: C.soft,
                borderLeft: `3px solid ${C.clay}`,
                color: C.clayInk,
                fontSize: '13px',
                lineHeight: 2,
                padding: '14px',
              }}
            >
              {t.warnConsumed}
            </p>
            <p
              className="mt-3"
              style={{ color: C.sub, fontSize: '12px', lineHeight: 1.8 }}
            >
              {t.packNoteShort}
            </p>
          </>
        ) : refunded ? (
          <p
            className="mt-6"
            style={{
              backgroundColor: C.soft,
              color: C.ink,
              fontSize: '13px',
              lineHeight: 2,
              padding: '14px',
            }}
          >
            {t.refundedNote}
          </p>
        ) : (
          <p
            className="mt-6"
            style={{
              backgroundColor: C.soft,
              color: C.ink,
              fontSize: '13px',
              lineHeight: 2,
              padding: '14px',
            }}
          >
            {t.packNote}
          </p>
        )}

        {item.note && (
          <p
            className="mt-4"
            style={{ color: C.sub, fontSize: '13px', lineHeight: 1.8 }}
          >
            {item.note}
          </p>
        )}

        {!dead && (
          <div className="mt-6">
            <p
              className="font-bold"
              style={{
                color: C.blue,
                fontSize: '10.5px',
                letterSpacing: '0.22em',
              }}
            >
              {t.photo}
            </p>
            <div
              className="mt-2 flex items-center justify-center"
              style={{ backgroundColor: C.soft, height: '96px' }}
            >
              {photo ? (
                <img src={photo} alt="" className="h-full object-contain" />
              ) : (
                <span style={{ color: C.sub, fontSize: '13px' }}>{t.photo}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </FullScreenSheet>
  );
}
