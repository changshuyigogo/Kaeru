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
import { App as CapacitorApp } from '@capacitor/app';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import ReceiptScanner from './receiptScanner.js';

/* ------------------------------------------------------------------
   返回鍵／左緣滑動／畫面上「‹」統一處理。

   用 history.pushState 當「還疊著幾層 sheet/面板」的唯一真相：每打開
   一層（sheet、面板、非總覽的分頁）就 push 一筆，帶一個獨一無二的
   token；popstate 一律只關「目前 token 等於全域深度」那一層，一次
   只退一層。手機硬體返回鍵（Android，透過 @capacitor/app 轉成
   history.back()）跟左緣滑動（iOS，WKWebView 手勢本來就是操作同一份
   history）都會變成 popstate，跟畫面上按鈕點的「返回/‹/✕」走同一條
   路——按鈕關閉時該層會主動呼叫 history.back() 把自己那筆吃掉，
   避免堆疊跟瀏覽器 history 長度兜不起來。
------------------------------------------------------------------ */
let kaeruBackDepth = 0;
const kaeruBackHandlers = new Set();
// 有一層自己主動關（按了畫面上的按鈕/元件被拿掉）時，會呼叫
// history.back() 把自己那筆 entry 吃掉，讓深度跟畫面對齊——但這樣
// 一來也會產生一個「真的」popstate 事件。如果照樣把這個 popstate
// 廣播給所有還在監聽的 handler，「現在變成最上層」的那一層（通常是
// 剛關掉那層的父層）會誤判成「輪到我被使用者按返回關掉了」，然後
// 也跟著關掉——結果是關一層、自動連著再關一層，甚至讓有未存變動的
// 表單以為使用者要放棄。這個計數器記錄「接下來有幾個 popstate 是
// 我們自己 history.back() 造成的、不是使用者真的按返回/滑動」，
// 廣播前先扣掉，扣得到就直接吞掉，不發給任何 handler。
let kaeruSuppressPop = 0;

function useBackClose(isOpen, onClose) {
  const depthRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // 這一層在畫面上的存在方式有兩種：整個元件只在開著時才掛載（掛上=
  // 開、拿掉=關，這個 app 大部分 sheet 都是這樣），或是元件本身一直
  // 掛著、isOpen 這個 prop 自己在 true/false 之間切換（例如總覽以外
  // 的分頁）。兩種都靠同一個 effect 處理：開的時候 push 一筆，「關」
  // 不管是因為 isOpen 變 false 還是元件被整個拿掉，都會讓這個 effect
  // 的 cleanup 跑一次，在 cleanup 裡把那筆 history entry 吃掉——不用
  // 另外去偵測「isOpen 從 true 變 false」，unmount 本來就會觸發 cleanup。
  useEffect(() => {
    if (!isOpen) return;
    kaeruBackDepth += 1;
    const myDepth = kaeruBackDepth;
    depthRef.current = myDepth;
    window.history.pushState({ kaeruDepth: myDepth }, '');

    function handlePop() {
      // 一定要連 kaeruBackDepth（全域「目前最上層是誰」）一起比對，
      // 只比 depthRef.current === myDepth 是不夠的——那個條件只代表
      // 「這一層還沒被關過」，任何還開著的層都會通過，一次 popstate
      // 會把所有還開著的層通通關掉，不是只關最上面那一層。
      if (depthRef.current === myDepth && kaeruBackDepth === myDepth) {
        depthRef.current = null;
        kaeruBackDepth -= 1;
        closeRef.current();
      }
    }
    kaeruBackHandlers.add(handlePop);

    return () => {
      kaeruBackHandlers.delete(handlePop);
      // depthRef.current 還是 myDepth，代表這層不是被 popstate 關掉
      // 的（是按了畫面上的按鈕，或元件被拿掉）——把剛剛推的那筆吃掉，
      // 讓堆疊深度跟畫面對齊，同時記一筆「這個 popstate 不用發給任何
      // handler」，避免波及現在變成最上層的那一層。
      if (depthRef.current === myDepth) {
        depthRef.current = null;
        if (kaeruBackDepth === myDepth) kaeruBackDepth -= 1;
        if (window.history.state && window.history.state.kaeruDepth === myDepth) {
          kaeruSuppressPop += 1;
          window.history.back();
        }
      }
    };
  }, [isOpen]);
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (kaeruSuppressPop > 0) {
      kaeruSuppressPop -= 1;
      return;
    }
    for (const fn of kaeruBackHandlers) fn();
  });
}

// 新增收據／編輯行程／裁切照片這三個表單共用：返回（不管是按鈕、
// 硬體返回鍵還是滑動）時如果有還沒存的變動，先問要不要放棄，不要
// 直接丟掉。選「繼續編輯」要讓這一層重新排回 history 堆疊最上面，
// 不然下一次返回會找不到人接——靠 gen 這個世代計數器強迫
// useBackClose 的 effect 重新跑一次（同一層再 push 一筆新的）。
function useDirtyBackGuard(isDirty, onClose) {
  const [discardOpen, setDiscardOpen] = useState(false);
  const [gen, setGen] = useState(0);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  function requestClose() {
    if (isDirtyRef.current) {
      setDiscardOpen(true);
      setGen((g) => g + 1);
    } else {
      onClose();
    }
  }

  useBackClose(`kaeruLayer:${gen}`, requestClose);

  return {
    discardOpen,
    requestClose,
    keepEditing: () => setDiscardOpen(false),
    discard: () => {
      setDiscardOpen(false);
      onClose();
    },
  };
}

// 「這筆還沒存，要放棄嗎？」的確認面板，三個表單共用一份文字跟樣式。
function DiscardConfirmSheet({ t, onKeepEditing, onDiscard }) {
  return (
    <BottomSheet onClose={onKeepEditing}>
      <p className="font-bold" style={{ fontSize: '15px', color: C.ink }}>
        {t.discardTitle}
      </p>
      <div className="mt-4 flex gap-2">
        <button
          onClick={onKeepEditing}
          className="flex-1 py-3 text-sm font-semibold"
          style={{ border: `1px solid ${C.line}`, color: C.ink }}
        >
          {t.keepEditing}
        </button>
        <button
          onClick={onDiscard}
          className="flex-1 py-3 text-sm font-bold"
          style={{ backgroundColor: C.clay, color: '#FFFFFF' }}
        >
          {t.discard}
        </button>
      </div>
    </BottomSheet>
  );
}

// 「關掉這一層、換開另一層」（例如選單→行程切換面板）如果兩個
// setState 落在同一次 React commit，關閉那層的 history.back() 跟開啟
// 那層的 history.pushState 會搶在同一個 tick 裡執行——history.back()
// 的實際 popstate 是排到之後才觸發的，如果 pushState 在它完成之前就
// 搶先執行，History API 沒有保證這種混用的順序（實測過：用固定的
// setTimeout(0) 延遲不夠保險，pushState 有時還是搶在 popstate 前面
// 執行，導致堆疊深度跟畫面兜不起來）。改成真的等那個 popstate 先
// 觸發完，才執行「開新的那一半」；如果這次關閉根本沒有觸發
// history.back()（沒有東西可吃），用一個短逾時保底，不要卡死。
function deferOpen(fn) {
  let done = false;
  function run() {
    if (done) return;
    done = true;
    window.removeEventListener('popstate', onPop);
    clearTimeout(timer);
    fn();
  }
  function onPop() {
    run();
  }
  window.addEventListener('popstate', onPop);
  const timer = setTimeout(run, 60);
}

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
const MAX_PHOTOS = 4; // 一張收據最多存幾張照片

// refundMethod 這個欄位是後來才加的，舊收據沒存過這個值，要從當時的
// status 反推。只有 status 剛好停在「已登記」（STAGES 索引 1）才是
// 可靠訊號——這個 app 裡只有主動勾選「有登記退款方式」才會停在這一站。
// 一旦繼續推進到「已查驗」或「已退款」，可能是使用者自己在表單裡一路
// 點過去（那樣真的有登記），也可能是查驗頁的「全部標記為已查驗」直接
// 從「已購買」跳過去（那個動作完全不會讀退款方式，見 CheckView 的
// onVerifyAll）——兩條路徑存下來的 status 長得一樣，分不出來，這時候
// 老實回答「不確定」，不要在沒有真正依據的情況下替使用者捏造答案。
function inferRefundMethod(initial) {
  if (!initial) return 'unsure';
  if (initial.refundMethod) return initial.refundMethod;
  return STAGES.indexOf(initial.status) === 1 ? 'registered' : 'unsure';
}

