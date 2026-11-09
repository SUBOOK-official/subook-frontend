// 카드 결제(나이스페이)에서 카드사·은행·간편결제·본인인증 앱을 열 수 있게
// iOS Info.plist(LSApplicationQueriesSchemes)와 Android 매니페스트(<queries>)에 앱 목록을 넣는다.
// 목록 출처: 나이스페이 개발자 가이드의 앱(WebView) 연동 문서. 카드사 앱이 추가·변경되면 이 파일만 고친다.
const { withAndroidManifest, withInfoPlist } = require("expo/config-plugins");

const IOS_SCHEMES = [
  "kftc-bankpay", "ispmobile", "shinhan-sr-ansimclick", "smshinhanansimclick", "hdcardappcardansimclick",
  "smhyundaiansimclick", "mpocket.online.ansimclick", "scardcertiapp", "cloudpay", "nhappcardansimclick",
  "nonghyupcardansimclick", "kb-acp", "lotteappcard", "lottesmartpay", "citispay", "shinsegaeeasypayment",
  "kakaotalk", "tswansimclick", "nhallonepayansimclick", "citimobileapp", "payco", "hanaskcardmobileportal",
  "wooripay", "com.wooricard.wcard", "lpayapp", "hanawalletmembers", "tauthlink", "ktauthexternalcall",
  "upluscorporation", "liivbank", "kb-bankpay", "naversearchthirdlogin", "lmslpay",
];

const ANDROID_PACKAGES = [
  // 카드사
  "kr.co.samsungcard.mpocket", "com.shcard.smartpay", "com.shinhancard.smartshinhan", "com.kbcard.cxh.appcard",
  "com.kbstar.liivbank", "com.kbstar.reboot", "kvp.jjy.MispAndroid320", "com.hanaskcard.paycla",
  "kr.co.hanamembers.hmscustomer", "com.lcacApp", "nh.smart.nhallonepay", "com.wooricard.smartapp",
  "com.hyundaicard.appcard", "kr.co.citibank.citimobile",
  // 공인인증
  "com.hanaskcard.rocomo.potal", "com.lumensoft.touchenappfree",
  // 백신
  "com.TouchEn.mVaccine.webs", "com.ahnlab.v3mobileplus", "kr.co.shiftworks.vguardweb",
  // 간편결제
  "com.samsung.android.spay", "com.samsung.android.spaylite", "com.kakao.talk", "com.nhn.android.search",
  "com.ssg.serviceapp.android.egiftcertificate", "com.nhnent.payapp", "com.lge.lgpay", "com.lottemembers.android",
  "com.tencent.mm", "viva.republica.toss",
  // 계좌이체
  "com.kftc.bankpay.android",
  // 본인인증
  "com.sktelecom.tauth", "com.kt.ktauth", "com.lguplus.smartotp",
];

function withPaymentApps(config) {
  config = withInfoPlist(config, (mod) => {
    const current = Array.isArray(mod.modResults.LSApplicationQueriesSchemes) ? mod.modResults.LSApplicationQueriesSchemes : [];
    mod.modResults.LSApplicationQueriesSchemes = [...new Set([...current, ...IOS_SCHEMES])];
    return mod;
  });

  return withAndroidManifest(config, (mod) => {
    const { manifest } = mod.modResults;
    if (!Array.isArray(manifest.queries) || manifest.queries.length === 0) manifest.queries = [{}];
    const target = manifest.queries[0];
    const current = Array.isArray(target.package) ? target.package : [];
    const known = new Set(current.map((item) => item?.$?.["android:name"]));
    target.package = [
      ...current,
      ...ANDROID_PACKAGES.filter((name) => !known.has(name)).map((name) => ({ $: { "android:name": name } })),
    ];
    return mod;
  });
}

module.exports = withPaymentApps;