// 行程 id 原本只用 `t_${Date.now()}`，跟收據 id（`r_${Date.now()}_隨機
// 碼`）不是同一套規格——快速連續建立兩趟行程（例如快點兩下「建立」）
// 理論上可能撞出同一個毫秒、產生兩筆一樣的 id，其中一筆會變成看不到
// 也刪不掉的幽靈行程。補上跟收據 id 同一套隨機碼。
function genTripId() {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// 日本有國際定期航線的機場約 34 座，只放這些，不追求完整——找不到就選
// 「其他機場」，用預設 3 小時。region 是地區 key（對應 AIRPORT_REGIONS），
// city 是機場所在城市，hours 是建議提早幾小時（給總覽倒數區跟回程當天
// 流程第一條用）。機場名稱、城市、地區名都是日文原文地名，中日文介面
// 共用同一份，不分開翻譯——跟機場名稱本身一樣，本來就是專有名詞。
const AIRPORTS = [
  // 主要樞紐
  { code: 'NRT', name: '成田国際空港', city: '東京', region: 'hub', hours: 3.5 },
  { code: 'HND', name: '東京国際空港', city: '羽田', region: 'hub', hours: 3 },
  { code: 'KIX', name: '関西国際空港', city: '大阪', region: 'hub', hours: 3.5 },
  { code: 'NGO', name: '中部国際空港', city: '名古屋', region: 'hub', hours: 3 },
  { code: 'FUK', name: '福岡空港', city: '福岡', region: 'hub', hours: 3 },
  // 北海道
  { code: 'CTS', name: '新千歳空港', city: '札幌', region: '北海道', hours: 3 },
  { code: 'HKD', name: '函館空港', city: '函館', region: '北海道', hours: 2.5 },
  { code: 'AKJ', name: '旭川空港', city: '旭川', region: '北海道', hours: 2.5 },
  // 東北
  { code: 'SDJ', name: '仙台空港', city: '仙台', region: '東北', hours: 2.5 },
  { code: 'AOJ', name: '青森空港', city: '青森', region: '東北', hours: 2 },
  { code: 'HNA', name: '花巻空港', city: '岩手', region: '東北', hours: 2 },
  { code: 'AXT', name: '秋田空港', city: '秋田', region: '東北', hours: 2 },
  { code: 'FKS', name: '福島空港', city: '福島', region: '東北', hours: 2 },
  // 関東
  { code: 'IBR', name: '茨城空港', city: '茨城', region: '関東', hours: 2 },
  // 中部・北陸
  { code: 'KMQ', name: '小松空港', city: '石川', region: '中部・北陸', hours: 2.5 },
  { code: 'KIJ', name: '新潟空港', city: '新潟', region: '中部・北陸', hours: 2 },
  { code: 'TOY', name: '富山空港', city: '富山', region: '中部・北陸', hours: 2 },
  { code: 'FSZ', name: '静岡空港', city: '静岡', region: '中部・北陸', hours: 2.5 },
  // 関西
  { code: 'UKB', name: '神戸空港', city: '神戸', region: '関西', hours: 2.5 },
  // 中国
  { code: 'OKJ', name: '岡山空港', city: '岡山', region: '中国', hours: 2 },
  { code: 'HIJ', name: '広島空港', city: '広島', region: '中国', hours: 2.5 },
  { code: 'YGJ', name: '米子空港', city: '鳥取', region: '中国', hours: 2 },
  // 四国
  { code: 'TAK', name: '高松空港', city: '香川', region: '四国', hours: 2 },
  { code: 'MYJ', name: '松山空港', city: '愛媛', region: '四国', hours: 2 },
  { code: 'KCZ', name: '高知空港', city: '高知', region: '四国', hours: 2 },
  // 九州
  { code: 'KMJ', name: '熊本空港', city: '熊本', region: '九州', hours: 2 },
  { code: 'KOJ', name: '鹿児島空港', city: '鹿児島', region: '九州', hours: 2.5 },
  { code: 'KMI', name: '宮崎空港', city: '宮崎', region: '九州', hours: 2 },
  { code: 'OIT', name: '大分空港', city: '大分', region: '九州', hours: 2 },
  { code: 'HSG', name: '佐賀空港', city: '佐賀', region: '九州', hours: 2 },
  // 清單頁副標是「北九州」，但搜尋結果頁改標「福岡県 · 北九州」（讓人
  // 知道北九州在福岡縣）——citySearchLabel 只給搜尋結果用，清單分組
  // 瀏覽仍用 city。
  { code: 'KKJ', name: '北九州空港', city: '北九州', citySearchLabel: '福岡県 · 北九州', region: '九州', hours: 2 },
  // 沖縄
  { code: 'OKA', name: '那覇空港', city: '沖縄', region: '沖縄', hours: 2.5 },
  { code: 'ISG', name: '石垣空港', city: '石垣島', region: '沖縄', hours: 2 },
  { code: 'SHI', name: '下地島空港', city: '宮古島', region: '沖縄', hours: 2 },
];

// 地區清單固定順序；chip 是籌碼列的短標籤，header 是清單裡的組標題
// （中部・北陸在籌碼列縮寫成「中部」，主要樞紐的中日文標籤不一樣，
// 其他地區都是日文地名，中日文介面共用）。
const AIRPORT_REGIONS = [
  { key: 'hub', chip: null, header: null },
  { key: '北海道', chip: '北海道', header: '北海道' },
  { key: '東北', chip: '東北', header: '東北' },
  { key: '関東', chip: '関東', header: '関東' },
  { key: '中部・北陸', chip: '中部', header: '中部・北陸' },
  { key: '関西', chip: '関西', header: '関西' },
  { key: '中国', chip: '中国', header: '中国' },
  { key: '四国', chip: '四国', header: '四国' },
  { key: '九州', chip: '九州', header: '九州' },
  { key: '沖縄', chip: '沖縄', header: '沖縄' },
];
const DEFAULT_ARRIVE_HOURS = 3; // 選了「其他機場」或沒選，一律預設 3 小時

function arriveHoursText(t, hours) {
  const h = Math.floor(hours);
  const half = hours - h >= 0.5;
  return half ? `${h} ${t.hours} 30 ${t.min}` : `${h} ${t.hours}`;
}

function regionLabel(t, region, kind) {
  if (region.key === 'hub') return kind === 'chip' ? t.airportHubChip : t.airportHubHeader;
  return region[kind];
}

// 搜尋比對＋標出命中片段：優先順序是機場名>城市>代碼，只標出「造成
// 這筆結果出現」的那個欄位，不會每個欄位裡出現的字都標（跟 37 號截圖
// 裡福岡空港只標名稱、北九州空港只標城市的行為一致）。
function findMatch(text, q) {
  if (!q) return null;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return null;
  return { idx, len: q.length };
}

function Highlight({ text, match }) {
  if (!match) return <>{text}</>;
  return (
    <>
      {text.slice(0, match.idx)}
      <span style={{ color: C.blueDeep, fontWeight: 700, borderBottom: `1px solid ${C.blue}` }}>
        {text.slice(match.idx, match.idx + match.len)}
      </span>
      {text.slice(match.idx + match.len)}
    </>
  );
}

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
    departIn: '回程班機起飛前　出発便まで',
    departHint: '設定裡的起飛時間',
    days: '天',
    hours: '小時',
    min: '分',
    setDeparture: '設定回程班機時間',
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
    departChecklist: '回程當天流程',
    step1: (hrsText) => `提早 ${hrsText}到機場，行李先不要託運`,
    step2: '連上國際線出發大廳的專用無線網路，開啟 VJW',
    step3: '用 VJW 辦海關確認，或到自助機台掃護照',
    step4: '判定通過後再去航空公司櫃檯託運行李',
    receipts: '收據',
    addReceipt: '新增收據',
    groupHint: '同一間店、同一天會合併計算稅抜金額',
    filters: { all: '全部', pending: '待補', todo: '待處理', done: '已完成' },
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
    photoSheetSub: '照片只存在這台裝置上，不會上傳。',
    takePhotoOption: '拍照',
    takePhotoHint: '開相機，對準收據拍一張',
    chooseFromLibrary: '從相簿選',
    libraryHint: '最多選 4 張',
    scanDoc: '掃描文件',
    scanDocHint: '自動抓邊框、拉正、去陰影',
    frameReminder: '檢查整張收據有沒有拍進框內，最下面的稅率金額要拍到',
    cameraDenied: '沒有相機權限',
    photoDenied: '沒有照片圖庫權限',
    openSettings: '去設定開啟',
    confirmPhoto: '確認照片',
    retakePhoto: '重拍',
    usePhoto: '使用',
    useWithAmount: '使用這張並帶入金額',
    useOnly: '使用這張',
    toolAdjustBorder: '調整邊框',
    toolRotate: '旋轉',
    toolContrast: '增強對比',
    edgeAutoOk: '邊框已自動抓好',
    ocrAmountLabel: '從照片讀到的金額',
    ocrHint: '可以直接帶入表單，之後仍可手動改',
    reorderPhotos: '整理',
    doneReorder: '完成',
    addOneMore: '再加 1 張',
    thumbHint: (n) => `點縮圖放大檢視，右上角 ✕ 刪除。最多 ${n} 張。`,
    photoDeleteHint: (n) => `右上角 ✕ 刪除。最多 ${n} 張。`,
    photoStorageNote: '這裡存的是另存的副本，只在這台裝置上，不是手機相簿裡的原始照片。刪掉收據時，App 裡的副本會一起刪掉。',
    zoomHint: '雙指縮放看細節',
    swipeHint: '左右滑動換照片',
    deletePhotoTitle: '刪除這張照片',
    deletePhotoBodyMulti: (n) =>
      `這張收據還有另外 ${n} 張照片，刪掉這張不影響金額和狀態。刪除後無法復原。`,
    deletePhotoBodyLast: '這是最後一張照片。刪除後這張收據就沒有照片紀錄了。',
    note: '備註',
    save: '儲存',
    edit: '編輯',
    cancel: '取消',
    discardTitle: '這筆還沒存，要放棄嗎？',
    keepEditing: '繼續編輯',
    discard: '放棄',
    exitPressAgain: '再按一次返回鍵就離開',
    exitDataSafe: '收據都存好了，資料不會不見',
    exitStay: '留下',
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
    tripUnnamed: '還沒命名的行程',
    unfilled: '未填',
    noDeparture: '未設定回程班機時間',
    tripReceipts: '張收據',
    tripSwitch: '切換到這趟',
    tripDelete: '刪除這趟行程',
    tripDeleteConfirm: '刪除這趟？裡面的收據會一起刪掉，沒辦法復原。',
    depPrefix: '回程',
    tripPast: '過去的行程',
    tripNow: '進行中',
    editTrip: '編輯行程',
    airport: '出境機場',
    airportPick: '選擇出境機場',
    back: '返回',
    airportSearchPh: '搜尋機場、城市或代碼',
    airportSearchHint: (n) => `共 ${n} 座有國際線的機場。機場決定建議抵達時間。`,
    arriveEarlyPrefix: '提早',
    airportSelected: '已選',
    airportOtherHint: '找不到你的機場也沒關係，選「其他機場」就用預設的 3 小時。',
    airportOther: '其他機場',
    airportHubChip: '樞紐',
    airportHubHeader: '主要樞紐',
    airportResultCount: (n) => `${n} 個結果 · 也可以輸入 FUK 這種代碼`,
    airportItmNote: '找不到？大阪的伊丹空港（ITM）目前沒有國際定期航班，出境要到関西国際空港。',
    departureHint: '改了回程時間，總覽的倒數和建議抵達時間會跟著算。',
    setActiveTrip: '設為目前行程',
    setActiveTripHint: '新增收據時預設存到這趟',
    tripReceiptsSection: '這趟的收據',
    inclTotalShort: '含稅合計',
    statusPending: '張待處理',
    statusRefunded: '張已退款',
    statusDead: '張失效',
    deleteTripWarning: (n) => `刪除行程會一起刪掉這 ${n} 張收據和 App 裡存的照片副本，無法復原。`,
    emptyUnnamedKicker: '這趟行程',
    emptyUnnamedTitle: '還沒有名字',
    emptyUnnamedDesc:
      '收據會存進一趟行程裡。先幫這趟取個名字、填上回程時間，之後的倒數和查驗進度才算得出來。',
    emptyUnnamedCta: '先幫這趟行程取個名字',
    emptyUnnamedOr: '或者',
    emptyUnnamedEscape: '先加一張收據，晚點再填',
    emptyUnnamedRulesTitle: '先看懂規則',
    rule1: '同一間店、同一天，稅抜合計滿 5,000 円才能退',
    rule2: '在日本吃掉、用掉的東西，那張收據整張失效',
    rule3: '購買日算起 90 天內要辦完手續',
    tripCreatedBadge: '行程已建立',
    noReceiptsTitle: '還沒有收據',
    noReceiptsDesc:
      '在免稅櫃檯結完帳，就把收據拍進來。同一間店同一天的會自動合併計算。',
    rulesLinkLabel: '先看一遍規則',
    departedTopLabel: '這趟已經結束　帰国済み',
    departedValue: '已出境',
    refundedTotalLabel: '已退回稅額',
    endedSheetTitle: '這趟看起來結束了',
    endedSheetDesc: (name, days, count) =>
      `${name}的回程班機已經飛了 ${days} 天，${count} 張收據也都處理完。要開始新的行程嗎？`,
    endedSheetSettleLabel: '這趟總共退回',
    endedSheetCta: '建立新行程',
    endedSheetNotNow: '先不要',
    endedSheetViewRecords: '看這趟的紀錄',
    endedSheetFooterNote: '舊行程和收據都會留著，隨時可以從選單切回來。',
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
      home: '倒數、金額、回程當天流程',
      list: '新增與管理每一張收據',
      check: '機場現場核對還剩幾張',
      faq: '規則、小撇步、情境模擬',
      set: '匯率、語言、資料',
    },
    menuTrip: '切換行程',
    menuLang: '語言',
    menuAdd: '新增收據',
    menuCurrent: '目前',
    tripCountUnit: '趟行程',
    sim: '試走一趟大阪',
    simSub: '跟著走一趟，看你能退多少',
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
    departure: '回程班機時間',
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

    // ---- 2b 體驗調整 ----
    todayActionTitle: '今天要辦的事',
    todayActionLine: (n) => `還有 ${n} 張沒辦完`,
    todayActionDone: '都辦完了',
    goCheck: '去核對',
    deadlineBannerTitle: (n, days) => `${n} 張收據 ${days} 天後過期`,
    deadlineBannerDetail: (amount, shop) => `¥${amount} 拿不回來 · ${shop}`,
    expiredBadge: '已過期',
    filterPendingBanner: (n) => `${n} 張資料待補`,
    filterPendingBannerDesc: '待補的收據不算進預估可退稅額。有空時補上店名和日期。',
    pendingShopPlaceholder: '店名待補',
    pendingCapturedOn: (date) => `${date} 拍的`,
    pendingBadge: '資料待補',
    pendingFillLink: '補上店名和日期',
    quickAddTitle: '拍好了',
    quickAddSave: '存起來',
    quickAddGotAmount: '讀到金額了',
    quickAddReadIncl: '從照片讀到的含稅金額',
    quickAddRateLine: (rate, net, tax) => `稅率 ${rate}% · 稅抜 ¥${net} · 稅額 ¥${tax}`,
    refundQ: '這張在店裡登記退款方式了嗎？',
    refundOptRegistered: '有登記',
    refundOptNo: '沒有',
    refundOptUnsure: '不確定',
    refundHint: '最容易漏掉的一步。沒登記的話，錢不會自動退。',
    pendingFieldsLabel: '店名和日期',
    pendingFieldsDesc: '照片讀不到，晚點再補',
    quickSaveCta: '存起來，晚點再補',
    quickFullFormCta: '現在就填完整資料',
    refundCheckTitle: '錢進來了嗎',
    refundCheckSubtitle: (tripName, days) => `${tripName} · 回程後 ${days} 天`,
    refundCheckDesc: (n) =>
      `這趟有 ${n} 張收據通過查驗了。錢已經進帳的請勾起來，這樣才知道還在等哪幾筆。`,
    refundCheckWaiting: '還在等',
    refundCheckInfo:
      '退款由免稅店或它委託的退款業者處理，入帳時間各店不同，兩到三週都算正常。超過一個月還沒進來，先找店家，不是海關。',
    refundCheckNotYet: '還沒收到',
    refundCheckAllIn: '都收到了',
    refundCheckRemindLater: '7 天後再提醒我一次',
    emptyUnnamedSimKicker: '還沒搞懂規則？',
    emptyUnnamedSimDesc:
      '跟著走一趟，看你能退多少。門檻、失效、期限，走完就懂了。',
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
    min: '分',
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
    step1: (hrsText) => `${hrsText}前に空港へ。荷物はまだ預けない`,
    step2: '国際線出発ロビーの専用無線 LAN に接続し VJW を開く',
    step3: 'VJW で税関確認、または端末でパスポートを読み取る',
    step4: '判定後に航空会社カウンターで荷物を預ける',
    receipts: 'レシート',
    addReceipt: 'レシートを追加',
    groupHint: '同一店舗・同一日は税抜金額が合算されます',
    filters: {
      all: 'すべて',
      pending: '情報待ち',
      todo: '未処理',
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
    photoSheetSub: '写真はこの端末にだけ保存されます。アップロードはされません。',
    takePhotoOption: '写真を撮る',
    takePhotoHint: 'カメラを起動してレシートを撮影',
    chooseFromLibrary: 'フォトライブラリから選ぶ',
    libraryHint: '最大 4 枚まで選択',
    scanDoc: '文書をスキャン',
    scanDocHint: '枠を自動検出・補正、影も除去',
    frameReminder: 'レシート全体が写っているか確認してください。下部の税率・金額も撮れていますか？',
    cameraDenied: 'カメラの権限がありません',
    photoDenied: 'フォトライブラリの権限がありません',
    openSettings: '設定を開く',
    confirmPhoto: '写真を確認',
    retakePhoto: '再撮影',
    usePhoto: '使用',
    useWithAmount: 'この写真を使って金額を入力',
    useOnly: 'この写真を使う',
    toolAdjustBorder: '枠を調整',
    toolRotate: '回転',
    toolContrast: 'コントラスト強化',
    edgeAutoOk: '枠を自動検出済み',
    ocrAmountLabel: '写真から読み取った金額',
    ocrHint: 'そのままフォームに入力できます。後で手動修正も可能',
    reorderPhotos: '並び替え',
    doneReorder: '完了',
    addOneMore: 'もう 1 枚追加',
    thumbHint: (n) => `サムネイルをタップで拡大、右上の ✕ で削除。最大 ${n} 枚。`,
    photoDeleteHint: (n) => `右上の ✕ で削除。最大 ${n} 枚。`,
    photoStorageNote: 'ここに保存されるのは複製で、この端末にだけ置かれます（スマホの写真アプリ内の元の写真ではありません）。レシートを削除すると、App 内の複製も一緒に削除されます。',
    zoomHint: 'ピンチで拡大',
    swipeHint: '左右にスワイプで切り替え',
    deletePhotoTitle: 'この写真を削除',
    deletePhotoBodyMulti: (n) =>
      `このレシートには他に ${n} 枚の写真があります。この写真を削除しても金額やステータスに影響しません。削除後は元に戻せません。`,
    deletePhotoBodyLast: 'これは最後の写真です。削除するとこのレシートには写真がなくなります。',
    note: 'メモ',
    save: '保存',
    edit: '編集',
    cancel: 'キャンセル',
    discardTitle: 'まだ保存されていません。破棄しますか？',
    keepEditing: '編集を続ける',
    discard: '破棄',
    exitPressAgain: 'もう一度戻るボタンを押すと終了します',
    exitDataSafe: 'レシートは保存済みです。データは消えません',
    exitStay: '留まる',
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
    tripUnnamed: '名前未設定の旅程',
    unfilled: '未入力',
    noDeparture: '出発時刻 未設定',
    tripReceipts: '件',
    tripSwitch: 'この旅程に切り替え',
    tripDelete: 'この旅程を削除',
    tripDeleteConfirm:
      '削除しますか。レシートも一緒に削除され、元に戻せません。',
    depPrefix: '出発',
    tripPast: '過去の旅程',
    tripNow: '進行中',
    editTrip: '旅程を編集',
    airport: '出発空港',
    airportPick: '出発空港を選択',
    back: '戻る',
    airportSearchPh: '空港名・都市名・略称で検索',
    airportSearchHint: (n) => `国際線のある空港 ${n} カ所。空港によって到着目安が変わります。`,
    arriveEarlyPrefix: '目安',
    airportSelected: '選択中',
    airportOtherHint: '見つからなければ「その他の空港」を選べば、デフォルトの3時間で計算します。',
    airportOther: 'その他の空港',
    airportHubChip: '拠点',
    airportHubHeader: '主要空港',
    airportResultCount: (n) => `${n} 件 · FUK のような略称でも検索できます`,
    airportItmNote: '見つからない？大阪の伊丹空港（ITM）は現在国際定期便がありません。関西国際空港をご利用ください。',
    departureHint: '出発時刻を変えると、ホームのカウントダウンと到着目安も一緒に変わります。',
    setActiveTrip: '現在の旅程にする',
    setActiveTripHint: 'レシート追加時のデフォルト保存先になります',
    tripReceiptsSection: 'この旅程のレシート',
    inclTotalShort: '合計（税込）',
    statusPending: '件 未処理',
    statusRefunded: '件 返金済み',
    statusDead: '件 失効',
    deleteTripWarning: (n) => `旅程を削除すると、この ${n} 件のレシートと App 内に保存された写真の複製も一緒に削除されます。元に戻せません。`,
    emptyUnnamedKicker: 'この旅程',
    emptyUnnamedTitle: 'まだ名前がありません',
    emptyUnnamedDesc:
      'レシートは旅程に紐づいて保存されます。まず名前と帰国時刻を入れておくと、カウントダウンや確認の進み具合が計算できるようになります。',
    emptyUnnamedCta: 'この旅程に名前をつける',
    emptyUnnamedOr: 'または',
    emptyUnnamedEscape: '先にレシートを追加して、あとで入力する',
    emptyUnnamedRulesTitle: 'ルールを先に知っておく',
    rule1: '同一店舗・同一日、税抜合計 5,000 円以上で返金対象',
    rule2: '日本国内で消費・使用した物は、そのレシート全体が無効',
    rule3: '購入日から 90 日以内に手続きが必要',
    tripCreatedBadge: '旅程を作成済み',
    noReceiptsTitle: 'まだレシートがありません',
    noReceiptsDesc:
      '免税カウンターで会計したら、レシートを撮影してください。同一店舗・同一日のものは自動でまとめて計算されます。',
    rulesLinkLabel: 'ルールを先に確認する',
    departedTopLabel: 'この旅は終わりました',
    departedValue: '帰国済み',
    refundedTotalLabel: '返金済み額',
    endedSheetTitle: 'この旅程は終わったようです',
    endedSheetDesc: (name, days, count) =>
      `${name}の帰国便が飛んでから ${days} 日、レシート ${count} 件も処理済みです。新しい旅程を始めますか？`,
    endedSheetSettleLabel: '今回の返金合計',
    endedSheetCta: '新しい旅程を作る',
    endedSheetNotNow: '今はしない',
    endedSheetViewRecords: 'この旅程の記録を見る',
    endedSheetFooterNote:
      '前の旅程とレシートはそのまま残ります。メニューからいつでも切り替えられます。',
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
      home: 'カウントダウン、金額、帰国当日の流れ',
      list: 'レシートの追加と管理',
      check: '空港で残り件数を確認',
      faq: 'ルール・コツ・シミュレーション',
      set: 'レート、言語、データ',
    },
    menuTrip: '旅程を切り替え',
    menuLang: '言語',
    menuAdd: 'レシートを追加',
    menuCurrent: '現在',
    tripCountUnit: '件の旅程',
    sim: '大阪を試し歩き',
    simSub: '歩いてみれば、いくら返ってくるかわかります',
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
      '返金は免税店または委託された返金事業者が処理します。入金時期は店舗により異なります。合わない場合は、税関ではなく店舗にご確認ください。',
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
    simPerfect:
      '満額返金、漏れはありません。レシート一覧で自分の分も確認しましょう：5,000 円に届いていないもの、消費してしまったもの、90 日が近いものがないか。',
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

    // ---- 2b 體驗調整 ----
    todayActionTitle: '今日やること',
    todayActionLine: (n) => `残り ${n} 件`,
    todayActionDone: 'すべて完了',
    goCheck: '確認へ',
    deadlineBannerTitle: (n, days) => `レシート ${n} 件が ${days} 日後に期限切れ`,
    deadlineBannerDetail: (amount, shop) => `¥${amount} が戻らなくなります · ${shop}`,
    expiredBadge: '期限切れ',
    filterPendingBanner: (n) => `${n} 件の情報待ち`,
    filterPendingBannerDesc:
      '情報待ちのレシートは返金見込み額に含まれません。時間があるときに店舗名と購入日を入力してください。',
    pendingShopPlaceholder: '店舗名 未入力',
    pendingCapturedOn: (date) => `${date} 撮影`,
    pendingBadge: '情報待ち',
    pendingFillLink: '店舗名と購入日を入力',
    quickAddTitle: '撮影完了',
    quickAddSave: '保存',
    quickAddGotAmount: '金額を読み取りました',
    quickAddReadIncl: '写真から読み取った税込金額',
    quickAddRateLine: (rate, net, tax) => `税率 ${rate}% · 税抜 ¥${net} · 消費税額 ¥${tax}`,
    refundQ: 'このレシート、お店で返金方法を登録しましたか？',
    refundOptRegistered: '登録した',
    refundOptNo: 'していない',
    refundOptUnsure: 'わからない',
    refundHint:
      '一番忘れやすいステップです。登録していないと、返金は自動的には行われません。',
    pendingFieldsLabel: '店舗名と購入日',
    pendingFieldsDesc: '写真から読み取れませんでした。後で入力してください',
    quickSaveCta: '保存して後で入力',
    quickFullFormCta: '今すぐ全部入力する',
    refundCheckTitle: '返金は届きましたか',
    refundCheckSubtitle: (tripName, days) => `${tripName} · 帰国後 ${days} 日`,
    refundCheckDesc: (n) =>
      `今回、確認済みのレシートが ${n} 件あります。入金済みのものにチェックを入れてください。`,
    refundCheckWaiting: '未入金',
    refundCheckInfo:
      '返金は免税店または委託された返金事業者が処理します。入金時期は店舗により異なり、2〜3 週間は正常です。1 か月を過ぎても届かない場合は、税関ではなく店舗にご確認ください。',
    refundCheckNotYet: 'まだ届いていない',
    refundCheckAllIn: 'すべて届いた',
    refundCheckRemindLater: '7 日後にもう一度知らせる',
    emptyUnnamedSimKicker: 'ルールがまだよくわからない？',
    emptyUnnamedSimDesc:
      '歩いてみれば、いくら返ってくるかわかります。下限・無効・期限、歩き終わればわかります。',
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
    q: { zh: '什麼是 VJW，要先辦嗎？', ja: 'VJW とは何ですか。先に登録が必要ですか。' },
    a: {
      zh: 'Visit Japan Web，日本官方的入出境線上服務，出發前先註冊比較省時間。成田、羽田、關西、中部、新千歲、福岡、那霸這 7 個機場，連上機場指定 WiFi 後可以直接用手機辦海關確認，不必排自助機台。其他機場還是走機台。',
      ja: 'Visit Japan Web は日本の公式な出入国オンラインサービスです。出発前に登録しておくと時間の節約になります。成田・羽田・関西・中部・新千歳・福岡・那覇の 7 空港では、空港指定の Wi-Fi に接続すればスマートフォンでそのまま税関確認ができ、端末に並ぶ必要がありません。その他の空港は引き続き端末での手続になります。',
    },
  },
  {
    sec: 'exit',
    q: { zh: 'VJW 看得到退款進度嗎？', ja: 'VJW で返金の進み具合は確認できますか。' },
    a: {
      zh: '看不到。VJW 只顯示免稅店的購買紀錄和海關確認結果，退款方式有沒有登記、錢有沒有真的退回來，都不會出現。這兩段要自己記，Kaeru 就是在管這件事。',
      ja: 'できません。VJW に表示されるのは免税店の購入記録と税関確認の結果だけです。返金方法を登録したかどうか、実際に返金されたかどうかは表示されません。この 2 つは自分で管理する必要があり、それがまさに Kaeru の役目です。',
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
      ja: '持ち帰る物と分けて会計し、別のレシートにするのがおすすめです。消費しても影響はそのレシートだけに収まります。5,000 円の判定は同一店舗・同一日の合算なので、分けても問題ありませんが、店舗によって対応が異なる場合があるので、会計時に店員に確認してください。',
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

// 只留一條：加了「出境時」的 VJW 兩題之後，390×844 單頁剛好滿，其他
// 幾條小撇步（分開結帳、湊 5,000 円、集中放同一袋）跟已經有的 FAQ
// 問答重疊或另外佔位置，先拿掉。留這條是因為跟 App 本身的功能直接
// 相關，其他 FAQ 問答都沒提到。
const TIPS = [
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
// 用 Math.floor 不是 Math.round——含稅金額換算稅抜金額，小數 ≥0.5 用
// 四捨五入會多算 1 円，多筆商品加總後剛好卡在 5,000 円門檻邊界的組合，
// 可能因為這 1-2 円的捨入差異被判定成「達標」或「未達標」，跟店家
// 收銀機實際算出來的稅抜合計不一致。日本收銀機算稅抜金額慣例本來就是
// 捨去小數，不是四捨五入，改成 floor 更貼近實際情況。
const netOf = (incl, rate) =>
  Math.floor((incl || 0) / (1 + (rate || 10) / 100));
/* 混合稅率（8% 對象／10% 對象各一筆）：稅抜合計 = 兩段各自試算後相加，不是拿含稅總額套單一稅率 */
const netOfItem = (it) =>
  it.rate === 'mixed'
    ? netOf(it.incl8 || 0, 8) + netOf(it.incl10 || 0, 10)
    : netOf(it.incl, it.rate);
// 故意不用 toISOString()——那個是 UTC 日期，在台灣/日本這種 UTC+8/+9
// 的時區，每天凌晨到早上這段時間會被算成「昨天」，直接影響新增收據
// 預設的購買日期跟 90 天期限起算點。用 getFullYear/Month/Date 拿本機
// 時區的日期。
const todayStr = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};
const groupKey = (it) => `${(it.shop || '').trim()}||${it.date}`;

function daysLeft(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  // 只檢查 dateStr 是不是空字串不夠——資料匯入或損毀時，日期欄位可能
  // 不是空的，但格式不對，new Date() 會產生 Invalid Date，後面的運算
  // 會一路是 NaN，畫面上顯示「NaN 天」而不是安全地當作沒有日期。
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + 90);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d - now) / 86400000);
}

// 快速新增（先拍照晚點補）存下來、OCR 沒讀到店名的收據——用「店名是
// 空的」這個天然、不用額外欄位的訊號判斷，一旦使用者補上店名，這張
// 就自動不再是待補狀態，不用另外清一個旗標。完整表單本來就規定店名
// 是必填，正常流程永遠不會存出一張空店名的收據，所以這個判斷不會
// 誤判到既有資料。
function isPendingInfo(it) {
  return !it.shop || !it.shop.trim();
}

// 已經超過 90 天期限、還沒真的退到錢、也不是已在境內消費（那個是另一
// 種「死掉」，有自己的樣式跟文案）的收據——跟「已在境內消費」用同一套
// 對待方式：不刪除、不隱藏，但不再算進「還沒處理」或「預估可退稅額」，
// 因為那筆錢已經拿不回來了，算進去只會讓使用者以為還有機會。
function isExpiredUnclaimed(it) {
  // 「已查驗」（verified）跟這個 app 其他地方的既有慣例一樣，要當成
  // 錢已經到手——只排除 'refunded' 不夠，會讓已經查驗過、只是還沒
  // 手動標「已退款」的收據，一旦超過 90 天就被誤判成「來不及、拿不
  // 回來」，從 refundedTax 消失，又同時被算進「還沒處理」跳期限
  // 警示，兩邊自相矛盾。
  if (it.status === 'refunded' || it.status === 'verified' || it.consumed)
    return false;
  const d = daysLeft(it.date);
  return d !== null && d < 0;
}

// 首頁倒數（幾天幾小時）本身沒有 setInterval，dDays/dHours 只有在畫面
// 因為別的原因重新 render 時才會跟著重算一次——使用者把首頁開著不動，
// 倒數會停在打開那一刻，不會自然往下跳。這個 hook 每分鐘強迫重新
// render 一次，讓倒數自己會動；小時以下的精細度用不到，一分鐘夠了。
function useNowTick(intervalMs = 60000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

function compressImage(file, maxSide = 1000, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      compressImageSrc(reader.result, maxSide, quality).then(resolve, reject);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 跟 compressImage 一樣的縮圖／壓縮邏輯，但吃任意可載入的圖片來源
// （dataURL、blob URL、Capacitor 的 webPath...），相簿多選跟掃描結果都靠這個。
function compressImageSrc(src, maxSide = 1000, quality = 0.6) {
  return new Promise((resolve, reject) => {
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
    img.crossOrigin = 'anonymous';
    img.src = src;
  });
}

// 4 角透視校正：把來源影像中一個（可能歪斜的）四邊形裁出來拉正成矩形。
// 做法是把四邊形切成兩個三角形，各自求出對應輸出三角形的仿射矩陣，
// clip 之後用該矩陣畫整張圖——標準的「canvas 三角貼圖」技巧，不需要 WebGL。
function solveAffine(src3, dst3) {
  // 解兩個共用係數矩陣的 3x3 線性方程式（x 分量、y 分量分別求）
  const [[x0, y0], [x1, y1], [x2, y2]] = src3;
  const det =
    x0 * (y1 - y2) - y0 * (x1 - x2) + (x1 * y2 - x2 * y1);
  if (Math.abs(det) < 1e-6) return null;
  const solveFor = (X0, X1, X2) => {
    // Cramer's rule：a*x+c*y+e=X 對三個點列聯立
    const a =
      (X0 * (y1 - y2) - y0 * (X1 - X2) + (X1 * y2 - X2 * y1)) / det;
    const c =
      (x0 * (X1 - X2) - X0 * (x1 - x2) + (x1 * X2 - x2 * X1)) / det;
    const e =
      (x0 * (y1 * X2 - y2 * X1) -
        y0 * (x1 * X2 - x2 * X1) +
        X0 * (x1 * y2 - x2 * y1)) /
      det;
    return [a, c, e];
  };
  const [a, c, e] = solveFor(dst3[0][0], dst3[1][0], dst3[2][0]);
  const [b, d, f] = solveFor(dst3[0][1], dst3[1][1], dst3[2][1]);
  return [a, b, c, d, e, f];
}

function perspectiveCrop(img, corners, outW, outH) {
  // corners: [TL, TR, BR, BL]，每個是 {x,y}（原圖像素座標）
  const [TL, TR, BR, BL] = corners;
  const c = document.createElement('canvas');
  c.width = outW;
  c.height = outH;
  const ctx = c.getContext('2d');
  const tris = [
    { src: [TL, TR, BL], dst: [[0, 0], [outW, 0], [0, outH]] },
    { src: [TR, BR, BL], dst: [[outW, 0], [outW, outH], [0, outH]] },
  ];
  for (const tri of tris) {
    const m = solveAffine(
      tri.src.map((p) => [p.x, p.y]),
      tri.dst,
    );
    if (!m) continue;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tri.dst[0][0], tri.dst[0][1]);
    ctx.lineTo(tri.dst[1][0], tri.dst[1][1]);
    ctx.lineTo(tri.dst[2][0], tri.dst[2][1]);
    ctx.closePath();
    ctx.clip();
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
  return c;
}

function rotateCanvas(src, deg) {
  if (!deg) return src;
  const swapped = deg === 90 || deg === 270;
  const c = document.createElement('canvas');
  c.width = swapped ? src.height : src.width;
  c.height = swapped ? src.width : src.height;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

// 放大檢視的「旋轉」要真的改到存起來的照片，不是只轉螢幕上的畫面，
// 不然關掉再打開又轉回去，使用者會覺得沒生效。
function rotateImageSrc(src, deg) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      const rotated = rotateCanvas(c, deg);
      resolve(rotated.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = src;
  });
}

function applyContrast(canvas, amount = 35) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  const factor = (259 * (amount + 255)) / (255 * (259 - amount));
  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp(factor * (d[i] - 128) + 128);
    d[i + 1] = clamp(factor * (d[i + 1] - 128) + 128);
    d[i + 2] = clamp(factor * (d[i + 2] - 128) + 128);
  }
  ctx.putImageData(id, 0, 0);
  return canvas;
}

// dataURL 的 base64 長度換算實際位元組數，用來顯示「1.2 MB → 240 KB」
function dataUrlBytes(dataUrl) {
  if (!dataUrl) return 0;
  const i = dataUrl.indexOf(',');
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.round((b64.length * 3) / 4) - pad;
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

// 從 OCR 辨識出的原始文字，抓「N%対象 金額円」這種日本收據固定格式。
// 找不到任何 %対象 就整個回傳 null——OCR 是省打字，不是猜答案，讀不到不要生數字。
// 把 OCR 回傳的每一行文字（各自帶座標）依垂直位置分組成「同一橫排」，
// 橫排內再依水平位置從左到右排好，重新拼出跟收據實際排版一致的閱讀
// 順序。原生端（ML Kit／Vision）是照它們自己切出來的文字區塊順序回傳
// 整份文字，遇到「左邊一整欄標籤、右邊一整欄金額」這種排版，常常會把
// 兩欄各自切成不同區塊，回傳順序變成「標籤全部先列完，金額才接著
// 列」，跟標籤金額原本的左右對應關係整個脫節——只給文字本身救不回來，
// 要靠座標重新配對。座標單位（像素或 0–1 正規化）兩邊平台不一樣，但
// 這裡只在同一次呼叫回來的資料裡互相比較相對位置，不需要統一單位。
function reconstructRowsFromLines(lines) {
  if (!lines || !lines.length) return '';
  const items = lines
    .filter((l) => l && typeof l.text === 'string' && l.text.trim())
    .map((l) => ({
      text: l.text,
      top: Number(l.top) || 0,
      left: Number(l.left) || 0,
      bottom: Number(l.bottom) || 0,
      right: Number(l.right) || 0,
    }));
  if (!items.length) return '';
  items.sort((a, b) => a.top + a.bottom - (b.top + b.bottom));

  const rows = [];
  for (const item of items) {
    const height = Math.max(1, item.bottom - item.top);
    // 跟現有的每一排比，垂直範圍重疊超過這一行高度一半，就當作同一排
    // ——收據上左右兩欄、同一橫排的文字，高度通常差不多。
    let row = rows.find((r) => {
      const overlap = Math.min(r.bottom, item.bottom) - Math.max(r.top, item.top);
      return overlap > Math.min(r.bottom - r.top, height) * 0.5;
    });
    if (!row) {
      row = { top: item.top, bottom: item.bottom, items: [] };
      rows.push(row);
    }
    row.top = Math.min(row.top, item.top);
    row.bottom = Math.max(row.bottom, item.bottom);
    row.items.push(item);
  }
  rows.sort((a, b) => a.top + a.bottom - (b.top + b.bottom));
  return rows
    .map((r) =>
      r.items
        .sort((a, b) => a.left - b.left)
        .map((i) => i.text)
        .join(' '),
    )
    .join('\n');
}

function parseReceiptOCR(text) {
  if (!text) return null;
  const norm = text.replace(/[，]/g, ',');
  const pctRe = /(8|10)\s*%\s*(?:対象|對象)[^\d]{0,12}([\d,]{2,9})\s*円/g;
  const found = {};
  let m;
  while ((m = pctRe.exec(norm))) {
    const amt = Number(m[2].replace(/,/g, ''));
    // 同一個稅率只認第一筆比對到的，後面重複的不要蓋掉。日本收據常見
    // 格式是「10%對象 1,000円」後面接一行「（內消費稅等 100円）」——
    // 後面那行也符合這個規則（"對象" 跟數字之間允許到 12 個非數字字
    // 元，"內消費稅等　" 剛好塞得進去），如果用蓋掉的方式，含稅小計
    // 會被內消費稅那個小數字取代，金額直接少一個位數；用累加的話反而
    // 會把稅額誤加回小計，一樣是錯的。第一筆抓到的通常就是真正的小計
    // 金額，後面重複比對到的不管，才是兩種收據格式都對的做法。
    if (amt > 0 && !(m[1] in found)) found[m[1]] = amt;
  }
  const rates = Object.keys(found);

  const result = {};
  if (rates.length >= 2) {
    result.rate = 'mixed';
    result.incl8 = found['8'] || null;
    result.incl10 = found['10'] || null;
  } else if (rates.length === 1) {
    result.rate = Number(rates[0]);
    result.incl = found[rates[0]];
  } else {
    // 讀不到「N%對象」這種便利商店/藥妝店式標籤——不是所有收據都會
    // 印稅率明細，退而求其次找「合計/お会計/總額」這種一般收銀機常見
    // 的總額標籤+金額，當作含稅總額，稅率不知道所以先預設 10%（較常
    // 見），存進表單後使用者自己確認調整；「合計」要排除掉「合計点數」
    // 這種列商品件數、不是列金額的行，不然會把件數誤當金額抓進來。
    // 這兩種格式都找不到，金額就先不填，但不要整個放棄——店名跟日期
    // 是完全獨立的規則，不需要靠金額才能抓，下面繼續往下走。
    const totalRe = /(?:合計(?!點數|点数)|お会計|ご請求金額|總額|総額)[^\d]{0,8}([\d,]{2,9})\s*円?/;
    const totalMatch = norm.match(totalRe);
    const amt = totalMatch ? Number(totalMatch[1].replace(/,/g, '')) : 0;
    if (amt > 0) {
      result.rate = 10;
      result.incl = amt;
    }
  }

  const lines = norm
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const shopLine = lines.find((l) => l.length >= 2 && l.length <= 20 && !/\d/.test(l));
  if (shopLine) result.shop = shopLine;

  const dm = norm.match(/(20\d{2})[\-\/年](\d{1,2})[\-\/月](\d{1,2})/);
  if (dm) {
    result.date = `${dm[1]}-${String(dm[2]).padStart(2, '0')}-${String(dm[3]).padStart(2, '0')}`;
  }

  // 金額、店名、日期三個一個都沒抓到，這次辨識才算真的沒有用——回傳
  // null 讓呼叫端知道「讀不到」跟「有讀到、只是要手動補齊」是不同的
  // 兩件事。只要有抓到其中一項，就把抓到的部分帶回去，不要因為金額
  // 沒抓到就連店名/日期一起浪費掉。
  if (!result.incl && !result.incl8 && !result.incl10 && !result.shop && !result.date) {
    return null;
  }
  return result;
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

function Field({ label, hint, children, as: As = 'label' }) {
  return (
    <As className="block">
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
    </As>
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
  const [editingTripId, setEditingTripId] = useState(null);
  const [endedSheetOpen, setEndedSheetOpen] = useState(false);
  const [deadline3dSheetOpen, setDeadline3dSheetOpen] = useState(false);
  const [refundCheckOpen, setRefundCheckOpen] = useState(false);
  const [quickAddOn, setQuickAddOn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState('home');
  const [editing, setEditing] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [quizOn, setQuizOn] = useState(false);
  const [rateBusy, setRateBusy] = useState(false);
  const [rateErr, setRateErr] = useState(false);
  const [exitArmed, setExitArmed] = useState(false); // Android 離開提示條：按第一次返回鍵才會顯示
  const exitArmedRef = useRef(false);
  const exitTimerRef = useRef(null);

  const lang = settings.lang;
  const t = T[lang];

  // 五個主畫面同一層：不管在收據／查驗／FQA／設定互相怎麼切，返回鍵
  // 一次就回總覽，不會一層一層退之前切過的分頁。
  useBackClose(tab !== 'home', () => setTab('home'));
  useBackClose(tripSheet, () => setTripSheet(false));
  useBackClose(endedSheetOpen, () => setEndedSheetOpen(false));
  useBackClose(deadline3dSheetOpen, () => setDeadline3dSheetOpen(false));
  useBackClose(refundCheckOpen, () => setRefundCheckOpen(false));
  useBackClose(quickAddOn, () => setQuickAddOn(false));
  useBackClose(menuOpen, () => setMenuOpen(false));
  useBackClose(!!openId, () => setOpenId(null));
  useBackClose(quizOn, () => setQuizOn(false));
  // editing（新增/編輯收據）跟 editingTripId（編輯行程）都不在這裡
  // 註冊：EditSheet／TripEditSheet 自己用 useDirtyBackGuard 接返回，
  // 有未存的變動要先問，不能直接關掉。這裡如果重複註冊一次，等於
  // 同一層在堆疊裡算了兩次，返回一次會多退一層。

  function armExitHint() {
    exitArmedRef.current = true;
    setExitArmed(true);
    clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => {
      exitArmedRef.current = false;
      setExitArmed(false);
    }, 2000);
  }

  // Android 實體返回鍵：全部自己接管，不用系統預設行為（預設是
  // webView.goBack() 或直接關 App，兩個都不是我們要的）。有任何一層
  // sheet/面板開著（kaeruBackDepth > 0）就照 history 退一層；已經在
  // 最底層（總覽、沒有任何 sheet）才走雙擊退出流程。iOS 沒有這顆鍵，
  // 這個 listener 在 iOS 上不會被呼叫。用 ref 讀 exitArmed 是為了只
  // 訂閱一次，不用每次提示條開關都重新 addListener。
  useEffect(() => {
    let handle;
    CapacitorApp.addListener('backButton', () => {
      if (kaeruBackDepth > 0) {
        window.history.back();
        return;
      }
      if (exitArmedRef.current) {
        clearTimeout(exitTimerRef.current);
        exitArmedRef.current = false;
        setExitArmed(false);
        CapacitorApp.exitApp();
      } else {
        armExitHint();
      }
    }).then((h) => {
      handle = h;
    });
    return () => {
      handle && handle.remove();
    };
  }, []);

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
            const id = genTripId();
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
              if (p && p.value) {
                // 舊資料是單張 dataURL 字串；新格式是 JSON 陣列（最多 4 張）
                try {
                  const parsed = JSON.parse(p.value);
                  map[it.id] = Array.isArray(parsed) ? parsed : [p.value];
                } catch (e) {
                  map[it.id] = [p.value];
                }
              }
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
    const id = genTripId();
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
    // 這張收據理論上能退的稅額上限：含稅金額－稅抜金額。
    const naiveTax = (it.incl || 0) - netOfItem(it);
    if (
      it.taxOverride !== null &&
      it.taxOverride !== undefined &&
      it.taxOverride !== ''
    ) {
      // #12 修正：手動輸入的退稅金額原本沒有跟這個理論上限比對，打錯
      // 一個位數（例如多打一個 0）不會被擋下來，會直接算進可退稅總額、
      // 查驗頁總額等所有地方。夾在 [0, naiveTax] 之間。
      const override = Number(it.taxOverride) || 0;
      return Math.min(Math.max(0, override), naiveTax);
    }
    return naiveTax;
  }

  function deleteTrip(id) {
    const rest = trips.filter((x) => x.id !== id);
    items
      .filter((i) => i.tripId === id)
      .forEach((i) => {
        window.storage.delete(photoKey(i.id)).catch(() => {});
      });
    setPhotos((p) => {
      const n = { ...p };
      for (const i of items) if (i.tripId === id) delete n[i.id];
      return n;
    });
    setItems((prev) => prev.filter((i) => i.tripId !== id));
    setTrips(rest);
    if (activeId === id) setActiveId(rest.length ? rest[0].id : null);
  }

  function tripStatsFor(id) {
    const list = items.filter((i) => i.tripId === id);
    let totalIncl = 0,
      pending = 0,
      refunded = 0,
      dead = 0;
    for (const it of list) {
      totalIncl += it.incl || 0;
      if (it.consumed) dead++;
      else if (it.status === 'refunded') refunded++;
      else pending++;
    }
    return { count: list.length, totalIncl, pending, refunded, dead };
  }

  const stats = useMemo(() => {
    let totalIncl = 0,
      refundable = 0,
      refundedTax = 0,
      pendingCount = 0,
      minDays = null,
      todoCount = 0,
      todoTax = 0;
    // ≤14 天到期警示：收集所有還沒失效、還沒退款、資料齊全的候選，最後
    // 挑最快到期的那張出來當代表（金額、店名），數量給的是整批的張數。
    const deadlineSoonList = [];
    for (const it of tripItems) {
      totalIncl += it.incl || 0;
      const g = groups.get(groupKey(it));
      // 資料待補（快速新增、OCR 沒讀到店名）跟已過期未退的收據，都不
      // 算進任何「還可以退/還沒處理」的主動追蹤範圍——前者金額可能是
      // OCR 誤讀，不能拿去算承諾；後者已經拿不回來了，算進去只會讓
      // 使用者以為還有機會。兩者都不刪除、不隱藏，只是不進這裡的加總。
      const pendingInfo = isPendingInfo(it);
      const expired = isExpiredUnclaimed(it);
      const eligible = g && g.ok && !it.consumed && !pendingInfo && !expired;
      if (eligible && it.status !== 'refunded') refundable += taxOf(it);
      // #10 修正：原本只算 status==='refunded'——「已查驗」（在機場查驗
      // 過、只是還沒手動標成「已退款」）的金額既不算進 refundable 之後
      // 的顯示（行程「已出境」後首頁改看 refundedTax），也不算進這裡，
      // 憑空從畫面上消失。查驗過就當作錢已經到手。
      // 注意：verified 的收據會同時被算進上面的 refundable——這不是
      // 沒扣乾淨，是故意的：refundable／refundedTax 不是「互斥的兩個
      // 集合」，是同一批收據在「出境前」跟「出境後」兩個時間點各自
      // 該顯示的數字（首頁用 departed 決定顯示哪一個，見 3410/3417 附
      // 近），兩個都要包含 verified，只是從來不會同時加總在一起顯示。
      if (eligible && (it.status === 'verified' || it.status === 'refunded'))
        refundedTax += taxOf(it);
      // 已在境內吃掉/用掉的收據退不了稅，不算「還沒處理」，跟
      // tripStatsFor 的 pending 判斷一致，不然首頁「還沒處理」的張數
      // 跟最近到期倒數，會把已經失效、退不了稅的收據也算進去。
      if (it.status !== 'refunded' && !it.consumed && !pendingInfo && !expired) {
        pendingCount++;
        const d = daysLeft(it.date);
        if (d !== null && (minDays === null || d < minDays)) minDays = d;
        if (d !== null && d >= 0 && d <= 14) deadlineSoonList.push({ it, d });
      }
      // 回程當天行動列（首頁）用的「今天要辦的事」，跟查驗頁的 todo
      // 是同一份定義：已達標、沒消費、沒過期、資料補齊，但還沒在機場
      // 查驗過的收據。
      if (eligible && (it.status === 'purchased' || it.status === 'registered')) {
        todoCount++;
        todoTax += taxOf(it);
      }
    }
    deadlineSoonList.sort((a, b) => a.d - b.d);
    const deadlineSoon = deadlineSoonList.length
      ? {
          count: deadlineSoonList.length,
          days: deadlineSoonList[0].d,
          amount: taxOf(deadlineSoonList[0].it),
          shop: deadlineSoonList[0].it.shop,
        }
      : null;
    return {
      totalIncl,
      refundable,
      refundedTax,
      pendingCount,
      minDays,
      todoCount,
      todoTax,
      deadlineSoon,
    };
  }, [tripItems, groups]);

  // 保守偵測「這趟結束了」：回程時間超過 24 小時，且這趟的收據全部
  // 已退款或已失效（沒有任何一張還卡在待處理），才會跳一次提示。
  // 沒有收據的行程永遠不會跳；跳過一次之後就在 trip 上記一個旗標，
  // 這趟再也不會自動跳出來——一律等使用者自己按。
  const activeTripStats = activeTrip ? tripStatsFor(activeTrip.id) : null;
  const shouldPromptEnded =
    !!activeTrip &&
    !!activeTrip.departure &&
    !activeTrip.endedPromptShown &&
    !!activeTripStats &&
    activeTripStats.count > 0 &&
    activeTripStats.pending === 0 &&
    Date.now() - new Date(activeTrip.departure).getTime() > 24 * 3600 * 1000;

  useEffect(() => {
    if (!shouldPromptEnded) return;
    const id = activeTrip.id;
    setEndedSheetOpen(true);
    setTrips((prev) =>
      prev.map((x) => (x.id === id ? { ...x, endedPromptShown: true } : x)),
    );
    // 依賴要連 activeTrip?.id 一起看——只看 shouldPromptEnded 這個布林值
    // 的話，切到另一趟「同時也符合條件、還沒跳過」的行程時，React 看到
    // true → true 沒有變化，不會重新執行這個 effect，新行程的提示永遠
    // 跳不出來。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPromptEnded, activeTrip?.id]);

  // ≤3 天期限警示：只提一次，不是每天都跳。這個 app 目前沒有真的 OS
  // 推播（沒有裝 local-notifications 之類的原生套件、也沒有跟使用者
  // 要通知權限），所以做成「打開 App 時如果符合條件就跳一次」的站內
  // 提示，跟「這趟結束了」用同一種一次性旗標機制。
  const shouldPromptDeadline3d =
    !!activeTrip &&
    !activeTrip.deadline3dPromptShown &&
    !!stats.deadlineSoon &&
    stats.deadlineSoon.days <= 3;

  useEffect(() => {
    if (!shouldPromptDeadline3d) return;
    const id = activeTrip.id;
    setDeadline3dSheetOpen(true);
    setTrips((prev) =>
      prev.map((x) => (x.id === id ? { ...x, deadline3dPromptShown: true } : x)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPromptDeadline3d, activeTrip?.id]);

  // 退款確認：回程後 7 天問一次「錢進來了嗎」，不要求使用者每天回來記
  // 帳。跟上面兩個一樣是站內提示（沒有真的推播），但這裡故意可以重複
  // 出現——使用者可以按「7 天後再提醒我一次」，把下一次提醒時間往後推。
  const refundCheckEligibleCount = tripItems.filter(
    (it) =>
      !it.consumed &&
      !isPendingInfo(it) &&
      (it.status === 'verified' || it.status === 'refunded'),
  ).length;
  const shouldPromptRefundCheck =
    !!activeTrip &&
    !!activeTrip.departure &&
    !activeTrip.refundCheckDismissed &&
    refundCheckEligibleCount > 0 &&
    (activeTrip.refundCheckNextAt
      ? Date.now() >= new Date(activeTrip.refundCheckNextAt).getTime()
      : Date.now() - new Date(activeTrip.departure).getTime() >= 7 * 86400000);

  useEffect(() => {
    if (!shouldPromptRefundCheck) return;
    setRefundCheckOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPromptRefundCheck, activeTrip?.id]);

  function upsert(input, photosData) {
    const item = { ...input, tripId: input.tripId || activeId };
    setItems((prev) =>
      prev.some((p) => p.id === item.id)
        ? prev.map((p) => (p.id === item.id ? item : p))
        : [item, ...prev],
    );
    if (photosData !== undefined) {
      if (photosData && photosData.length) {
        setPhotos((p) => ({ ...p, [item.id]: photosData }));
        window.storage
          .set(photoKey(item.id), JSON.stringify(photosData))
          .catch(() => {});
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

  // 「+」統一先走快路（拍照優先）。完整表單還在，只是不再是預設路徑——
  // 快路裡的「現在就填完整資料」跟編輯既有收據都還是走 setEditing。
  function startAdd() {
    setQuickAddOn(true);
  }

  // 快路「存起來，晚點再補」：跟 EditSheet.save() 走的是同一套狀態機
  // 推導（有登記才進 registered，否則停在 purchased），只是欄位少很多、
  // 沒有使用者手動調過的 taxOverride/note/unpacked/consumed。
  function quickSaveDraft(draft, photosArr) {
    const id = `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    upsert(
      {
        id,
        shop: draft.shop,
        date: draft.date,
        incl: draft.incl,
        rate: draft.rate,
        incl8: draft.incl8,
        incl10: draft.incl10,
        taxOverride: null,
        refundMethod: draft.refundMethod,
        unpacked: false,
        consumed: false,
        note: '',
        status: draft.refundMethod === 'registered' ? 'registered' : 'purchased',
        hasPhoto: !!photosArr.length,
        tripId: activeId,
      },
      photosArr,
    );
    setQuickAddOn(false);
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
        @media (min-width:480px){.kaeru-group-gap{gap:22px}}
        /* web 版隱藏捲軸，但保留可滑動——外境機場選擇頁的籌碼列／清單用 */
        .no-scrollbar{scrollbar-width:none;-ms-overflow-style:none}
        .no-scrollbar::-webkit-scrollbar{display:none}`}</style>
      <div
        className="kaeru-app"
        style={{
          backgroundColor: C.page,
          opacity: tripSheet || endedSheetOpen ? 0.35 : 1,
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
                      {activeTrip
                        ? activeTrip.name || t.tripUnnamed
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
                  onClick={startAdd}
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
                      setMenuOpen(false);
                      deferOpen(() => {
                        setTab(k);
                        setQuizOn(false);
                      });
                    }}
                    onAdd={() => {
                      setMenuOpen(false);
                      deferOpen(startAdd);
                    }}
                    onTrips={() => {
                      setMenuOpen(false);
                      deferOpen(() => setTripSheet(true));
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
              onAdd={startAdd}
              onGoSettings={() => setTab('set')}
              onGoCheck={() => setTab('check')}
              onEditTrip={() => setEditingTripId(activeId)}
              onGoFaq={() => {
                setTab('faq');
                setQuizOn(false);
              }}
              onStartSim={() => {
                setTab('faq');
                setQuizOn(true);
              }}
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
              onAdd={startAdd}
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
                    const eligible =
                      g &&
                      g.ok &&
                      !it.consumed &&
                      !isPendingInfo(it) &&
                      !isExpiredUnclaimed(it);
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
              onEditTrip={() => setEditingTripId(activeId)}
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

      {exitArmed && Capacitor.getPlatform() === 'android' && (
        <div
          className="fixed inset-0 z-50"
          style={{ pointerEvents: 'none' }}
        >
          <div className="relative kaeru-app" style={{ minHeight: 0, height: '100%' }}>
            <div
              className="absolute"
              style={{
                left: '26px',
                right: '26px',
                bottom: 'max(34px, calc(env(safe-area-inset-bottom) + 14px))',
                backgroundColor: C.ink,
                padding: '14px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '14px',
                pointerEvents: 'auto',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>
                  {t.exitPressAgain}
                </div>
                <div
                  className="mt-0.5"
                  style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}
                >
                  {t.exitDataSafe}
                </div>
              </div>
              <button
                onClick={() => {
                  clearTimeout(exitTimerRef.current);
                  exitArmedRef.current = false;
                  setExitArmed(false);
                }}
                style={{ fontSize: '11.5px', fontWeight: 700, color: C.sage, flexShrink: 0 }}
              >
                {t.exitStay}
              </button>
            </div>
          </div>
        </div>
      )}

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
            const id = genTripId();
            setTrips((prev) => [...prev, { id, name, departure }]);
            setActiveId(id);
            setTripSheet(false);
          }}
          onDelete={deleteTrip}
          onEditTrip={(id) => setEditingTripId(id)}
        />
      )}

      {endedSheetOpen && activeTrip && activeTripStats && (
        <TripEndedSheet
          t={t}
          trip={activeTrip}
          tripStats={activeTripStats}
          refundedTax={stats.refundedTax}
          daysSince={Math.floor(
            (Date.now() - new Date(activeTrip.departure).getTime()) /
              86400000,
          )}
          onClose={() => setEndedSheetOpen(false)}
          onCreateNew={() => {
            setEndedSheetOpen(false);
            deferOpen(() => setTripSheet(true));
          }}
          onViewRecords={() => {
            setEndedSheetOpen(false);
            deferOpen(() => setTab('list'));
          }}
        />
      )}

      {deadline3dSheetOpen && stats.deadlineSoon && (
        <DeadlineWarnSheet
          t={t}
          deadlineSoon={stats.deadlineSoon}
          onClose={() => setDeadline3dSheetOpen(false)}
          onGoCheck={() => {
            setDeadline3dSheetOpen(false);
            deferOpen(() => setTab('check'));
          }}
        />
      )}

      {refundCheckOpen && activeTrip && (
        <RefundCheckSheet
          t={t}
          trip={activeTrip}
          items={tripItems.filter(
            (it) =>
              !it.consumed &&
              !isPendingInfo(it) &&
              (it.status === 'verified' || it.status === 'refunded'),
          )}
          taxOf={taxOf}
          daysSince={Math.floor(
            (Date.now() - new Date(activeTrip.departure).getTime()) / 86400000,
          )}
          onToggleStatus={(id, isRefunded) =>
            setItems((prev) =>
              prev.map((p) =>
                p.id === id
                  ? { ...p, status: isRefunded ? 'verified' : 'refunded' }
                  : p,
              ),
            )
          }
          onClose={() => setRefundCheckOpen(false)}
          onAllIn={() => {
            const id = activeTrip.id;
            setItems((prev) =>
              prev.map((p) =>
                p.tripId === id && p.status === 'verified'
                  ? { ...p, status: 'refunded' }
                  : p,
              ),
            );
            setTrips((prev) =>
              prev.map((x) =>
                x.id === id ? { ...x, refundCheckDismissed: true } : x,
              ),
            );
            setRefundCheckOpen(false);
          }}
          onRemindLater={() => {
            const id = activeTrip.id;
            setTrips((prev) =>
              prev.map((x) =>
                x.id === id
                  ? {
                      ...x,
                      refundCheckNextAt: new Date(
                        Date.now() + 7 * 86400000,
                      ).toISOString(),
                    }
                  : x,
              ),
            );
            setRefundCheckOpen(false);
          }}
        />
      )}

      {editingTripId && (
        <TripEditSheet
          t={t}
          trip={trips.find((x) => x.id === editingTripId)}
          isActive={editingTripId === activeId}
          tripStats={tripStatsFor(editingTripId)}
          tripCount={trips.length}
          onClose={() => setEditingTripId(null)}
          onSave={(patch, makeActive) => {
            setTrips((prev) =>
              prev.map((x) => (x.id === editingTripId ? { ...x, ...patch } : x)),
            );
            if (makeActive) setActiveId(editingTripId);
            setEditingTripId(null);
          }}
          onDelete={() => {
            deleteTrip(editingTripId);
            setEditingTripId(null);
          }}
        />
      )}

      {quickAddOn && (
        <QuickAddFlow
          t={t}
          onClose={() => setQuickAddOn(false)}
          onSaveQuick={quickSaveDraft}
          onSaveFull={(draft, photosArr) => {
            setQuickAddOn(false);
            // 快路存的草稿還沒真的存進 items/photos，用 _photos 這個
            // 一次性欄位把照片直接帶給 EditSheet 當初始值，跟真正存過
            // 的收據（有 id、photos[id] 找得到）分開處理，存檔之後
            // save() 會另外產生一個真的 id，這個草稿物件不會留下來。
            deferOpen(() => setEditing({ ...draft, _photos: photosArr }));
          }}
        />
      )}

      {editing && (
        <EditSheet
          t={t}
          initial={editing === 'new' ? null : editing}
          photos={
            editing === 'new'
              ? []
              : editing._photos || photos[editing.id] || []
          }
          onClose={() => setEditing(null)}
          onSave={(item, photosData) => {
            upsert(item, photosData);
            setEditing(null);
          }}
        />
      )}

      {openItem && (
        <DetailSheet
          t={t}
          item={openItem}
          group={groups.get(groupKey(openItem))}
          photos={photos[openItem.id] || []}
          onPhotosChange={(next) => upsert(openItem, next)}
          taxOf={taxOf}
          settings={settings}
          onClose={() => setOpenId(null)}
          onEdit={(it) => {
            setOpenId(null);
            deferOpen(() => setEditing(it));
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

function HomeView({
  t,
  stats,
  settings,
  trip,
  hasItems,
  onAdd,
  onGoSettings,
  onGoCheck,
  onEditTrip,
  onGoFaq,
  onStartSim,
}) {
  useNowTick();
  const dep = trip && trip.departure ? new Date(trip.departure) : null;
  const diffMs = dep ? dep - new Date() : null;
  const dDays = diffMs !== null ? Math.floor(diffMs / 86400000) : null;
  const dHours =
    diffMs !== null ? Math.floor((diffMs % 86400000) / 3600000) : null;
  const airport = trip && trip.airport ? AIRPORTS.find((a) => a.code === trip.airport) : null;
  const arriveBuffer = airport ? airport.hours : DEFAULT_ARRIVE_HOURS;
  const arriveBy = dep ? new Date(dep.getTime() - arriveBuffer * 3600000) : null;
  const fmt = (d) =>
    d
      ? `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      : '';
  const departed = !!dep && diffMs <= 0;
  // 回程當天行動列：只在起飛前 24 小時內出現，其他時候完全不存在——
  // 不要用 disabled 或灰掉的版本佔位，沒到那個時間點就當它不存在。
  const within24h = !!dep && diffMs !== null && diffMs > 0 && diffMs <= 24 * 3600 * 1000;

  // 還沒有任何一張收據：先讓「行程」這個概念被看見，而不是悄悄疊在
  // 匿名行程裡。有沒有名字／回程時間決定看到畫面 38 還是畫面 39。
  if (!hasItems) {
    const unnamed = !trip || !trip.name || !trip.departure;
    return unnamed ? (
      <EmptyUnnamedTrip
        t={t}
        onEditTrip={onEditTrip}
        onAdd={onAdd}
        onStartSim={onStartSim}
      />
    ) : (
      <EmptyNamedTrip
        t={t}
        trip={trip}
        onAdd={onAdd}
        onGoFaq={onGoFaq}
        onGoSettings={onGoSettings}
      />
    );
  }

  return (
    <div className="space-y-10 pb-6">
      <section className="pt-2">
        <CountdownDisplay
          t={t}
          dep={dep}
          diffMs={diffMs}
          dDays={dDays}
          dHours={dHours}
          departed={departed}
          onGoSettings={onGoSettings}
        />
        {dep && diffMs > 0 && !within24h && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            <Badge tone="blue">
              {t.arriveTagPre}
              {fmt(arriveBy)}
              {t.arriveTagSuf}
            </Badge>
            <Badge tone="clay">{t.checkinBadge}</Badge>
          </div>
        )}

        {within24h && (
          <button
            onClick={onGoCheck}
            className="mt-4 flex w-full items-center justify-between gap-3 text-left"
            style={{
              backgroundColor: stats.todoCount > 0 ? C.blue : C.sage,
              padding: '15px 16px',
            }}
          >
            <div className="min-w-0">
              <p
                className="font-bold"
                style={{ fontSize: '10px', letterSpacing: '0.2em', color: C.blueSoft }}
              >
                {t.todayActionTitle}
              </p>
              <p
                className="mt-1 truncate font-bold"
                style={{ fontSize: '15px', color: '#FFFFFF' }}
              >
                {stats.todoCount > 0
                  ? t.todayActionLine(stats.todoCount)
                  : t.todayActionDone}
              </p>
              {stats.todoCount > 0 && (
                <p
                  className="mt-0.5 tabular-nums"
                  style={{ fontSize: '11.5px', color: C.blueSoft }}
                >
                  ¥{yen(stats.todoTax)}
                </p>
              )}
            </div>
            {stats.todoCount > 0 && (
              <span
                className="shrink-0 font-bold"
                style={{ fontSize: '12.5px', color: '#FFFFFF' }}
              >
                {t.goCheck} ›
              </span>
            )}
          </button>
        )}

        {stats.deadlineSoon && (
          <div
            className="mt-3"
            style={{ backgroundColor: C.clay, padding: '15px 16px' }}
          >
            <p className="font-bold" style={{ fontSize: '13px', color: '#FFFFFF' }}>
              {t.deadlineBannerTitle(stats.deadlineSoon.count, stats.deadlineSoon.days)}
            </p>
            <p className="mt-1" style={{ fontSize: '11.5px', color: '#F3E7DD' }}>
              {t.deadlineBannerDetail(
                yen(stats.deadlineSoon.amount),
                stats.deadlineSoon.shop || t.pendingShopPlaceholder,
              )}
            </p>
          </div>
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
          label={departed ? t.refundedTotalLabel : t.estRefund}
          sub={`≈ NT$${twd((departed ? stats.refundedTax : stats.refundable) * settings.rate)}`}
          align="end"
        >
          <span
            className="kaeru-refund font-semibold tabular-nums"
            style={{ color: C.blueDeep, lineHeight: 1 }}
          >
            ¥{yen(departed ? stats.refundedTax : stats.refundable)}
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

      {!departed && (
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
            {[t.step1(arriveHoursText(t, arriveBuffer)), t.step2, t.step3, t.step4].map((x, n) => (
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
      )}
    </div>
  );
}

// 倒數區的標籤／數字三態（倒數中／已出境／沒設回程時間），總覽正常
// 畫面跟畫面 39（已命名但沒收據）共用同一份——沒收據不代表倒數跟
// 查驗進度的邏輯不算，畫面 39 的截圖本來就有倒數，只是下面接的內容
// 不一樣。
function CountdownDisplay({ t, dep, diffMs, dDays, dHours, departed, onGoSettings }) {
  if (departed) {
    return (
      <>
        <p style={{ color: C.sub, fontSize: '10.5px', letterSpacing: '0.24em' }}>
          {t.departedTopLabel}
        </p>
        <p className="mt-2" style={{ lineHeight: 1 }}>
          <span className="kaeru-bignum font-semibold" style={{ color: C.ink }}>
            {t.departedValue}
          </span>
        </p>
      </>
    );
  }
  if (dep && diffMs > 0) {
    // 回程班機起飛前 24 小時內，天數已經沒有意義（永遠是 0），改顯示
    // 小時＋分——dHours 傳進來的時候本來就是「扣掉天數後剩下的小時」，
    // 24 小時內天數必為 0，所以這個值本身已經等於總小時數，不用另外算。
    const within24h = diffMs <= 24 * 3600 * 1000;
    const dMinutes = Math.floor((diffMs % 3600000) / 60000);
    return (
      <>
        <p style={{ color: C.sub, fontSize: '10.5px', letterSpacing: '0.24em' }}>
          {t.departIn}
        </p>
        <p
          className="mt-2 flex items-baseline tabular-nums"
          style={{ letterSpacing: '-0.01em' }}
        >
          <span className="kaeru-bignum font-semibold" style={{ color: C.ink, lineHeight: 1 }}>
            {within24h ? dHours : dDays}
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
            {within24h ? t.hours : t.days}
          </span>
          <span className="kaeru-bignum font-semibold" style={{ color: C.ink, lineHeight: 1 }}>
            {within24h ? dMinutes : dHours}
          </span>
          <span
            style={{ color: C.ink, fontSize: '16px', fontWeight: 500, marginLeft: '4px' }}
          >
            {within24h ? t.min : t.hours}
          </span>
        </p>
      </>
    );
  }
  return (
    <button
      onClick={onGoSettings}
      className="flex w-full items-center justify-between text-left"
    >
      <span>
        <span className="block text-base font-semibold">{t.setDeparture}</span>
        <span className="mt-1 block text-xs" style={{ color: C.sub }}>
          {t.beforeCheckin}
        </span>
      </span>
      <ChevronRight size={18} style={{ color: C.sub }} />
    </button>
  );
}

// 空狀態．畫面 38：行程還沒命名（沒名字或沒回程時間），而且一張收據
// 都還沒加。用一張待填卡把「行程」這個概念亮出來，主 CTA 去把名字和
// 回程時間填上；逃生口讓使用者可以先加收據，晚點再回來補。
function EmptyUnnamedTrip({ t, onEditTrip, onAdd, onStartSim }) {
  return (
    <div className="pb-6">
      <section className="pt-2">
        <div style={{ border: `1px dashed ${C.line}`, padding: '22px 20px' }}>
          <p style={{ fontSize: '10.5px', letterSpacing: '0.24em', color: C.sub }}>
            {t.emptyUnnamedKicker}
          </p>
          <p
            className="mt-2 font-bold"
            style={{ fontSize: '26px', color: C.sub, lineHeight: 1.2 }}
          >
            {t.emptyUnnamedTitle}
          </p>
          <div
            className="mt-3 flex flex-col"
            style={{
              gap: '8px',
              borderTop: `1px dashed ${C.line}`,
              paddingTop: '12px',
            }}
          >
            <div className="flex items-center justify-between">
              <span style={{ fontSize: '12.5px', color: C.sub }}>
                {t.tripName}
              </span>
              <span
                className="font-semibold"
                style={{ fontSize: '12.5px', color: C.clayInk }}
              >
                {t.unfilled}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: '12.5px', color: C.sub }}>
                {t.departure}
              </span>
              <span
                className="font-semibold"
                style={{ fontSize: '12.5px', color: C.clayInk }}
              >
                {t.unfilled}
              </span>
            </div>
          </div>
        </div>

        <p
          className="mt-5"
          style={{ fontSize: '13px', lineHeight: 1.95, color: C.ink }}
        >
          {t.emptyUnnamedDesc}
        </p>

        <button
          onClick={onEditTrip}
          className="mt-4 w-full py-3.5 font-bold"
          style={{ backgroundColor: C.blue, color: '#FFFFFF', fontSize: '14px' }}
        >
          {t.emptyUnnamedCta}
        </button>

        <p className="mt-3 text-center" style={{ fontSize: '12.5px' }}>
          <span style={{ color: C.sub }}>{t.emptyUnnamedOr}</span>{' '}
          <button
            onClick={onAdd}
            className="font-semibold"
            style={{ color: C.blueDeep }}
          >
            {t.emptyUnnamedEscape}
          </button>
        </p>
      </section>

      <section
        className="mt-6"
        style={{ borderTop: `1px solid ${C.ink}`, paddingTop: '16px' }}
      >
        <h3
          className="font-bold"
          style={{ color: C.blue, fontSize: '10.5px', letterSpacing: '0.24em' }}
        >
          {t.emptyUnnamedSimKicker}
        </h3>
        <button
          onClick={onStartSim}
          className="mt-3 block w-full text-left"
          style={{ backgroundColor: C.soft, padding: '22px', borderRadius: 0 }}
        >
          <p className="font-bold" style={{ fontSize: '18px', lineHeight: 1.4 }}>
            {t.sim}
          </p>
          <p className="mt-2" style={{ color: C.sub, fontSize: '12.5px', lineHeight: 1.8 }}>
            {t.emptyUnnamedSimDesc}
          </p>
          <span
            className="mt-4 inline-flex items-center gap-1 font-semibold"
            style={{ color: C.blueDeep, fontSize: '13px' }}
          >
            {t.startSim}
            <ChevronRight size={15} />
          </span>
        </button>
      </section>
    </div>
  );
}

// 空狀態．畫面 39：行程已經有名字、有回程時間，但還沒有任何一張
// 收據。金額用 sub 色顯示（¥0 只是佔位，不是真的有消費），收據區塊
// 改成填色 CTA，底下留一個「先看一遍規則」去 FAQ 的連結。
function EmptyNamedTrip({ t, trip, onAdd, onGoFaq, onGoSettings }) {
  useNowTick();
  const airport = trip && trip.airport ? AIRPORTS.find((a) => a.code === trip.airport) : null;
  // 已經有名字、有回程時間，只是還沒收據——倒數不會因為沒收據就算不
  // 出來，畫面 39 的截圖本來就顯示倒數，只是下面接的內容換成「行程
  // 已建立」徽章跟填色 CTA，不是查驗進度。
  const dep = trip && trip.departure ? new Date(trip.departure) : null;
  const diffMs = dep ? dep - new Date() : null;
  const dDays = diffMs !== null ? Math.floor(diffMs / 86400000) : null;
  const dHours =
    diffMs !== null ? Math.floor((diffMs % 86400000) / 3600000) : null;
  const departed = !!dep && diffMs <= 0;
  return (
    <div className="pb-6">
      <section className="pt-2">
        <CountdownDisplay
          t={t}
          dep={dep}
          diffMs={diffMs}
          dDays={dDays}
          dHours={dHours}
          departed={departed}
          onGoSettings={onGoSettings}
        />
        <div className="mt-4 flex flex-wrap gap-1.5">
          <Badge tone="sage" size="lg">
            {t.tripCreatedBadge}
          </Badge>
          {airport && (
            <span
              className="font-semibold"
              style={{
                fontSize: '10.5px',
                color: C.sub,
                border: `1px solid ${C.line}`,
                padding: '3px 7px',
              }}
            >
              {airport.name} {airport.code}
            </span>
          )}
        </div>
      </section>

      <section style={{ marginTop: '24px', borderTop: `1px solid ${C.ink}` }}>
        <div
          className="flex flex-col"
          style={{ gap: '15px', paddingTop: '18px' }}
        >
          <div className="flex items-baseline justify-between">
            <span style={{ fontSize: '12.5px', color: C.sub }}>
              {t.totalSpent}
            </span>
            <span
              className="font-semibold tabular-nums"
              style={{ fontSize: '24px', color: C.sub }}
            >
              ¥0
            </span>
          </div>
          <div
            className="flex items-end justify-between"
            style={{ borderTop: `1px solid ${C.line}`, paddingTop: '15px' }}
          >
            <span style={{ fontSize: '12.5px', color: C.sub }}>
              {t.estRefund}
            </span>
            <span
              className="font-semibold tabular-nums"
              style={{
                fontSize: '42px',
                color: C.sub,
                letterSpacing: '-0.01em',
                lineHeight: 1,
              }}
            >
              ¥0
            </span>
          </div>
        </div>
      </section>

      <section style={{ marginTop: '22px', padding: '20px', backgroundColor: C.soft }}>
        <p className="font-bold" style={{ fontSize: '15px', color: C.ink }}>
          {t.noReceiptsTitle}
        </p>
        <p className="mt-2" style={{ fontSize: '12.5px', lineHeight: 1.9, color: C.sub }}>
          {t.noReceiptsDesc}
        </p>
        <button
          onClick={onAdd}
          className="mt-4 w-full py-3 font-bold"
          style={{ backgroundColor: C.blue, color: '#FFFFFF', fontSize: '13px' }}
        >
          {t.addFirst}
        </button>
      </section>

      <button
        onClick={onGoFaq}
        className="flex w-full items-center justify-between"
        style={{ marginTop: '20px', borderTop: `1px solid ${C.line}`, paddingTop: '14px' }}
      >
        <span style={{ fontSize: '12.5px', color: C.ink }}>{t.rulesLinkLabel}</span>
        <span className="font-semibold" style={{ fontSize: '12.5px', color: C.blueDeep }}>
          {t.faqTitle} ›
        </span>
      </button>
    </div>
  );
}

// 畫面 40：偵測到「這趟結束了」跳出的底部面板。條件很嚴（回程超過
// 24 小時、且這趟的收據全部退款或失效），只跳一次；三個出口都不會
// 自動建立或切換行程，一律等使用者自己按。
function TripEndedSheet({
  t,
  trip,
  tripStats,
  refundedTax,
  daysSince,
  onClose,
  onCreateNew,
  onViewRecords,
}) {
  return (
    <BottomSheet onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <h2
          className="font-bold"
          style={{ fontSize: '18px', lineHeight: 1.5, color: C.ink }}
        >
          {t.endedSheetTitle}
        </h2>
        <button onClick={onClose} style={{ color: C.sub }}>
          <X size={15} />
        </button>
      </div>

      <p className="mt-2" style={{ fontSize: '12.5px', lineHeight: 1.9, color: C.sub }}>
        {t.endedSheetDesc(trip.name || t.tripUnnamed, daysSince, tripStats.count)}
      </p>

      <div
        className="mt-3.5"
        style={{ borderTop: `1px solid ${C.line}`, paddingTop: '14px' }}
      >
        <div className="flex items-baseline justify-between">
          <span style={{ fontSize: '12.5px', color: C.sub }}>
            {t.endedSheetSettleLabel}
          </span>
          <span
            className="font-semibold tabular-nums"
            style={{ fontSize: '20px', color: C.blueDeep }}
          >
            ¥{yen(refundedTax)}
          </span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {tripStats.refunded > 0 && (
            <Badge tone="sage">
              {tripStats.refunded}
              {t.statusRefunded}
            </Badge>
          )}
          {tripStats.dead > 0 && (
            <Badge tone="clay">
              {tripStats.dead}
              {t.statusDead}
            </Badge>
          )}
        </div>
      </div>

      <button
        onClick={onCreateNew}
        className="mt-5 w-full py-3.5 font-bold"
        style={{ backgroundColor: C.blue, color: '#FFFFFF', fontSize: '13.5px' }}
      >
        {t.endedSheetCta}
      </button>

      <div className="mt-4 flex items-center justify-center" style={{ gap: '22px' }}>
        <button onClick={onClose} style={{ fontSize: '12.5px', color: C.sub }}>
          {t.endedSheetNotNow}
        </button>
        <button
          onClick={onViewRecords}
          className="font-semibold"
          style={{ fontSize: '12.5px', color: C.blueDeep }}
        >
          {t.endedSheetViewRecords}
        </button>
      </div>

      <p
        className="mt-4"
        style={{
          borderTop: `1px solid ${C.line}`,
          paddingTop: '12px',
          fontSize: '11px',
          lineHeight: 1.75,
          color: C.sub,
        }}
      >
        {t.endedSheetFooterNote}
      </p>
    </BottomSheet>
  );
}

// ≤3 天期限警示：一次性站內提示（這個 app 沒有裝真的推播套件，用「打開
// App 時符合條件就跳一次」代替，跟「這趟結束了」同一種機制）。
function DeadlineWarnSheet({ t, deadlineSoon, onClose, onGoCheck }) {
  return (
    <BottomSheet onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <h2
          className="font-bold"
          style={{ fontSize: '18px', lineHeight: 1.5, color: C.ink }}
        >
          {t.deadlineBannerTitle(deadlineSoon.count, deadlineSoon.days)}
        </h2>
        <button onClick={onClose} style={{ color: C.sub }}>
          <X size={15} />
        </button>
      </div>
      <p className="mt-2" style={{ fontSize: '12.5px', lineHeight: 1.9, color: C.clayInk }}>
        {t.deadlineBannerDetail(
          yen(deadlineSoon.amount),
          deadlineSoon.shop || t.pendingShopPlaceholder,
        )}
      </p>
      <button
        onClick={onGoCheck}
        className="mt-5 w-full py-3.5 font-bold"
        style={{ backgroundColor: C.blue, color: '#FFFFFF', fontSize: '13.5px' }}
      >
        {t.goCheck}
      </button>
    </BottomSheet>
  );
}

// 退款確認：回程後 7 天問一次「錢進來了嗎」。不要求使用者每天回來記——
// 逐張勾選「已經進帳」的，「都收到了」關掉這個提示以後不會再跳；
// 「還沒收到」把下一次提醒時間往後推 7 天，不會每天煩使用者，但也
// 不會像「這趟結束了」那樣永遠只問一次。
// 勾選框直接對應收據的「已退款」狀態（verified ↔ refunded），不是另外
// 弄一個跟收據本身脫鉤的核取清單——這裡打勾，就是在說「這張真的退到
// 錢了」，跟收據詳情頁按「已退款」是同一件事，沒有理由分兩份資料。
function RefundCheckSheet({
  t,
  trip,
  items,
  taxOf,
  onToggleStatus,
  onClose,
  onAllIn,
  onRemindLater,
  daysSince,
}) {
  const waiting = items
    .filter((it) => it.status !== 'refunded')
    .reduce((s, it) => s + taxOf(it), 0);
  return (
    <>
      <FullScreenSheet>
        <div
          className="sticky top-0 z-10 flex items-center justify-between kaeru-pad"
          style={{
            backgroundColor: C.page,
            borderBottom: `1px solid ${C.ink}`,
            paddingTop: 'max(16px, env(safe-area-inset-top))',
            paddingBottom: '16px',
          }}
        >
          <button onClick={onClose} style={{ fontSize: '13px', color: C.blueDeep }}>
            ‹ {t.back}
          </button>
          <h2 className="font-bold" style={{ fontSize: '15px' }}>
            {t.refundCheckTitle}
          </h2>
          <button
            onClick={onClose}
            className="font-bold"
            style={{ fontSize: '13px', color: C.blueDeep }}
          >
            {t.checkDone}
          </button>
        </div>

        <div className="kaeru-pad py-6">
          <p style={{ color: C.sub, fontSize: '11px', letterSpacing: '0.1em' }}>
            {t.refundCheckSubtitle(trip.name || t.tripUnnamed, daysSince)}
          </p>
          <p className="mt-2" style={{ fontSize: '14px', lineHeight: 1.95 }}>
            {t.refundCheckDesc(items.length)}
          </p>

          <div
            className="mt-4 flex items-baseline justify-between"
            style={{ borderTop: `1px solid ${C.ink}`, paddingTop: '14px' }}
          >
            <span style={{ fontSize: '12.5px', color: C.sub }}>
              {t.refundCheckWaiting}
            </span>
            <span
              className="font-semibold tabular-nums"
              style={{ fontSize: '26px', color: C.blueDeep }}
            >
              ¥{yen(waiting)}
            </span>
          </div>

          <div className="mt-2">
            {items.map((it, i) => {
              const checked = it.status === 'refunded';
              return (
                <button
                  key={it.id}
                  onClick={() => onToggleStatus(it.id, checked)}
                  className="flex w-full items-center justify-between gap-3 py-3.5 text-left"
                  style={{ borderTop: `1px solid ${i === 0 ? C.ink : C.line}` }}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-bold" style={{ fontSize: '14.5px' }}>
                      {it.shop}
                    </span>
                    <span
                      className="mt-0.5 block tabular-nums"
                      style={{ color: C.sub, fontSize: '11px' }}
                    >
                      {it.date} · {t.taxAmount} ¥{yen(taxOf(it))}
                    </span>
                  </span>
                  <span
                    className="flex shrink-0 items-center justify-center"
                    style={{
                      width: '22px',
                      height: '22px',
                      backgroundColor: checked ? C.sage : 'transparent',
                      border: checked ? 'none' : `1px solid ${C.line}`,
                    }}
                  >
                    {checked && (
                      <CheckCircle2 size={14} style={{ color: '#FFFFFF' }} />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4" style={{ backgroundColor: C.soft, padding: '14px' }}>
            <p style={{ color: C.sub, fontSize: '11.5px', lineHeight: 1.8 }}>
              {t.refundCheckInfo}
            </p>
          </div>

          <div className="mt-5 flex gap-2">
            <button
              onClick={onRemindLater}
              className="flex-1 py-3 text-sm"
              style={{ border: `1px solid ${C.line}`, color: C.sub }}
            >
              {t.refundCheckNotYet}
            </button>
            <button
              onClick={onAllIn}
              className="py-3 text-sm font-bold"
              style={{ flex: 1.4, backgroundColor: C.blue, color: '#FFFFFF' }}
            >
              {t.refundCheckAllIn}
            </button>
          </div>

          <button
            onClick={onRemindLater}
            className="mt-3 w-full text-center"
            style={{ fontSize: '11px', color: C.sub }}
          >
            {t.refundCheckRemindLater}
          </button>
        </div>
      </FullScreenSheet>
    </>
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

  // 資料待補（快速新增、店名還沒補上）的收據不進一般的「同店同日」分組——
  // 店名是空的，硬分組只會把不相干的待補收據濫在一起。這裡拆出來，
  // 每一張獨立顯示，「待補」篩選只看得到它們，「全部」則排在最前面。
  const pendingItems = items
    .filter(isPendingInfo)
    .sort((a, b) => b.date.localeCompare(a.date));

  const match = (it) => {
    if (filter === 'all') return true;
    if (filter === 'done') return it.status === 'refunded';
    if (filter === 'todo') return it.status !== 'refunded' && !it.consumed;
    return true;
  };

  const showPendingSection =
    (filter === 'all' || filter === 'pending') && pendingItems.length > 0;
  const showGroupedSection = filter !== 'pending';

  const keys = showGroupedSection
    ? Array.from(groups.keys())
        .filter((k) => !groups.get(k).arr.every(isPendingInfo))
        .filter((k) =>
          groups.get(k).arr.some((it) => !isPendingInfo(it) && match(it)),
        )
        // 排序直接讀該組第一筆收據的 date，不要切 key 字串——key 是
        // `店名||日期` 手動拼出來的，店名要是剛好包含 "||" 這個子字串
        // （不無可能，店名是使用者自己輸入的自由文字），split 出來的
        // 段數會跑掉，日期就不會是預期的那一段。
        .sort((a, b) =>
          groups.get(b).arr[0].date.localeCompare(groups.get(a).arr[0].date),
        )
    : [];

  const nothingToShow =
    filter === 'pending' ? !pendingItems.length : !keys.length && !showPendingSection;

  return (
    <div className="space-y-4">
      <div
        className="flex"
        style={{ gap: '16px', borderBottom: `1px solid ${C.line}` }}
      >
        {['all', 'pending', 'todo', 'done'].map((f) => (
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

      {showPendingSection && (
        <div style={{ backgroundColor: C.soft, padding: '14px 16px' }}>
          <p style={{ fontSize: '13px', fontWeight: 700, color: C.ink }}>
            {t.filterPendingBanner(pendingItems.length)}
          </p>
          <p
            className="mt-1"
            style={{ fontSize: '11.5px', color: C.sub, lineHeight: 1.7 }}
          >
            {t.filterPendingBannerDesc}
          </p>
        </div>
      )}

      {nothingToShow && (
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

      {showPendingSection && (
        <div className="kaeru-group-gap">
          {pendingItems.map((it) => (
            <PendingReceiptCard
              key={it.id}
              it={it}
              t={t}
              taxOf={taxOf}
              onClick={() => onOpen(it.id)}
            />
          ))}
        </div>
      )}

      {showGroupedSection && (
        <div className="kaeru-group-gap">
          {keys.map((k) => {
            const g = groups.get(k);
            // 直接讀這組收據本身的 shop/date，不要切 key 字串——理由跟
            // 上面排序那段一樣，店名裡萬一有 "||" 會讓 split 錯位。
            const { shop, date } = g.arr[0];
            // 同一組所有收據共用同一個日期——過期不過期整組會一起翻，直接
            // 拿這個日期算一次就好。跟每張卡片自己的 expiredDead 判斷
            // 要一致：已在境內消費、已查驗、已退款都不算「錯過」，只有
            // 還卡在購買/登記階段、又超過 90 天的才算，不然表頭顯示
            // 「已過期」但裡面的卡片（例如已經退款的那張）卻正常顯示，
            // 兩邊會自相矛盾。
            const groupDays = daysLeft(date);
            const groupExpired =
              groupDays !== null &&
              groupDays < 0 &&
              g.arr.some(
                (it) =>
                  !it.consumed &&
                  it.status !== 'refunded' &&
                  it.status !== 'verified',
              );
            return (
              <section key={k}>
                <div
                  className="flex items-end justify-between gap-3 pb-2"
                  style={{
                    borderBottom: `1px solid ${g.ok && !groupExpired ? C.ink : C.clay}`,
                  }}
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
                      {groupExpired ? (
                        <Badge tone="clay">{t.expiredBadge}</Badge>
                      ) : g.ok ? (
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
                  {g.arr
                    .filter((it) => !isPendingInfo(it) && match(it))
                    .map((it, i) => (
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
      )}
    </div>
  );
}

// 資料待補（快速新增、OCR 沒讀到店名）的收據卡——虛線框代表「資料還沒
// 補齊」，跟空狀態的待填容器同一個語意。店名位置改顯示「店名待補」，
// 日期位置改顯示拍照當天，點進去（補上店名和日期 ›）會開完整表單。
function PendingReceiptCard({ it, t, taxOf, onClick }) {
  const tax = taxOf(it);
  const fmtShort = (iso) => {
    const dt = new Date(iso + 'T00:00:00');
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
  };
  return (
    <section>
      <div className="flex items-end justify-between gap-3 pb-2">
        <div className="min-w-0">
          <h3
            className="truncate font-bold"
            style={{ fontSize: '13.5px', color: C.sub }}
          >
            {t.pendingShopPlaceholder}
          </h3>
          <p style={{ color: C.sub, fontSize: '11px' }}>
            {t.pendingCapturedOn(fmtShort(it.date))}
          </p>
        </div>
        <Badge tone="outline">{t.pendingBadge}</Badge>
      </div>
      <button
        onClick={onClick}
        className="block w-full px-3.5 py-3.5 text-left"
        style={{ border: `1px dashed ${C.line}` }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <p
            className="font-semibold tabular-nums"
            style={{ fontSize: '18px', color: C.ink }}
          >
            ¥{yen(it.incl)}
          </p>
          <p className="tabular-nums" style={{ color: C.sub, fontSize: '11px' }}>
            {t.taxAmount} ¥{yen(tax)}
          </p>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {netOfItem(it) >= 5000 ? (
            <Badge tone="sage">{t.reached}</Badge>
          ) : (
            <Badge tone="clay">
              {t.short} ¥{yen(5000 - netOfItem(it))}
            </Badge>
          )}
          {it.refundMethod === 'registered' && (
            <Badge tone="outline">{t.refundReg}</Badge>
          )}
        </div>
        <p
          className="mt-2.5 font-semibold"
          style={{ color: C.blueDeep, fontSize: '12px' }}
        >
          {t.pendingFillLink} ›
        </p>
      </button>
    </section>
  );
}

function ReceiptCard({ it, t, taxOf, settings, groupOk, separator, onClick }) {
  const d = daysLeft(it.date);
  const tax = taxOf(it);
  const consumedDead = !!it.consumed;
  // 已超過 90 天期限、還沒真的退到錢的收據，跟「已在境內消費」共用同一套
  // 失效樣式（卡底色、金額劃線）——但這是「來不及」不是「用掉了」，徽章
  // 跟說明文字要分開寫，進度軌跡也保留原本走到哪一步，不像消費那樣整個
  // 收縮成卡在第一步。
  // 跟 isExpiredUnclaimed() 同一個判斷：已查驗（verified）也要當成錢
  // 已經到手，不然一張查驗過但還沒手動標「已退款」的收據，一旦超過
  // 90 天就會被畫成失效樣式,跟首頁 stats.refundedTax 早就把它算進
  // 「已退回」的邏輯自相矛盾。
  const expiredDead =
    !consumedDead &&
    it.status !== 'refunded' &&
    it.status !== 'verified' &&
    d !== null &&
    d < 0;
  const dead = consumedDead || expiredDead;
  const warn = !dead && !groupOk;
  const stageIdx = STAGES.indexOf(it.status);
  const deadlineText =
    d === null ? null : d < 0 ? t.expired : `${t.warnDeadline} ${d} ${t.days}`;
  // d &lt; 0（已經過期）現在不再保證 dead 是 true——已查驗/已退款的收據
  // 就算超過 90 天也不算「來不及」（expiredDead 已經排除這兩種狀態），
  // 但那種情況下「期限剩 N 天」倒數徽章一樣沒意義，不能顯示負數天數，
  // 要另外擋掉，不能只靠 !dead。
  const showDeadlineBadge = !dead && d !== null && d >= 0 && d <= 30;
  const showPendingBadge = !dead && !warn && stageIdx < 2;
  const tone = warn ? C.clay : expiredDead ? C.sub : C.blue;

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

      {/* 四段進度：7×7px 方點，中間連線撐滿。在境內消費時第一點填色、其餘
          變空心（整張收據作廢，走到哪一步不重要）；過期未退保留真正走到
          哪一步，只是用比較淡的顏色，表示這個進度已經沒有意義了。 */}
      <div className="mt-2.5 flex items-center">
        {STAGES.map((sname, n) => (
          <div key={sname} className="flex flex-1 items-center last:flex-none">
            <div
              className="shrink-0"
              style={
                consumedDead
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
                    !consumedDead && n < stageIdx ? tone : C.line,
                }}
              />
            )}
          </div>
        ))}
      </div>

      {consumedDead ? (
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
                style={{ color: expiredDead ? C.clayInk : warn ? C.clayInk : C.blueDeep }}
              >
                {expiredDead
                  ? t.stageShort[sname]
                  : warn
                    ? `${t.stuckAt}${t.stageShort[sname]}`
                    : t.stageShort[sname]}
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
        {consumedDead ? (
          <>
            <Badge tone="clay">{t.consumedShort}</Badge>
            <Badge tone="clay">{t.dead}</Badge>
            {it.unpacked && <Badge tone="outline">{t.unpackedShort}</Badge>}
          </>
        ) : expiredDead ? (
          <>
            <Badge tone="clay">{t.expiredBadge}</Badge>
            {it.unpacked && <Badge tone="outline">{t.unpackedShort}</Badge>}
            {it.refundMethod === 'registered' && (
              <Badge tone="outline">{t.refundReg}</Badge>
            )}
          </>
        ) : (
          <>
            {warn ? (
              <>
                <Badge tone="clay">{t.notReached}</Badge>
                <Badge tone="outline">{t.refillTip}</Badge>
              </>
            ) : (
              <>
                {showPendingBadge && <Badge tone="blue">{t.pendingCheck}</Badge>}
                {showDeadlineBadge && <Badge tone="clay">{deadlineText}</Badge>}
                {netOfItem(it) >= 1000000 && <Badge tone="blue">100万円+</Badge>}
              </>
            )}
            {it.unpacked && <Badge tone="outline">{t.unpackedShort}</Badge>}
            {it.refundMethod === 'registered' && (
              <Badge tone="outline">{t.refundReg}</Badge>
            )}
          </>
        )}
      </div>

      {consumedDead && (
        <p
          className="mt-2.5"
          style={{ color: C.clayInk, fontSize: '11.5px', lineHeight: 1.8 }}
        >
          {t.deadCardNote}
        </p>
      )}
      {expiredDead && (
        <p
          className="mt-2.5"
          style={{ color: C.clayInk, fontSize: '11px' }}
        >
          {t.expired}
        </p>
      )}
    </Ticket>
  );
}

function CheckView({ t, items, groups, taxOf, onVerifyAll, onVerifyOne }) {
  const eligible = items.filter((it) => {
    const g = groups.get(groupKey(it));
    // 資料待補（店名還沒補上）跟已超過 90 天沒退到的收據，不進查驗
    // 清單——待補的連店名都打不出來，沒辦法在機場核對；已過期的已經
    // 不用查驗了。
    return (
      g &&
      g.ok &&
      !it.consumed &&
      !isPendingInfo(it) &&
      !isExpiredUnclaimed(it)
    );
  });
  const todo = eligible
    .filter((it) => it.status === 'purchased' || it.status === 'registered')
    .sort((a, b) => a.date.localeCompare(b.date));
  const done = eligible.length - todo.length;
  const total = todo.reduce((s, i) => s + taxOf(i), 0);
  // 跟首頁 stats.refundedTax 同一個修正：已查驗（verified）也算進「已退」
  // 這個數字，不然這張收據的金額會兩邊金額欄位都看不到（不在 todo，
  // 因為已經查驗過；也不在原本只算 refunded 的這個總額）。
  const refunded = eligible
    .filter((it) => it.status === 'verified' || it.status === 'refunded')
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
  // 每一區各自最多展開一題，互不影響——不是整頁只能開一題。預設值
  // 是每區第一題，加了「出境時」的 VJW 兩題之後，「消費稅是幾 %？」
  // 排到 buy 區第二題，不再是預設展開的那一題。
  const [open, setOpen] = useState({ buy: 'buy-0', exit: 'exit-0', refund: 'refund-0' });
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
                  open={open[sec] === key}
                  onToggle={() =>
                    setOpen((prev) => ({
                      ...prev,
                      [sec]: prev[sec] === key ? null : key,
                    }))
                  }
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
  // 追蹤「畫面上現在顯示的數字」，不只是動畫跑完才更新的 from.current
  // ——動畫還沒跑完 target 又變了（例如很快連續答完兩題）時，effect
  // 會被提早清掉，這時要接著目前畫面上的數字繼續跑，不能回去用這次
  // 動畫開始前的舊起點，不然數字會先跳回很久以前的值再重新跑，看起來
  // 像卡了一下。
  const lastShown = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const b = target;
    if (a === b) return;
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      const value = Math.round(a + (b - a) * e);
      lastShown.current = value;
      setN(value);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = lastShown.current;
    };
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
          {stepCount}
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
    // #14 修正：每一題卡片上顯示的「損失 ¥X」原本是各題各自的原始
    // 金額；題目之間如果對同一件虛擬商品有矛盾判定，逐題金額加總會
    // 超過上面「總共損失」（已經用 Math.min 封頂）的數字，畫面上兩個
    // 數字會自己矛盾。改成顯示「算進這一題之後，封頂總額往上增加了
    // 多少」，逐題累加起來保證跟封頂後的總額一致。
    let runningRaw = 0;
    const missesDisplay = misses.map((m) => {
      const before = Math.min(runningRaw, SIM.max);
      runningRaw += m.lose;
      const after = Math.min(runningRaw, SIM.max);
      return { ...m, displayLose: after - before };
    });
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
              {missesDisplay.map((m, n) => (
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
                    {m.displayLose > 0 && (
                      <Badge tone="clay">
                        {t.simLost} ¥{yen(m.displayLose)}
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
  onEditTrip,
  onFetchRate,
  rateBusy,
  rateErr,
  onClear,
}) {
  const [confirm, setConfirm] = useState(false);
  // 清空所有資料的確認也掛進返回鍵堆疊，理由同上。
  useBackClose(confirm, () => setConfirm(false));
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
      <button onClick={onEditTrip} style={rowStyle(true)}>
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
          min="0"
          value={settings.rate}
          onChange={(e) =>
            setSettings((s) => ({
              ...s,
              // #13 修正：原本沒有防呆，可以打負數匯率，會讓所有 NT$
              // 換算的地方顯示負的台幣金額。夾在 0 以上。
              rate: Math.max(0, Number(e.target.value) || 0),
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
              {/* 灰赭實心填色按鈕整個 app 只留給照片刪除那個真正的破壞性
                  確認畫面用；清除所有資料維持跟上面連結一致的線框樣式 */}
              <button
                onClick={() => {
                  onClear();
                  setConfirm(false);
                }}
                className="px-3 py-1.5 text-sm font-medium"
                style={{
                  border: `1px solid ${C.clay}`,
                  color: C.clayInk,
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
            padding: '22px 26px max(30px, calc(env(safe-area-inset-bottom) + 14px))',
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
  onEditTrip,
}) {
  const [name, setName] = useState('');
  const [departure, setDeparture] = useState('');
  const [confirmId, setConfirmId] = useState(null);
  // 刪除確認掛進返回鍵堆疊——不掛的話,使用者在看到「確定要刪除嗎」
  // 那一刻按返回鍵，會直接跳過這層確認、關掉整層行程切換面板。
  useBackClose(confirmId, () => setConfirmId(null));

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
          <button
            className="block w-full text-left"
            onClick={() => onEditTrip(active.id)}
          >
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
          </button>

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
                      border: `1px solid ${C.clay}`,
                      color: C.clayInk,
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
                <button
                  className="min-w-0 text-left"
                  onClick={() => onEditTrip(trip.id)}
                >
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
                </button>
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

// 編輯行程：行程名稱／出發時間／出發機場／設為目前行程／這趟的收據統計／刪除行程
function TripEditSheet({
  t,
  trip,
  isActive,
  tripStats,
  tripCount,
  onClose,
  onSave,
  onDelete,
}) {
  const [name, setName] = useState(trip.name || '');
  const [departure, setDeparture] = useState(trip.departure || '');
  const [airport, setAirport] = useState(trip.airport || '');
  const [setActive, setSetActive] = useState(isActive);
  const [airportOpen, setAirportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useBackClose(airportOpen, () => setAirportOpen(false));
  // 刪除這趟行程的確認也掛進返回鍵堆疊，理由跟 TripSheet 的 confirmId 一樣。
  useBackClose(confirmDelete, () => setConfirmDelete(false));

  const airportInfo = AIRPORTS.find((a) => a.code === airport);

  const initialSnapshotRef = useRef(
    JSON.stringify({
      name: trip.name || '',
      departure: trip.departure || '',
      airport: trip.airport || '',
      setActive: isActive,
    }),
  );
  const isDirty =
    JSON.stringify({ name, departure, airport, setActive }) !==
    initialSnapshotRef.current;
  const guard = useDirtyBackGuard(isDirty, onClose);

  function save() {
    onSave({ name: name.trim(), departure, airport: airport || null }, setActive);
  }

  return (
    <>
      <FullScreenSheet>
        <div
          className="sticky top-0 z-10 flex items-center justify-between kaeru-pad"
          style={{
            backgroundColor: C.page,
            borderBottom: `1px solid ${C.ink}`,
            paddingTop: 'max(16px, env(safe-area-inset-top))',
            paddingBottom: '16px',
          }}
        >
          <button onClick={guard.requestClose} style={{ fontSize: '15px', color: C.sub }}>
            {t.cancel}
          </button>
          <h2 className="font-bold" style={{ fontSize: '15px' }}>
            {t.editTrip}
          </h2>
          <button
            onClick={save}
            className="font-bold"
            style={{ fontSize: '15px', color: C.blueDeep }}
          >
            {t.save}
          </button>
        </div>

        <div className="kaeru-pad py-6" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Field label={t.tripName}>
            <Input
              value={name}
              placeholder={t.tripNamePh}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <div>
            <Field label={t.departure}>
              <DateField withTime value={departure} onChange={setDeparture} t={t} fontSize="16px" />
            </Field>
            <p className="mt-2" style={{ color: C.sub, fontSize: '11.5px', lineHeight: 1.6 }}>
              {t.departureHint}
            </p>
          </div>

          <button
            onClick={() => setAirportOpen(true)}
            className="block w-full text-left"
            style={{ borderBottom: `1px solid ${C.line}`, paddingBottom: '10px' }}
          >
            <span
              className="block font-bold"
              style={{ color: C.blue, fontSize: '10.5px', letterSpacing: '0.22em' }}
            >
              {t.airport}
            </span>
            <span className="mt-2 flex items-center justify-between gap-2">
              <span style={{ fontSize: '16px', color: airportInfo ? C.ink : C.sub }}>
                {airportInfo ? `${airportInfo.name}　${airportInfo.code}` : t.airportPick}
              </span>
              <ChevronRight size={16} style={{ color: C.sub, flexShrink: 0 }} />
            </span>
          </button>

          <button
            onClick={() => setSetActive((v) => !v)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span>
              <span className="block" style={{ fontSize: '15px', color: C.ink }}>
                {t.setActiveTrip}
              </span>
              <span className="mt-0.5 block" style={{ fontSize: '11.5px', color: C.sub }}>
                {t.setActiveTripHint}
              </span>
            </span>
            <span
              className="relative shrink-0"
              style={{
                width: '34px',
                height: '18px',
                backgroundColor: setActive ? C.blue : C.line,
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
                  transform: setActive ? 'translateX(16px)' : 'none',
                }}
              />
            </span>
          </button>

          <div style={{ borderTop: `1px solid ${C.ink}`, paddingTop: '18px' }}>
            <p
              className="font-bold"
              style={{ color: C.blue, fontSize: '10.5px', letterSpacing: '0.22em' }}
            >
              {t.tripReceiptsSection}
            </p>
            <div className="mt-3 flex items-baseline justify-between gap-2">
              <span style={{ fontSize: '15px', color: C.ink }}>
                {tripStats.count} {t.itemsUnit} · {t.inclTotalShort}
              </span>
              <span className="font-semibold tabular-nums" style={{ fontSize: '18px', color: C.ink }}>
                ¥{yen(tripStats.totalIncl)}
              </span>
            </div>
            {tripStats.count > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {tripStats.pending > 0 && (
                  <Badge tone="blue">{tripStats.pending}{t.statusPending}</Badge>
                )}
                {tripStats.refunded > 0 && (
                  <Badge tone="sage">{tripStats.refunded}{t.statusRefunded}</Badge>
                )}
                {tripStats.dead > 0 && (
                  <Badge tone="clay">{tripStats.dead}{t.statusDead}</Badge>
                )}
              </div>
            )}
          </div>

          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: '18px' }}>
            {/* 跟 TripSheet 的刪除保護一樣：只剩一個行程時，這裡完全不
                顯示刪除入口——不然從設定頁或首頁空狀態的「編輯行程」CTA
                進來，可以把唯一的行程刪掉，事後 app 會自己生一個空白
                行程頂替，使用者毫無預警。 */}
            {tripCount > 1 && (confirmDelete ? (
              <div style={{ backgroundColor: C.soft, borderLeft: `3px solid ${C.clay}`, padding: '12px 14px' }}>
                <p style={{ color: C.clayInk, fontSize: '12.5px', lineHeight: 1.7 }}>
                  {t.deleteTripWarning(tripStats.count)}
                </p>
                <div className="mt-2.5 flex gap-2">
                  {/* 灰赭實心填色按鈕整個 app 只留給照片刪除那個真正的破壞性
                      確認畫面用；行程刪除維持跟上面連結一致的線框樣式 */}
                  <button
                    onClick={onDelete}
                    className="px-3 py-1.5 text-xs font-medium"
                    style={{ border: `1px solid ${C.clay}`, color: C.clayInk }}
                  >
                    {t.tripDelete}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1.5 text-xs"
                    style={{ border: `1px solid ${C.line}`, color: C.ink }}
                  >
                    {t.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p style={{ color: C.sub, fontSize: '12px', lineHeight: 1.8 }}>
                  {t.deleteTripWarning(tripStats.count)}
                </p>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="mt-2"
                  style={{
                    color: C.clayInk,
                    fontSize: '15px',
                    borderBottom: `1px solid ${C.clay}`,
                    paddingBottom: '2px',
                  }}
                >
                  {t.tripDelete}
                </button>
              </>
            ))}
          </div>
        </div>
      </FullScreenSheet>

      {airportOpen && (
        <AirportPickerSheet
          t={t}
          selected={airport}
          onClose={() => setAirportOpen(false)}
          onPick={(code) => {
            setAirport(code);
            setAirportOpen(false);
          }}
        />
      )}

      {guard.discardOpen && (
        <DiscardConfirmSheet
          t={t}
          onKeepEditing={guard.keepEditing}
          onDiscard={guard.discard}
        />
      )}
    </>
  );
}

// 畫面36：出境機場選擇。日本機場太多，不適合塞進下拉選單，改成獨立的
// 整頁選擇畫面：搜尋 + 依地區分組。清單只放主要國際線機場，找不到就
// 選「其他機場」（等於不選，套用預設 3 小時）。
function AirportPickerSheet({ t, selected, onClose, onPick }) {
  const [query, setQuery] = useState('');
  const sectionRefs = useRef({});

  const q = query.trim();
  const searching = q.length > 0;

  // 搜尋時是攤平的結果列表（不分組、不用籌碼跳轉，跟 37 號截圖一致）；
  // 沒搜尋時照地區分組，籌碼列可以點了跳到對應那組。
  const results = searching
    ? AIRPORTS.map((a) => {
        const cityText = a.citySearchLabel || a.city;
        const nameM = findMatch(a.name, q);
        const cityM = !nameM ? findMatch(cityText, q) : null;
        const codeM = !nameM && !cityM ? findMatch(a.code, q) : null;
        return { a, cityText, nameM, cityM, codeM, hit: !!(nameM || cityM || codeM) };
      }).filter((r) => r.hit)
    : null;

  const groups = !searching
    ? AIRPORT_REGIONS.map((region) => ({
        region,
        airports: AIRPORTS.filter((a) => a.region === region.key),
      })).filter((g) => g.airports.length > 0)
    : null;

  function scrollTo(key) {
    sectionRefs.current[key]?.scrollIntoView({ block: 'start' });
  }

  function row(a, extra) {
    const isSel = selected === a.code;
    return (
      <button
        key={a.code}
        onClick={() => onPick(a.code)}
        className="flex w-full items-center justify-between py-2.5 text-left"
        style={{ borderTop: `1px solid ${extra.first ? C.ink : C.line}` }}
      >
        <span className="min-w-0">
          <span
            className="block"
            style={{ fontSize: '14.5px', fontWeight: isSel ? 700 : 400, color: C.ink }}
          >
            <Highlight text={a.name} match={extra.nameM} />
          </span>
          <span className="mt-0.5 block" style={{ fontSize: '11px', color: C.sub }}>
            <Highlight text={extra.cityText || a.city} match={extra.cityM} /> · {t.arriveEarlyPrefix}{' '}
            {arriveHoursText(t, a.hours)}
            {extra.regionHeader && ` · ${extra.regionHeader}`}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2.5">
          <span
            className="tabular-nums"
            style={{ fontSize: '12px', fontWeight: 700, color: C.sub, letterSpacing: '0.06em' }}
          >
            <Highlight text={a.code} match={extra.codeM} />
          </span>
          {isSel && <Badge tone="blue">{t.airportSelected}</Badge>}
        </span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col" style={{ backgroundColor: C.page, fontFamily: FONT }}>
      <div className="kaeru-app flex flex-1 flex-col" style={{ backgroundColor: C.page, minHeight: 0 }}>
        <div
          className="flex items-center justify-between kaeru-pad"
          style={{
            backgroundColor: C.page,
            borderBottom: `1px solid ${C.ink}`,
            paddingTop: 'max(18px, env(safe-area-inset-top))',
            paddingBottom: '14px',
          }}
        >
          <button
            onClick={onClose}
            className="flex items-center font-semibold"
            style={{ minWidth: '52px', minHeight: '44px', fontSize: '13px', color: C.blueDeep }}
          >
            ‹ {t.back}
          </button>
          <span className="font-bold" style={{ fontSize: '15px', color: C.ink }}>
            {t.airport}
          </span>
          <span style={{ width: '52px' }} />
        </div>

        <div className="kaeru-pad" style={{ paddingTop: '16px' }}>
          <div
            className="flex items-center justify-between"
            style={{ borderBottom: `1px solid ${C.line}`, paddingBottom: '9px' }}
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.airportSearchPh}
              className="w-full bg-transparent outline-none"
              style={{ border: 'none', fontSize: '15px', color: C.ink }}
            />
            {searching ? (
              <button onClick={() => setQuery('')} style={{ color: C.sub, flexShrink: 0 }}>
                <X size={15} />
              </button>
            ) : (
              <span style={{ fontSize: '12px', color: C.sub, flexShrink: 0 }}>⌕</span>
            )}
          </div>
          {searching ? (
            <p className="mt-2 tabular-nums" style={{ fontSize: '11.5px', color: C.sub }}>
              {t.airportResultCount(results.length)}
            </p>
          ) : (
            <p className="mt-2" style={{ fontSize: '11.5px', lineHeight: 1.75, color: C.sub }}>
              {t.airportSearchHint(AIRPORTS.length)}
            </p>
          )}
        </div>

        {!searching && (
          <div
            className="kaeru-pad no-scrollbar flex gap-1.5 overflow-x-auto"
            style={{ paddingTop: '12px', paddingBottom: '2px' }}
          >
            {AIRPORT_REGIONS.map((region) => (
              <button
                key={region.key}
                onClick={() => scrollTo(region.key)}
                className="shrink-0"
                style={{
                  fontSize: '12.5px',
                  padding: '6px 12px',
                  backgroundColor: C.soft,
                  border: `1px solid ${C.line}`,
                  color: C.sub,
                }}
              >
                {regionLabel(t, region, 'chip')}
              </button>
            ))}
          </div>
        )}

        <div className="kaeru-pad no-scrollbar flex-1 overflow-y-auto" style={{ minHeight: 0, paddingBottom: '8px' }}>
          {searching
            ? results.map(({ a, cityText, nameM, cityM, codeM }, i) =>
                row(a, {
                  first: i === 0,
                  cityText,
                  nameM,
                  cityM,
                  codeM,
                  regionHeader: regionLabel(
                    t,
                    AIRPORT_REGIONS.find((r) => r.key === a.region),
                    'header',
                  ),
                }),
              )
            : groups.map((g) => (
                <div
                  key={g.region.key}
                  ref={(el) => {
                    sectionRefs.current[g.region.key] = el;
                  }}
                  className="mt-3.5"
                >
                  <p
                    className="sticky font-bold"
                    style={{
                      top: 0,
                      backgroundColor: C.page,
                      color: C.blue,
                      fontSize: '10.5px',
                      letterSpacing: '0.22em',
                      paddingTop: '2px',
                      paddingBottom: '2px',
                    }}
                  >
                    {regionLabel(t, g.region, 'header')}
                  </p>
                  {g.airports.map((a, i) => row(a, { first: i === 0 }))}
                </div>
              ))}
        </div>

        <div
          className="kaeru-pad"
          style={{
            paddingTop: '14px',
            paddingBottom: 'max(28px, calc(env(safe-area-inset-bottom) + 16px))',
          }}
        >
          <p
            style={{
              borderTop: `1px solid ${C.ink}`,
              paddingTop: '13px',
              fontSize: '11.5px',
              lineHeight: 1.8,
              color: C.sub,
            }}
          >
            {searching ? t.airportItmNote : t.airportOtherHint}
          </p>
          <button
            onClick={() => onPick(null)}
            className="mt-2.5 font-semibold"
            style={{ fontSize: '13.5px', color: C.blueDeep }}
          >
            {t.airportOther} ›
          </button>
        </div>
      </div>
    </div>
  );
}

// 「拍照／從相簿選／掃描文件」整套流程的共用邏輯，EditSheet 跟 DetailSheet
// 都要能加照片，抽成 hook 避免兩邊各刻一份。setImgs 吃 functional updater
// （跟 useState 的 setter 同介面），EditSheet 傳真的 setState，DetailSheet
// 傳一個包了 onPhotosChange 的 wrapper（因為 DetailSheet 沒有「儲存」按鈕，
// 加/刪照片要立刻生效、直接寫回上層）。
function usePhotoCapture({ imgs, setImgs, onParsed }) {
  const [photoPromptOpen, setPhotoPromptOpen] = useState(false);
  const [photoDenied, setPhotoDenied] = useState(null); // null | 'camera' | 'photos'
  const [confirmPhoto, setConfirmPhoto] = useState(null); // { src, fromScan } | null
  // openCamera/openLibrary/openScan 一開始就同步把 photoPromptOpen 設成
  // false，然後才 await 原生相機/相簿/掃描的結果——中間那段「原生還沒
  // 回來」的空檔，photoPromptOpen/confirmPhoto/photoDenied 全部都是空的，
  // 跟「使用者主動放棄、什麼都沒選」長得一模一樣。任何呼叫端如果拿這三
  // 個狀態去判斷「使用者是不是放棄了」，都會在這個空檔誤判。capturing
  // 就是用來把這個「原生呼叫還在進行中」的狀態明確標出來。
  const [capturing, setCapturing] = useState(false);
  const fileRef = useRef(null);
  const remaining = MAX_PHOTOS - imgs.length;
  useBackClose(photoPromptOpen, () => setPhotoPromptOpen(false));
  // confirmPhoto（裁切畫面）的返回要先問「要放棄嗎」，不能直接關，
  // 交給 PhotoConfirmSheet 自己用 useBackClose 接（見該元件），這裡
  // 不重複註冊，否則兩邊會搶同一層。

  function isPermissionDenied(err) {
    if (!err) return false;
    const msg = String(err.message || err.code || '').toLowerCase();
    return msg.includes('permission') || msg.includes('denied');
  }

  async function onPick(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const src = await compressImage(f);
      setImgs((p) => [...p, src].slice(0, MAX_PHOTOS));
    } catch (err) {}
    e.target.value = '';
  }

  function pickPhoto() {
    if (remaining <= 0) return;
    setPhotoDenied(null);
    if (Capacitor.isNativePlatform()) {
      setPhotoPromptOpen(true);
      return;
    }
    fileRef.current && fileRef.current.click();
  }

  async function openCamera() {
    setPhotoPromptOpen(false);
    setCapturing(true);
    try {
      // 用 Uri 不用 DataUrl：DataUrl 要原生端先把整張全解析度照片轉成
      // base64 字串才會把結果傳回來，拍完之後那段「等」就是卡在這裡。
      // Uri 原生端只回一個檔案路徑，幾乎是瞬間的，確認/裁切畫面能馬上
      // 顯示；真的需要 base64（存檔、辨識）的地方再各自轉，且那些都
      // 可以在背景做，不用擋著使用者看到照片。
      const shot = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        quality: 80,
      });
      if (shot?.webPath) setConfirmPhoto({ src: shot.webPath, fromScan: false });
    } catch (err) {
      if (isPermissionDenied(err)) setPhotoDenied('camera');
    } finally {
      setCapturing(false);
    }
  }

  async function openLibrary() {
    setPhotoPromptOpen(false);
    setCapturing(true);
    try {
      // pickImages 是舊版 API，已標記 deprecated，多選在部分裝置上不
      // 可靠；chooseFromGallery 才是目前真的支援多選的方法，要自己開
      // allowMultipleSelection，不然預設是單選。
      const picked = await Camera.chooseFromGallery({
        allowMultipleSelection: true,
        limit: Math.max(1, remaining),
        quality: 80,
      });
      const files = picked?.results || [];
      for (const f of files.slice(0, remaining)) {
        try {
          const src = await compressImageSrc(f.webPath || f.uri);
          setImgs((p) => (p.length < MAX_PHOTOS ? [...p, src] : p));
        } catch (err) {}
      }
    } catch (err) {
      if (isPermissionDenied(err)) setPhotoDenied('photos');
    } finally {
      setCapturing(false);
    }
  }

  async function openScan() {
    setPhotoPromptOpen(false);
    setCapturing(true);
    try {
      const res = await ReceiptScanner.scanDocument();
      const images = res?.images || [];
      if (!images.length) return;
      const [first, ...rest] = images;
      setConfirmPhoto({ src: first, fromScan: true });
      // remaining 是「開始掃描那一刻」還剩幾張額度，第一頁留給確認/
      // 裁切畫面用，其他頁最多再補 remaining-1 張——如果那時候額度已經
      // 是 0（滿額才點掃描），remaining-1 會是負數，array.slice(0,-1)
      // 在 JS 裡的意思是「除了最後一項」，不是「空陣列」，要用
      // Math.max(0, ...) 夾住，不然滿額時點掃描還是會多塞幾張進來。
      for (const raw of rest.slice(0, Math.max(0, remaining - 1))) {
        try {
          const src = await compressImageSrc(raw);
          setImgs((p) => (p.length < MAX_PHOTOS ? [...p, src] : p));
        } catch (err) {}
      }
    } catch (err) {
      if (isPermissionDenied(err)) setPhotoDenied('camera');
    } finally {
      setCapturing(false);
    }
  }

  function finishConfirm(src, parsed) {
    setConfirmPhoto(null);
    if (src) setImgs((p) => (p.length < MAX_PHOTOS ? [...p, src] : p));
    if (parsed && onParsed) onParsed(parsed);
  }

  // 重拍：關掉目前的確認畫面、重新跳一次來源選單。中間夾了
  // deferOpen（避免 confirmPhoto 那層 history.back() 跟重新
  // pickPhoto() 的 pushState 同一 tick 搶跑），這段空檔跟原生呼叫
  // 還沒回來的空檔是同一種「看起來像放棄，其實不是」的狀態，一樣
  // 靠 capturing 標起來，等真的重新跳出選單（或使用者這次真的沒選
  // 東西）才放開。
  function retake() {
    setCapturing(true);
    setConfirmPhoto(null);
    deferOpen(() => {
      setCapturing(false);
      pickPhoto();
    });
  }

  function removeImg(idx) {
    setImgs((p) => p.filter((_, i) => i !== idx));
  }

  return {
    photoPromptOpen,
    setPhotoPromptOpen,
    photoDenied,
    confirmPhoto,
    capturing,
    fileRef,
    remaining,
    onPick,
    pickPhoto,
    openCamera,
    openLibrary,
    openScan,
    finishConfirm,
    retake,
    removeImg,
  };
}

// 共用的「來源選擇面板」＋「確認/裁切畫面」，接 usePhotoCapture 回傳的 cap。
function PhotoCaptureSheets({ t, cap }) {
  return (
    <>
      {cap.photoPromptOpen && (
        <BottomSheet onClose={() => cap.setPhotoPromptOpen(false)}>
          <div className="flex items-center justify-between">
            <h2 className="font-bold" style={{ fontSize: '18px' }}>
              {t.photo}
            </h2>
            <button onClick={() => cap.setPhotoPromptOpen(false)} style={{ color: C.sub }}>
              <X size={18} />
            </button>
          </div>
          <p className="mt-1.5" style={{ color: C.sub, fontSize: '11.5px' }}>
            {t.photoSheetSub}
          </p>
          <div className="mt-3">
            {[
              { label: t.takePhotoOption, hint: t.takePhotoHint, onClick: cap.openCamera },
              { label: t.chooseFromLibrary, hint: t.libraryHint, onClick: cap.openLibrary },
              { label: t.scanDoc, hint: t.scanDocHint, onClick: cap.openScan },
            ].map((opt, i) => (
              <button
                key={opt.label}
                onClick={opt.onClick}
                className="flex w-full items-center justify-between py-4 text-left"
                style={{ borderTop: `1px solid ${i === 0 ? C.ink : C.line}` }}
              >
                <span>
                  <span className="block font-bold" style={{ fontSize: '15px', color: C.ink }}>
                    {opt.label}
                  </span>
                  <span className="block" style={{ fontSize: '11.5px', color: C.sub }}>
                    {opt.hint}
                  </span>
                </span>
                <ChevronRight size={14} style={{ color: C.sub, flexShrink: 0 }} />
              </button>
            ))}
          </div>
          <div className="mt-1 flex justify-center py-3" style={{ borderTop: `1px solid ${C.ink}` }}>
            <button
              onClick={() => cap.setPhotoPromptOpen(false)}
              className="font-semibold"
              style={{ color: C.sub, fontSize: '13.5px' }}
            >
              {t.cancel}
            </button>
          </div>
        </BottomSheet>
      )}

      {cap.confirmPhoto && (
        <PhotoConfirmSheet
          t={t}
          src={cap.confirmPhoto.src}
          fromScan={cap.confirmPhoto.fromScan}
          onRetake={cap.retake}
          onUse={cap.finishConfirm}
          onClose={() => cap.finishConfirm(null)}
        />
      )}
    </>
  );
}

// 「+」的快路：拍照→OCR→存起來，晚點再補，跟完整表單並行存在，不取代
// 它。內部重用跟 EditSheet／DetailSheet 同一份 usePhotoCapture／
// PhotoCaptureSheets 拍照/選相簿/掃描/裁切/OCR 邏輯，外面包一個完全不同
// 的迷你表單——沒有店名/日期輸入框，也不能選稅率，OCR 讀到什麼就是
// 什麼，讀不到就掛「待補」標籤。
function QuickAddFlow({ t, onClose, onSaveQuick, onSaveFull }) {
  const [imgs, setImgs] = useState([]);
  const [parsed, setParsed] = useState(null);
  const [refundMethod, setRefundMethod] = useState(null); // 必答，故意不預選
  const openedRef = useRef(false);
  const cap = usePhotoCapture({ imgs, setImgs, onParsed: setParsed });
  // 這裡不用另外掛一層 useBackClose——整個快路（從開始到存檔／取消）
  // 在使用者心裡是同一個任務，外層 App 已經用 quickAddOn 掛了一層；
  // 裡面的來源選單／裁切畫面各自用 usePhotoCapture／PhotoConfirmSheet
  // 自己的 back-close，不用再包一層，否則同一個任務會被分成兩層，
  // 使用者要按兩次返回鍵才能真的離開。

  // 一進來就直接跳「拍照/選相簿/掃描」選單，不用使用者再多按一次——
  // 快路的整個意義就是「拍照優先」。使用者如果把這個選單整個關掉、
  // 也沒有進到裁切畫面，代表根本不想拍，直接退出整條快路。
  useEffect(() => {
    if (!openedRef.current) {
      openedRef.current = true;
      cap.setPhotoPromptOpen(true);
      return;
    }
    // 相機/相簿權限被拒時要讓使用者看得到原因、有機會去設定開啟，
    // 不能默默把整條快路關掉——那樣使用者永遠不知道發生了什麼事。
    // cap.capturing 一定要排除掉：openCamera/openLibrary/openScan 一
    // 開始就同步把 photoPromptOpen 設成 false，然後才 await 原生結果，
    // 那段「原生還沒回來」的空檔，跟真的什麼都沒選、放棄整條快路，從
    // 這四個狀態看起來一模一樣——沒有這個旗標的話，點「拍照」的當下
    // 就會被這裡誤判成放棄，直接把整條快路關掉，原生相機根本還沒跳
    // 出來。
    if (
      !imgs.length &&
      !cap.photoPromptOpen &&
      !cap.confirmPhoto &&
      !cap.photoDenied &&
      !cap.capturing
    ) {
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cap.photoPromptOpen,
    cap.confirmPhoto,
    cap.photoDenied,
    cap.capturing,
    imgs.length,
  ]);

  if (!imgs.length) {
    return (
      <>
        <PhotoCaptureSheets t={t} cap={cap} />
        {cap.photoDenied && !cap.photoPromptOpen && !cap.confirmPhoto && (
          <BottomSheet onClose={onClose}>
            <p style={{ fontSize: '13px', color: C.ink, lineHeight: 1.9 }}>
              {cap.photoDenied === 'camera' ? t.cameraDenied : t.photoDenied}
              {'　'}
              <button
                onClick={() => ReceiptScanner.openAppSettings().catch(() => {})}
                style={{ color: C.blueDeep, textDecoration: 'underline' }}
              >
                {t.openSettings}
              </button>
            </p>
          </BottomSheet>
        )}
      </>
    );
  }

  const mixed = parsed?.rate === 'mixed';
  const v8 = mixed ? parsed.incl8 || 0 : 0;
  const v10 = mixed ? parsed.incl10 || 0 : 0;
  const rate = mixed ? 'mixed' : parsed?.rate ?? 10;
  const incl = mixed ? v8 + v10 : parsed?.incl || 0;
  const net = mixed ? netOf(v8, 8) + netOf(v10, 10) : netOf(incl, rate);
  const tax = incl - net;
  const gotAmount = incl > 0;
  const metThreshold = net >= 5000;
  const rateLabel = mixed ? '8% + 10%' : `${rate}`;

  function buildDraft() {
    return {
      shop: parsed?.shop || '',
      date: parsed?.date || todayStr(),
      incl,
      rate: mixed ? 'mixed' : rate,
      incl8: mixed ? v8 || null : null,
      incl10: mixed ? v10 || null : null,
      refundMethod: refundMethod || 'unsure',
    };
  }

  return (
    <FullScreenSheet>
      <div
        className="sticky top-0 z-10 flex items-center justify-between kaeru-pad"
        style={{
          backgroundColor: C.page,
          borderBottom: `1px solid ${C.ink}`,
          paddingTop: 'max(16px, env(safe-area-inset-top))',
          paddingBottom: '16px',
        }}
      >
        <button onClick={onClose} style={{ fontSize: '13px', color: C.sub }}>
          {t.cancel}
        </button>
        <h2 className="font-bold" style={{ fontSize: '15px' }}>
          {t.quickAddTitle}
        </h2>
        <button
          onClick={() => onSaveQuick(buildDraft(), imgs)}
          disabled={!refundMethod}
          className="font-bold disabled:opacity-40"
          style={{ fontSize: '13px', color: C.blueDeep }}
        >
          {t.quickAddSave}
        </button>
      </div>

      <div
        className="kaeru-pad py-6"
        style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
      >
        <div>
          <div
            className="mx-auto"
            style={{
              width: '100%',
              maxWidth: '196px',
              height: '196px',
              backgroundColor: C.soft,
              border: `1px solid ${C.line}`,
            }}
          >
            <img src={imgs[0]} alt="" className="h-full w-full object-contain" />
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {gotAmount && <Badge tone="sage">{t.quickAddGotAmount}</Badge>}
          </div>
        </div>

        <div style={{ backgroundColor: C.soft, padding: '14px' }}>
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <p style={{ fontSize: '11px', color: C.sub }}>{t.quickAddReadIncl}</p>
              <p
                className="mt-1"
                style={{ fontSize: '10.5px', color: C.sub, whiteSpace: 'nowrap' }}
              >
                {t.quickAddRateLine(rateLabel, yen(net), yen(tax))}
              </p>
            </div>
            <p
              className="shrink-0 font-semibold tabular-nums"
              style={{ fontSize: '24px', color: C.ink }}
            >
              ¥{yen(incl)}
            </p>
          </div>
          <div
            style={{
              borderTop: `1px solid ${C.line}`,
              marginTop: '10px',
              paddingTop: '10px',
            }}
          >
            <span
              className="font-semibold"
              style={{ fontSize: '12px', color: metThreshold ? C.sage : C.clayInk }}
            >
              {metThreshold
                ? t.reached
                : `${t.notReached} · ${t.short} ¥${yen(5000 - net)}`}
            </span>
          </div>
        </div>

        <div>
          <p className="font-bold" style={{ fontSize: '13px', color: C.ink }}>
            {t.refundQ}
          </p>
          <div className="mt-2.5 flex gap-1.5">
            {[
              ['registered', t.refundOptRegistered],
              ['no', t.refundOptNo],
              ['unsure', t.refundOptUnsure],
            ].map(([v, label]) => (
              <button
                key={v}
                onClick={() => setRefundMethod(v)}
                className="font-semibold"
                style={{
                  flex: 1,
                  padding: '10px 0',
                  fontSize: '13px',
                  backgroundColor: refundMethod === v ? C.blue : C.soft,
                  color: refundMethod === v ? '#FFFFFF' : C.ink,
                  border: `1px solid ${refundMethod === v ? C.blue : C.line}`,
                  borderRadius: 0,
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2" style={{ fontSize: '11.5px', color: C.sub, lineHeight: 1.7 }}>
            {t.refundHint}
          </p>
        </div>

        {!parsed?.shop && (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p style={{ fontSize: '13px', color: C.ink }}>{t.pendingFieldsLabel}</p>
              <p className="mt-0.5" style={{ fontSize: '11.5px', color: C.sub }}>
                {t.pendingFieldsDesc}
              </p>
            </div>
            <Badge tone="outline">{t.pendingBadge}</Badge>
          </div>
        )}

        <div>
          <button
            onClick={() => onSaveQuick(buildDraft(), imgs)}
            disabled={!refundMethod}
            className="w-full py-3.5 text-sm font-semibold disabled:opacity-40"
            style={{ backgroundColor: C.blue, color: '#FFFFFF' }}
          >
            {t.quickSaveCta}
          </button>
          <button
            onClick={() => onSaveFull(buildDraft(), imgs)}
            className="mt-3 w-full text-center font-semibold"
            style={{ fontSize: '13px', color: C.blueDeep }}
          >
            {t.quickFullFormCta}
          </button>
        </div>
      </div>
    </FullScreenSheet>
  );
}

function EditSheet({ t, initial, photos, onClose, onSave }) {
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
  // 三選一：有登記／沒有／不確定。舊資料用 inferRefundMethod() 從
  // status 反推（見該函式註解，只有停在「已登記」那一站才是可靠訊號）。
  const [refundMethod, setRefundMethod] = useState(inferRefundMethod(initial));
  const refundReg = refundMethod === 'registered';
  const [unpacked, setUnpacked] = useState(initial?.unpacked || false);
  const [consumed, setConsumed] = useState(initial?.consumed || false);
  const [note, setNote] = useState(initial?.note || '');
  const [imgs, setImgs] = useState(photos || []);

  // 返回時判斷「有沒有還沒存的變動」：跟掛載當下那份初始值比對，
  // 差一個字都算有改。新增收據（initial 沒傳）從全部預設值開始比。
  const initialSnapshotRef = useRef(
    JSON.stringify({
      shop: initial?.shop || '',
      date: initial?.date || todayStr(),
      incl: initial?.incl ?? '',
      incl8: initial?.incl8 ?? '',
      incl10: initial?.incl10 ?? '',
      rate: initial?.rate ?? 10,
      taxOverride:
        initial?.taxOverride === null || initial?.taxOverride === undefined
          ? ''
          : initial.taxOverride,
      refundMethod: inferRefundMethod(initial),
      unpacked: initial?.unpacked || false,
      consumed: initial?.consumed || false,
      note: initial?.note || '',
      imgs: photos || [],
    }),
  );
  const isDirty =
    JSON.stringify({
      shop,
      date,
      incl,
      incl8,
      incl10,
      rate,
      taxOverride,
      refundMethod,
      unpacked,
      consumed,
      note,
      imgs,
    }) !== initialSnapshotRef.current;
  const guard = useDirtyBackGuard(isDirty, onClose);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  useBackClose(lightboxIndex !== null, () => setLightboxIndex(null));

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

  const cap = usePhotoCapture({
    imgs,
    setImgs,
    onParsed: (parsed) => {
      if (parsed.shop && !shop.trim()) setShop(parsed.shop);
      if (parsed.date) setDate(parsed.date);
      if (parsed.rate === 'mixed') {
        setRate('mixed');
        if (parsed.incl8 != null) setIncl8(String(parsed.incl8));
        if (parsed.incl10 != null) setIncl10(String(parsed.incl10));
      } else if (parsed.rate != null) {
        setRate(parsed.rate);
        setIncl(String(parsed.incl));
      }
    },
  });

  function save() {
    const id =
      initial?.id ||
      `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let status = initial?.status || 'purchased';
    if (refundReg && STAGES.indexOf(status) < 1) status = 'registered';
    // 這裡故意只在 status 剛好停在「已登記」(=== 1) 才退回「已購買」，
    // 不是 <= 1——如果 status 已經推進到「已查驗」或「已退款」，那是
    // 真實世界發生過的事（機場真的查驗過、錢真的進來過），不能因為
    // 使用者事後把退款方式改成「沒有/不確定」就往回洗掉，跟下面
    // consumed 那條「只把已查驗退回已登記」是同一個原則：退款方式這
    // 個欄位跟查驗/退款是兩件事，反悔前者不代表後者沒發生過。
    if (!refundReg && STAGES.indexOf(status) === 1) status = 'purchased';
    // 只把「已查驗」退回「已登記」——已經退款是既成事實，事後補記
    // 「這張也在境內用掉了」不該把已經拿到手的退款記錄洗掉。
    if (consumed && status === 'verified') status = 'registered';

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
        refundMethod,
        unpacked,
        consumed,
        note: note.trim(),
        status,
        hasPhoto: !!imgs.length,
        tripId: initial?.tripId,
      },
      imgs,
    );
  }

  return (
    <>
    <FullScreenSheet>
      <div
        className="sticky top-0 z-10 flex items-center justify-between kaeru-pad"
        style={{
          backgroundColor: C.page,
          borderBottom: `1px solid ${C.ink}`,
          paddingTop: 'max(16px, env(safe-area-inset-top))',
          paddingBottom: '16px',
        }}
      >
        <button onClick={guard.requestClose} style={{ fontSize: '15px', color: C.sub }}>
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
          <div style={{ backgroundColor: C.soft, padding: '13px 14px' }}>
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p style={{ fontSize: '11px', color: C.sub }}>
                  {t.taxAmount}（{t.taxAuto}）
                </p>
                <p
                  className="mt-1 tabular-nums"
                  style={{ fontSize: '10.5px', color: C.sub, whiteSpace: 'nowrap' }}
                >
                  {t.netTotal} ¥{yen(net)}
                  <span
                    style={{
                      marginLeft: '7px',
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
                  // 打字時就把值夾在 [0, autoTax]——理論退稅上限，不等
                  // 使用者存檔後才發現多打一個 0 被吃進總額裡。
                  setTaxOverride(() => {
                    const digits = e.target.value.replace(/[^\d]/g, '');
                    if (digits === '') return '';
                    return String(Math.min(Number(digits), autoTax));
                  })
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
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p style={{ fontSize: '11px', color: C.sub }}>
                      {t.taxTotalAuto}
                    </p>
                    <p
                      className="mt-1 tabular-nums"
                      style={{ fontSize: '10.5px', color: C.sub, whiteSpace: 'nowrap' }}
                    >
                      {t.netTotal} ¥{yen(net)}
                      <span
                        style={{
                          marginLeft: '7px',
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

        <Field label={t.refundReg}>
          <div className="flex gap-1.5">
            {[
              ['registered', t.refundOptRegistered],
              ['no', t.refundOptNo],
              ['unsure', t.refundOptUnsure],
            ].map(([v, label]) => (
              <button
                key={v}
                onClick={() => setRefundMethod(v)}
                className="font-semibold"
                style={{
                  flex: 1,
                  padding: '10px 0',
                  fontSize: '13px',
                  backgroundColor: refundMethod === v ? C.blue : C.soft,
                  color: refundMethod === v ? '#FFFFFF' : C.ink,
                  border: `1px solid ${refundMethod === v ? C.blue : C.line}`,
                  borderRadius: 0,
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2" style={{ fontSize: '11.5px', color: C.sub, lineHeight: 1.7 }}>
            {t.refundHint}
          </p>
        </Field>
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

        <Field label={t.photo} as="div">
          {imgs.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2">
                {imgs.map((src, i) => (
                  <div
                    key={i}
                    className="relative"
                    style={{ width: '74px', height: '74px', backgroundColor: C.soft, border: `1px solid ${C.line}` }}
                  >
                    <button
                      onClick={() => setLightboxIndex(i)}
                      className="block h-full w-full"
                    >
                      <img src={src} alt="" className="h-full w-full object-cover" />
                    </button>
                    <span
                      className="absolute bottom-1 left-1 tabular-nums"
                      style={{ fontSize: '9.5px', color: C.sub }}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        cap.removeImg(i);
                      }}
                      className="absolute flex items-center justify-center"
                      style={{
                        top: '-1px',
                        right: '-1px',
                        width: '44px',
                        height: '44px',
                        marginTop: '-12px',
                        marginRight: '-12px',
                        paddingBottom: '12px',
                        paddingLeft: '12px',
                      }}
                    >
                      <span
                        className="flex items-center justify-center"
                        style={{ width: '20px', height: '20px', backgroundColor: C.ink, color: '#FFFFFF' }}
                      >
                        <X size={12} />
                      </span>
                    </button>
                  </div>
                ))}
                {cap.remaining > 0 && (
                  <button
                    onClick={cap.pickPhoto}
                    className="flex items-center justify-center"
                    style={{
                      width: '74px',
                      height: '74px',
                      border: `1px dashed ${C.line}`,
                      color: C.sub,
                    }}
                  >
                    <Plus size={18} />
                  </button>
                )}
              </div>
              <p className="mt-2" style={{ fontSize: '11px', lineHeight: 1.7, color: C.sub }}>
                {t.thumbHint(MAX_PHOTOS)}
              </p>
            </>
          ) : cap.photoDenied ? (
            <p style={{ color: C.sub, fontSize: '13px', lineHeight: 1.8 }}>
              {cap.photoDenied === 'camera' ? t.cameraDenied : t.photoDenied}
              {'　'}
              <button
                onClick={() => ReceiptScanner.openAppSettings().catch(() => {})}
                style={{ color: C.blueDeep, textDecoration: 'underline' }}
              >
                {t.openSettings}
              </button>
            </p>
          ) : (
            <button
              onClick={cap.pickPhoto}
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
            ref={cap.fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={cap.onPick}
            className="hidden"
          />
        </Field>

        <Field label={t.note}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </FullScreenSheet>

    <PhotoCaptureSheets t={t} cap={cap} />

    {lightboxIndex !== null && (
      <PhotoLightbox
        t={t}
        shop={shop}
        date={date}
        photos={imgs}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onDeletePhoto={(i) => {
          const willBeEmpty = imgs.length <= 1;
          cap.removeImg(i);
          if (willBeEmpty) setLightboxIndex(null);
          else setLightboxIndex((idx) => Math.min(idx, imgs.length - 2));
        }}
        onRotatePhoto={async (i) => {
          try {
            const rotated = await rotateImageSrc(imgs[i], 90);
            setImgs((prev) => prev.map((p, pi) => (pi === i ? rotated : p)));
          } catch (e) {}
        }}
      />
    )}

    {guard.discardOpen && (
      <DiscardConfirmSheet
        t={t}
        onKeepEditing={guard.keepEditing}
        onDiscard={guard.discard}
      />
    )}
    </>
  );
}

// 畫面4：確認與裁切。四角把手是相對於「圖片自己實際渲染出來的那個框」
// 的百分比座標（0~1），拖曳時用 wrapperRef 量測出來的框反推百分比，
// 這樣不管圖片比例、螢幕大小都對得上，不用管 object-fit 的letterbox。
function PhotoConfirmSheet({ t, src, fromScan, onRetake, onUse, onClose }) {
  const DEFAULT_CORNERS = [
    { x: 0.04, y: 0.04 },
    { x: 0.96, y: 0.04 },
    { x: 0.96, y: 0.96 },
    { x: 0.04, y: 0.96 },
  ];
  const [corners, setCorners] = useState(DEFAULT_CORNERS);
  const [rotation, setRotation] = useState(0);
  const [contrastOn, setContrastOn] = useState(false);
  const [outBytes, setOutBytes] = useState(null);
  const [ocr, setOcr] = useState({ loading: true, parsed: null });
  const [inBytes, setInBytes] = useState(0);
  const wrapperRef = useRef(null);
  const imgRef = useRef(null);
  const dragIdx = useRef(null);

  // src 可能是 data URL（掃描結果，原生端已經是 base64）或是相機給的
  // webPath（檔案路徑，不是 base64）——「壓縮前」大小要看情況：是
  // data URL 就直接算，是路徑就實際抓一次檔案大小。
  useEffect(() => {
    let alive = true;
    if (src.startsWith('data:')) {
      setInBytes(dataUrlBytes(src));
    } else {
      fetch(src)
        .then((r) => r.blob())
        .then((b) => alive && setInBytes(b.size))
        .catch(() => alive && setInBytes(0));
    }
    return () => {
      alive = false;
    };
  }, [src]);

  // 返回時的「有沒有改過」：裁切把手、旋轉、對比隨便動一個就算——
  // 使用者已經花時間調過，返回不能默默丟掉。
  const isDirty =
    rotation !== 0 ||
    contrastOn ||
    JSON.stringify(corners) !== JSON.stringify(DEFAULT_CORNERS);
  const guard = useDirtyBackGuard(isDirty, onClose);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // recognizeText 原生端只吃 base64；掃描結果本來就是 data URL，
        // 相機給的 webPath 不是，要先轉一次。這一步跟畫面顯示無關，
        // 不會擋到裁切畫面出現，使用者已經看得到照片、可以開始調整了。
        const b64Src = src.startsWith('data:') ? src : await compressImageSrc(src, 1600, 0.85);
        const res = await ReceiptScanner.recognizeText({ image: b64Src });
        if (!alive) return;
        // 有座標（lines）就用它重組出跟收據實際排版一致的閱讀順序，
        // 原生端直接接好的 text 常常是「左欄全部先列完，右欄才接著
        // 列」，標籤跟金額對不起來；沒有座標（例如原生端還沒更新過）
        // 才退回用 text。
        const reconstructed = res?.lines?.length
          ? reconstructRowsFromLines(res.lines)
          : '';
        const forParse = reconstructed || res?.text || '';
        // 方便真機除錯：原始文字、重組後文字、解析結果都印出來——
        // 「讀不到」跟「辨識本身失敗」在畫面上長一樣，但 console 看得出差別，
        // 重組後文字如果還是抓不到，代表要調的是 parseReceiptOCR 的規則，
        // 不是座標重組本身。
        console.log('[ReceiptScanner] recognized text (raw):', res?.text);
        console.log(
          '[ReceiptScanner] recognized text (reconstructed by position):',
          reconstructed,
        );
        const parsed = parseReceiptOCR(forParse);
        console.log('[ReceiptScanner] parsed:', parsed);
        setOcr({ loading: false, parsed });
      } catch (err) {
        console.error('[ReceiptScanner] recognizeText failed:', err);
        if (alive) setOcr({ loading: false, parsed: null });
      }
    })();
    return () => {
      alive = false;
    };
  }, [src]);

  function buildOutput() {
    const img = imgRef.current;
    // 圖片還沒真的載入完成（naturalWidth/Height 是 0）就硬算，四個角點會
    // 全部變成 (0,0)，裁切算出來的寬高會被 Math.max(1, ...) 夾成 1×1，
    // 不會拋錯，卻會存出一張看起來正常存檔成功、實際上是空白的垂圾
    // 照片。這裡先擋掉，讓下面呼叫端的 catch 退回用原圖，不要讓這種
    // 半成品悄悄存進收據裡。
    if (!img || !img.naturalWidth || !img.naturalHeight) {
      throw new Error('image not ready');
    }
    const natCorners = corners.map((f) => ({
      x: f.x * img.naturalWidth,
      y: f.y * img.naturalHeight,
    }));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const [TL, TR, BR, BL] = natCorners;
    let w = Math.round((dist(TL, TR) + dist(BL, BR)) / 2);
    let h = Math.round((dist(TL, BL) + dist(TR, BR)) / 2);
    // 四個裁切把手各自獨立拖曳、沒有互相檔位限制，使用者可能把它們拖成
    // 幾乎共線或交叉的畸形四邊形——這種情況下 w/h 會逼近 0，裁切結果是
    // 一張看不出內容的黑色/透明小圖，一樣不拋錯。20px 是任何真的收據
    // 照片不可能小到的門檻，低於這個數字直接當作裁切失敗，退回用原圖，
    // 好過存一張看不出東西的照片。
    if (w < 20 || h < 20) {
      throw new Error('crop area too small');
    }
    const scale = Math.min(1, 1000 / Math.max(w, h, 1));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    let canvas = perspectiveCrop(img, natCorners, w, h);
    canvas = rotateCanvas(canvas, rotation);
    if (contrastOn) applyContrast(canvas);
    return canvas.toDataURL('image/jpeg', 0.7);
  }

  // 邊框／旋轉／對比隨手拖動時debounce 重算一次輸出大小，給「1.2 MB → 240 KB」用
  useEffect(() => {
    const h = setTimeout(() => {
      if (!imgRef.current || !imgRef.current.naturalWidth) return;
      try {
        setOutBytes(dataUrlBytes(buildOutput()));
      } catch (e) {}
    }, 250);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corners, rotation, contrastOn]);

  function ptToFraction(clientX, clientY) {
    const r = wrapperRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    return { x, y };
  }

  function onHandleDown(i) {
    return (e) => {
      e.preventDefault();
      dragIdx.current = i;
      const move = (ev) => {
        if (dragIdx.current === null) return;
        const p = ev.touches ? ev.touches[0] : ev;
        const f = ptToFraction(p.clientX, p.clientY);
        setCorners((prev) => {
          const next = [...prev];
          next[dragIdx.current] = f;
          return next;
        });
      };
      const up = () => {
        dragIdx.current = null;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('touchmove', move);
        window.removeEventListener('touchend', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('touchmove', move, { passive: false });
      window.addEventListener('touchend', up);
    };
  }

  function handleUse() {
    let finalSrc = src;
    try {
      finalSrc = buildOutput();
    } catch (e) {}
    onUse(finalSrc, ocr.parsed);
  }

  const toolBtnStyle = (active) => ({
    flex: 1,
    padding: '11px 0',
    minHeight: '44px',
    fontSize: '12.5px',
    border: `1px solid ${active ? C.blue : C.line}`,
    color: active ? C.blueDeep : C.sub,
    fontWeight: active ? 700 : 400,
  });

  return (
    <>
    <FullScreenSheet>
      <div
        className="sticky top-0 z-10 flex items-center justify-between kaeru-pad"
        style={{
          backgroundColor: C.page,
          borderBottom: `1px solid ${C.ink}`,
          paddingTop: 'max(16px, env(safe-area-inset-top))',
          paddingBottom: '16px',
        }}
      >
        <button onClick={onRetake} style={{ fontSize: '13px', color: C.sub }}>
          {t.retakePhoto}
        </button>
        <h2 className="font-bold" style={{ fontSize: '15px' }}>
          {t.confirmPhoto}
        </h2>
        <button
          onClick={handleUse}
          className="font-bold"
          style={{ fontSize: '13px', color: C.blueDeep }}
        >
          {t.usePhoto}
        </button>
      </div>

      <div className="kaeru-pad py-6">
        <p className="mb-3" style={{ color: C.sub, fontSize: '12px', lineHeight: 1.6 }}>
          {t.frameReminder}
        </p>
        <div
          className="flex items-center justify-center"
          style={{
            height: '392px',
            backgroundColor: C.soft,
            border: `1px solid ${C.line}`,
          }}
        >
          <div ref={wrapperRef} className="relative inline-block" style={{ height: '100%' }}>
            <img
              ref={imgRef}
              src={src}
              alt=""
              className="block"
              style={{ height: '100%', width: 'auto' }}
            />
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              style={{ position: 'absolute', top: 0, left: 0 }}
            >
              <polygon
                points={corners.map((c) => `${c.x * 100}%,${c.y * 100}%`).join(' ')}
                fill="rgba(119,137,154,0.12)"
                stroke={C.blue}
                strokeWidth="1.5"
              />
            </svg>
            {corners.map((c, i) => (
              <div
                key={i}
                onPointerDown={onHandleDown(i)}
                onTouchStart={onHandleDown(i)}
                className="absolute flex items-center justify-center"
                style={{
                  left: `${c.x * 100}%`,
                  top: `${c.y * 100}%`,
                  // 觸控熱區比視覺上的角括號大一圈，方便手指拖曳
                  width: '36px',
                  height: '36px',
                  marginLeft: '-18px',
                  marginTop: '-18px',
                  touchAction: 'none',
                  cursor: 'grab',
                }}
              >
                {/* L 形角括號，跟 29/31 兩張設計稿的記號一致；四個角用同一個
                    「左上」路徑，其他三個角靠 scaleX/scaleY 翻轉出來 */}
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  style={{
                    transform: [
                      'none',
                      'scaleX(-1)',
                      'scale(-1,-1)',
                      'scaleY(-1)',
                    ][i],
                  }}
                >
                  <path
                    d="M2 12 L2 2 L12 2"
                    fill="none"
                    stroke={C.blue}
                    strokeWidth="2.5"
                    strokeLinecap="square"
                  />
                </svg>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {fromScan && <Badge tone="sage">{t.edgeAutoOk}</Badge>}
          {outBytes !== null && (
            <Badge tone="outline">
              {formatBytes(inBytes)} → {formatBytes(outBytes)}
            </Badge>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button style={toolBtnStyle(true)}>{t.toolAdjustBorder}</button>
          <button
            style={toolBtnStyle(false)}
            onClick={() => setRotation((r) => (r + 90) % 360)}
          >
            {t.toolRotate}
          </button>
          <button
            style={toolBtnStyle(contrastOn)}
            onClick={() => setContrastOn((v) => !v)}
          >
            {t.toolContrast}
          </button>
        </div>

        {!ocr.loading && ocr.parsed && (
          <div
            className="mt-4 flex items-end justify-between"
            style={{ backgroundColor: C.soft, padding: '14px' }}
          >
            <div>
              <p style={{ fontSize: '11px', color: C.sub }}>{t.ocrAmountLabel}</p>
              <p className="mt-1" style={{ fontSize: '10.5px', color: C.sub }}>
                {t.ocrHint}
              </p>
            </div>
            <p
              className="font-semibold tabular-nums"
              style={{ fontSize: '20px', color: C.blueDeep }}
            >
              ¥
              {yen(
                ocr.parsed.rate === 'mixed'
                  ? (ocr.parsed.incl8 || 0) + (ocr.parsed.incl10 || 0)
                  : ocr.parsed.incl,
              )}
            </p>
          </div>
        )}

        <button
          onClick={handleUse}
          className="mt-4 w-full py-3.5 text-sm font-semibold"
          style={{ backgroundColor: C.blue, color: '#FFFFFF' }}
        >
          {!ocr.loading && ocr.parsed ? t.useWithAmount : t.useOnly}
        </button>
      </div>
    </FullScreenSheet>

    {guard.discardOpen && (
      <DiscardConfirmSheet
        t={t}
        onKeepEditing={guard.keepEditing}
        onDiscard={guard.discard}
      />
    )}
    </>
  );
}

function DetailSheet({
  t,
  item,
  group,
  photos,
  onPhotosChange,
  taxOf,
  settings,
  onClose,
  onEdit,
  onStatus,
  onDelete,
}) {
  const d = daysLeft(item.date);
  const tax = taxOf(item);
  const consumedDead = !!item.consumed;
  // 跟 ReceiptCard/isExpiredUnclaimed 同一套判斷：已查驗/已退款的收據
  // 就算超過 90 天也不算「來不及」，錢已經到手或查驗過了；只有還卡在
  // 購買/登記階段、又超過 90 天的才算真的錯過。
  const expiredDead =
    !consumedDead &&
    item.status !== 'refunded' &&
    item.status !== 'verified' &&
    d !== null &&
    d < 0;
  const dead = consumedDead || expiredDead;
  const groupOk = !!(group && group.ok);
  const blocked = dead || !groupOk;
  const cur = STAGES.indexOf(item.status);
  const refunded = item.status === 'refunded';
  const [reorderMode, setReorderMode] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [dragState, setDragState] = useState(null); // { from, dx } | null
  useBackClose(lightboxIndex !== null, () => setLightboxIndex(null));
  const cap = usePhotoCapture({ imgs: photos, setImgs: (updater) => onPhotosChange(typeof updater === 'function' ? updater(photos) : updater) });

  // 拖曳排序的 pointermove/up 是一次性註冊到 window 上、整段手勢都不會
  // 重新註冊的 closure，如果直接讀 photos 這個 prop，抓到的永遠是「手指
  // 按下那一刻」的舊陣列——連續跨兩格以上拖曳時，第二次 movePhoto 還是
  // 從最原始的陣列切，不會疊加第一次的結果，排序會兜不起來；如果拖曳
  // 期間剛好有別的地方（例如同時刪除一張照片）改了 photos，這裡寫回去
  // 的舊陣列還會把那次刪除蓋掉，等於使用者以為刪掉的照片自己跑回來。
  // 用一個每次 render 都同步更新的 ref，movePhoto 永遠讀最新的陣列。
  const photosRef = useRef(photos);
  photosRef.current = photos;

  function movePhoto(from, to) {
    if (from === to) return;
    const next = [...photosRef.current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onPhotosChange(next);
  }

  // 整理模式：拖曳靠 pointer event 手動算位移，不用 HTML5 native drag（手機
  // 觸控對 native drag 支援很差）。每格寬度固定（72px縮圖 + 8px間距），
  // 拖曳超過半格寬就跟旁邊那格交換，鬆手時位置已經是最終結果。
  const THUMB_STEP = 80;
  function onThumbPointerDown(i) {
    return (e) => {
      e.preventDefault();
      const startX = (e.touches ? e.touches[0] : e).clientX;
      let current = i;
      const move = (ev) => {
        const p = ev.touches ? ev.touches[0] : ev;
        const dx = p.clientX - startX;
        setDragState({ from: i, dx });
        const shift = Math.round(dx / THUMB_STEP);
        const target = Math.max(
          0,
          Math.min(photosRef.current.length - 1, i + shift),
        );
        if (target !== current) {
          movePhoto(current, target);
          current = target;
        }
      };
      const up = () => {
        setDragState(null);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('touchmove', move);
        window.removeEventListener('touchend', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('touchmove', move, { passive: false });
      window.addEventListener('touchend', up);
    };
  }
  const fmtShort = (iso) => {
    const dt = new Date(iso + 'T00:00:00');
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
  };
  const strike = {
    textDecoration: 'line-through',
    textDecorationColor: C.clay,
  };

  return (
    <>
    <FullScreenSheet>
      <div
        className="sticky top-0 z-10 flex items-center justify-between kaeru-pad"
        style={{
          backgroundColor: C.page,
          borderBottom: `1px solid ${C.line}`,
          paddingTop: 'max(16px, env(safe-area-inset-top))',
          paddingBottom: '16px',
        }}
      >
        <button
          onClick={onClose}
          className="font-semibold"
          style={{ fontSize: '13px', color: C.blueDeep, minHeight: '44px' }}
        >
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
            ? ` · ${consumedDead ? t.stalledShort : t.expiredBadge}`
            : refunded
              ? ` · ${t.caseClosed}`
              : // d < 0 在這裡代表「已查驗但超過 90 天」（expiredDead 已經
                // 排除掉這個狀態）——deadline 對已查驗的收據沒有意義了，
                // 不要顯示負數天數，乾脆不顯示這段。
                d !== null && d >= 0
                ? ` · ${t.warnDeadline} ${d} ${t.days}`
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
          {consumedDead ? (
            <>
              <Badge tone="clay">{t.consumedShort}</Badge>
              <Badge tone="clay">{t.dead}</Badge>
              {item.unpacked && <Badge tone="outline">{t.unpackedShort}</Badge>}
            </>
          ) : expiredDead ? (
            <>
              <Badge tone="clay">{t.expiredBadge}</Badge>
              {item.unpacked && <Badge tone="outline">{t.unpackedShort}</Badge>}
              {item.refundMethod === 'registered' && (
                <Badge tone="outline">{t.refundReg}</Badge>
              )}
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
              {item.refundMethod === 'registered' && (
                <Badge tone="outline">{t.refundReg}</Badge>
              )}
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
              // 只有真的在境內消費（consumedDead）才把整條進度收縮成
              // 「卡在第一步」——那是整張作廢，走到哪一步不重要。過期
              // 未退（expiredDead）沒有這回事，它就真的停在購買或登記
              // 那一步（expiredDead 的定義本來就排除了 verified/
              // refunded），照實際走到哪一步顯示就好，不用假裝退回第
              // 一步。
              const stalledRow = consumedDead && i === 1;
              const dis = blocked && i >= 2;
              const label = stalledRow ? t.stalledShort : t.stage[s];
              const sqStyle = stalledRow
                ? {
                    border: `1px solid ${C.clay}`,
                    backgroundColor: 'transparent',
                  }
                : consumedDead && i > 1
                  ? {
                      border: `1px solid ${C.line}`,
                      backgroundColor: 'transparent',
                    }
                  : consumedDead && i === 0
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

        {consumedDead ? (
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
        ) : expiredDead ? (
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
            {t.expired}
          </p>
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
            <div className="flex items-center justify-between">
              <p
                className="font-bold"
                style={{ color: C.blue, fontSize: '10.5px', letterSpacing: '0.22em' }}
              >
                {t.photo}
              </p>
              {photos.length > 1 && (
                <button
                  onClick={() => setReorderMode((v) => !v)}
                  className="font-semibold"
                  style={{ color: C.blueDeep, fontSize: '11.5px' }}
                >
                  {reorderMode ? t.doneReorder : t.reorderPhotos}
                </button>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {photos.map((src, i) => (
                <div
                  key={i}
                  onPointerDown={reorderMode ? onThumbPointerDown(i) : undefined}
                  onTouchStart={reorderMode ? onThumbPointerDown(i) : undefined}
                  onClick={() => !reorderMode && setLightboxIndex(i)}
                  className="relative shrink-0"
                  style={{
                    width: '72px',
                    height: '96px',
                    backgroundColor: C.soft,
                    border: `1px solid ${C.line}`,
                    touchAction: reorderMode ? 'none' : 'auto',
                    cursor: reorderMode ? 'grab' : 'pointer',
                    transform:
                      dragState && dragState.from === i
                        ? `translateX(${dragState.dx}px)`
                        : 'none',
                    zIndex: dragState && dragState.from === i ? 10 : 1,
                  }}
                >
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  <span
                    className="absolute bottom-1 left-1 tabular-nums"
                    style={{ fontSize: '9.5px', color: C.sub }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {!reorderMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        cap.removeImg(i);
                      }}
                      className="absolute flex items-center justify-center"
                      style={{
                        top: '-1px',
                        right: '-1px',
                        width: '44px',
                        height: '44px',
                        marginTop: '-12px',
                        marginRight: '-12px',
                        paddingBottom: '12px',
                        paddingLeft: '12px',
                      }}
                    >
                      <span
                        className="flex items-center justify-center"
                        style={{
                          width: '20px',
                          height: '20px',
                          backgroundColor: C.ink,
                          color: '#FFFFFF',
                        }}
                      >
                        <X size={12} />
                      </span>
                    </button>
                  )}
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button
                  onClick={cap.pickPhoto}
                  className="flex shrink-0 flex-col items-center justify-center gap-1"
                  style={{ width: '72px', height: '96px', border: `1px dashed ${C.line}`, color: C.sub }}
                >
                  <Plus size={16} />
                  <span style={{ fontSize: '9.5px' }}>{t.addOneMore}</span>
                </button>
              )}
            </div>

            {cap.photoDenied ? (
              <p className="mt-2" style={{ color: C.sub, fontSize: '11.5px', lineHeight: 1.7 }}>
                {cap.photoDenied === 'camera' ? t.cameraDenied : t.photoDenied}
                {'　'}
                <button
                  onClick={() => ReceiptScanner.openAppSettings().catch(() => {})}
                  style={{ color: C.blueDeep, textDecoration: 'underline' }}
                >
                  {t.openSettings}
                </button>
              </p>
            ) : (
              <p className="mt-2" style={{ color: C.sub, fontSize: '11.5px', lineHeight: 1.7 }}>
                {t.thumbHint(MAX_PHOTOS)}
              </p>
            )}

            <div className="mt-3" style={{ backgroundColor: C.soft, padding: '14px' }}>
              <p style={{ color: C.sub, fontSize: '11.5px', lineHeight: 1.8 }}>
                {t.photoStorageNote}
              </p>
            </div>

            <input
              ref={cap.fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={cap.onPick}
              className="hidden"
            />
          </div>
        )}
      </div>
    </FullScreenSheet>

    <PhotoCaptureSheets t={t} cap={cap} />

    {lightboxIndex !== null && (
      <PhotoLightbox
        t={t}
        shop={item.shop}
        date={item.date}
        photos={photos}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onDeletePhoto={(i) => {
          const willBeEmpty = photos.length <= 1;
          cap.removeImg(i);
          if (willBeEmpty) setLightboxIndex(null);
          else setLightboxIndex((idx) => Math.min(idx, photos.length - 2));
        }}
        onRotatePhoto={async (i) => {
          try {
            const rotated = await rotateImageSrc(photos[i], 90);
            onPhotosChange(photos.map((p, pi) => (pi === i ? rotated : p)));
          } catch (e) {}
        }}
      />
    )}
    </>
  );
}

// 畫面34：照片放大檢視。深色全螢幕，跟相機掃描是同一組深色語彙。
// 手勢：雙指縮放（追蹤兩個 pointer 的距離）、單指左右滑動換照片、
// 單指下滑關閉；縮放中不吃滑動手勢，兩者用「目前幾指按著」分流。
function PhotoLightbox({
  t,
  shop,
  date,
  photos,
  index,
  onIndexChange,
  onClose,
  onDeletePhoto,
  onRotatePhoto,
}) {
  const [scale, setScale] = useState(1);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [confirmDelete, setConfirmDelete] = useState(false);
  // 刪除照片的確認也掛進返回鍵堆疊——這個放大檢視本身的開關由外層
  // （DetailSheet/EditSheet）的 useBackClose 管，這裡另外多開一層只管
  // 確認面板自己，讓返回鍵先關掉確認、不要直接跳兩層關掉整個放大檢視。
  useBackClose(confirmDelete, () => setConfirmDelete(false));
  const [rotating, setRotating] = useState(false);
  const pointers = useRef(new Map());
  const pinchStart = useRef(null);
  const dragStart = useRef(null);

  useEffect(() => {
    setScale(1);
    setDragOffset({ x: 0, y: 0 });
  }, [index]);

  function fmtShort(iso) {
    const dt = new Date(iso + 'T00:00:00');
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
  }

  function onPointerDownImg(e) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const pts = Array.from(pointers.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStart.current = { dist, scale };
      dragStart.current = null;
    } else if (pointers.current.size === 1) {
      dragStart.current = { x: e.clientX, y: e.clientY };
    }
  }

  function onPointerMoveImg(e) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinchStart.current) {
      const pts = Array.from(pointers.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      setScale(
        Math.max(1, Math.min(4, pinchStart.current.scale * (dist / pinchStart.current.dist))),
      );
    } else if (pointers.current.size === 1 && dragStart.current && scale <= 1.05) {
      setDragOffset({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y,
      });
    }
  }

  function onPointerUpImg(e) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) {
      if (dragStart.current && scale <= 1.05) {
        const { x: dx, y: dy } = dragOffset;
        if (Math.abs(dy) > Math.abs(dx) && dy > 90) {
          onClose();
        } else if (dx > 60 && index > 0) {
          onIndexChange(index - 1);
        } else if (dx < -60 && index < photos.length - 1) {
          onIndexChange(index + 1);
        }
      }
      setDragOffset({ x: 0, y: 0 });
      dragStart.current = null;
      if (scale <= 1.05) setScale(1);
    }
  }

  async function rotate() {
    setRotating(true);
    try {
      await onRotatePhoto(index);
    } finally {
      setRotating(false);
    }
  }

  const deleteBody =
    photos.length > 1 ? t.deletePhotoBodyMulti(photos.length - 1) : t.deletePhotoBodyLast;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: C.ink, fontFamily: FONT }}
    >
      <div
        className="flex items-center justify-between kaeru-pad py-3"
        style={{
          paddingTop: 'max(16px, calc(env(safe-area-inset-top) + 10px))',
          opacity: confirmDelete ? 0.4 : 1,
        }}
      >
        <button onClick={onClose} style={{ color: '#FFFFFF' }}>
          <X size={22} />
        </button>
        <div className="text-center">
          <p className="font-semibold" style={{ color: '#FFFFFF', fontSize: '13px' }}>
            {shop}
          </p>
          <p
            className="mt-0.5 tabular-nums"
            style={{ color: 'rgba(255,255,255,0.65)', fontSize: '11px' }}
          >
            {date} · {index + 1} ／ {photos.length}
          </p>
        </div>
        <span style={{ width: '22px' }} />
      </div>

      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        style={{ opacity: confirmDelete ? 0.4 : 1 }}
      >
        <button
          onClick={() => index > 0 && onIndexChange(index - 1)}
          disabled={index === 0}
          className="absolute left-3 top-1/2 z-10"
          style={{ color: '#FFFFFF', opacity: index === 0 ? 0.55 : 1, transform: 'translateY(-50%)' }}
        >
          <ChevronLeft size={26} />
        </button>
        <button
          onClick={() => index < photos.length - 1 && onIndexChange(index + 1)}
          disabled={index === photos.length - 1}
          className="absolute right-3 top-1/2 z-10"
          style={{
            color: '#FFFFFF',
            opacity: index === photos.length - 1 ? 0.55 : 1,
            transform: 'translateY(-50%)',
          }}
        >
          <ChevronRight size={26} />
        </button>

        <img
          src={photos[index]}
          alt=""
          onPointerDown={onPointerDownImg}
          onPointerMove={onPointerMoveImg}
          onPointerUp={onPointerUpImg}
          onPointerCancel={onPointerUpImg}
          className="max-h-full max-w-full object-contain"
          style={{
            touchAction: 'none',
            opacity: rotating ? 0.5 : 1,
            transform: `translate(${dragOffset.x}px, ${dragOffset.y}px) scale(${scale})`,
            transition: scale === 1 && dragOffset.x === 0 && dragOffset.y === 0 ? 'transform 150ms' : 'none',
          }}
        />
      </div>

      <div style={{ opacity: confirmDelete ? 0.4 : 1 }}>
        {photos.length > 1 && (
          <div className="flex justify-center gap-1.5 pb-3">
            {photos.map((src, i) => (
              <button
                key={i}
                onClick={() => onIndexChange(i)}
                style={{
                  width: '26px',
                  height: '34px',
                  backgroundColor: i === index ? C.soft : '#5C5A54',
                  border: i === index ? '2px solid #FFFFFF' : 'none',
                }}
              />
            ))}
          </div>
        )}
        <div
          className="kaeru-pad flex items-start justify-between py-3"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.25)',
            paddingBottom: 'max(16px, calc(env(safe-area-inset-bottom) + 10px))',
          }}
        >
          <div>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '11.5px' }}>{t.zoomHint}</p>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '11.5px' }}>{t.swipeHint}</p>
          </div>
          <div className="flex shrink-0 gap-4">
            <button onClick={rotate} className="font-semibold" style={{ color: '#FFFFFF', fontSize: '12.5px' }}>
              {t.toolRotate}
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="font-bold"
              style={{ color: '#DCC0A8', fontSize: '12.5px' }}
            >
              {t.delete}
            </button>
          </div>
        </div>
      </div>

      {confirmDelete && (
        <div className="absolute inset-0 z-20" style={{ backgroundColor: 'rgba(73,70,64,0.55)' }}>
          <div
            className="absolute inset-x-0 bottom-0 kaeru-pad"
            style={{
              backgroundColor: '#FFFFFF',
              borderTop: '1px solid #494640',
              paddingTop: '22px',
              paddingBottom: 'max(22px, env(safe-area-inset-bottom))',
            }}
          >
            <h2 className="font-bold" style={{ fontSize: '18px', color: C.ink }}>
              {t.deletePhotoTitle}
            </h2>
            <p className="mt-2" style={{ color: C.sub, fontSize: '12.5px', lineHeight: 1.9 }}>
              {deleteBody}
            </p>
            <div
              className="mt-4 flex gap-2"
              style={{ borderTop: '1px solid #494640', paddingTop: '14px' }}
            >
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-3 text-sm"
                style={{ border: `1px solid ${C.line}`, color: C.sub }}
              >
                {t.cancel}
              </button>
              <button
                onClick={() => {
                  setConfirmDelete(false);
                  onDeletePhoto(index);
                }}
                className="flex-1 py-3 text-sm font-bold"
                style={{ backgroundColor: C.clay, color: '#FFFFFF' }}
              >
                {t.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
