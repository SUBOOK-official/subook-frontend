import { createHash } from 'node:crypto';

const b2bBody={organization:'QA 학원',contactName:'QA 담당자',phone:'010-0000-0001',email:'qa@example.invalid',quantity:30,interests:'수학',requestDetails:'자동화 합성 문의',privacyConsent:true};
const inquiry='/api/b2b-inquiry', member='/api/auth/member-identity', pay='/api/payments/nicepay-return';
const rpc=name=>`/rest/v1/rpc/${name}`;
const finalize=rpc('finalize_pg_checkout_session'),approve='/v1/payments/qa-tid',confirm=rpc('confirm_pg_payment');
const niceBody={authResultCode:'0000',tid:'qa-tid',orderId:'QA-ORDER-001',amount:'23000',authToken:'qa-auth',clientId:'qa-client-only',
  signature:createHash('sha256').update('qa-authqa-client-only23000qa-secret-only').digest('hex')};
const rows=[];
function add(id,name,path,body,expect,options={}) {
  rows.push({id,name,path,body,method:'POST',priority:path===pay?'P0':'P1',
    technique:'동등분할 / 오류 추정',precondition:'로컬 QA 서버, 합성 데이터, 외부 응답 fixture',
    steps:[`${options.method||'POST'} ${path}`,`입력·fixture: ${JSON.stringify({body,scenario:options.scenario||'ok'})}`],
    ...options,expect:{...expect,...options.expect}});
}
function b(id,name,patch,status,code,calls=0,options={}){add(id,name,inquiry,{...b2bBody,...patch},{status,code,calls},options);}
b('API-B2B-01','정상 문의 접수와 접수번호',{},200,null,1);
b('API-B2B-02','수량 최솟값 1', {quantity:1},200,null,1,{technique:'경계값'});
b('API-B2B-03','수량 0 거절',{quantity:0},400,'INVALID_QUANTITY');
b('API-B2B-04','수량 최댓값 1000000',{quantity:1000000},200,null,1,{technique:'경계값'});
b('API-B2B-05','수량 1000001 거절',{quantity:1000001},400,'INVALID_QUANTITY');
b('API-B2B-06','소수 수량 거절',{quantity:1.5},400,'INVALID_QUANTITY');
b('API-B2B-07','기관명 공백 거절',{organization:'   '},400,'INVALID_ORGANIZATION');
b('API-B2B-08','기관명 100자 허용',{organization:'가'.repeat(100)},200,null,1,{technique:'경계값'});
b('API-B2B-09','기관명 101자 거절',{organization:'가'.repeat(101)},400,'INVALID_ORGANIZATION');
b('API-B2B-10','잘못된 연락처 거절',{phone:'123'},400,'INVALID_PHONE');
b('API-B2B-11','잘못된 이메일 거절',{email:'bad@'},400,'INVALID_EMAIL');
b('API-B2B-12','개인정보 미동의 거절',{privacyConsent:false},400,'PRIVACY_CONSENT_REQUIRED');
b('API-B2B-13','요청사항 2000자 허용',{requestDetails:'가'.repeat(2000)},200,null,1,{technique:'경계값'});
b('API-B2B-14','요청사항 2001자 거절',{requestDetails:'가'.repeat(2001)},400,'DETAILS_TOO_LONG');
b('API-B2B-15','GET 메서드 거절',{},405,'METHOD_NOT_ALLOWED',0,{method:'GET'});
b('API-B2B-16','Cross-site 요청 거절',{},403,'CROSS_SITE_REQUEST',0,{headers:{'sec-fetch-site':'cross-site'}});
b('API-B2B-17','봇 미끼 필드는 접수 없이 성공 응답',{website:'https://bot.invalid'},200,null,0);
b('API-B2B-18','업스트림 503 1회 후 재시도 성공',{},200,null,2,{scenario:'queue-retry'});
b('API-B2B-19','업스트림 연속 실패 시 502와 안내',{},502,'DELIVERY_FAILED',2,{scenario:'queue-fail'});
b('API-B2B-20','업스트림 권한 오류는 재시도하지 않음',{},502,'DELIVERY_FAILED',1,{scenario:'queue-denied'});
add('API-AUTH-01','토큰 없는 계정 연결 차단',member,{action:'bind'},{status:401,calls:0});
add('API-AUTH-02','GET 계정 연결 차단',member,null,{status:405,calls:0},{method:'GET'});
add('API-AUTH-03','인증 결과에 user id 없으면 차단',member,{action:'bind'},{status:401,calls:1},{token:true,scenario:'no-user'});
add('API-AUTH-04','정의되지 않은 action 거절',member,{action:'delete'},{status:400,calls:1},{token:true});
add('API-AUTH-05','요청 번호를 무시하고 DB 검증 번호만 연결',member,{action:'bind',phone:'01099999999'},{status:200,calls:3,boundPhone:'01000000001'},{token:true});
function p(id,name,patch,location,calls,options={}){add(id,name,pay,{...niceBody,...patch},{status:303,location,calls,...options.expect},options);}
p('API-PAY-01','카드 인증 중단은 주문·승인 호출 없음',{authResultCode:'USER_CANCEL'},'code=USER_CANCEL',0);
p('API-PAY-02','필수 인증값 누락 거절',{authToken:''},'code=MISSING_PARAMS',0);
p('API-PAY-03','0원 승인 요청 차단',{amount:'0'},'code=INVALID_AMOUNT',0);
p('API-PAY-04','서명 위변조 차단',{signature:'tampered'},'code=SIGNATURE_MISMATCH',0);
p('API-PAY-05','가맹점 불일치 차단',{clientId:'wrong-client'},'code=CLIENT_MISMATCH',0);
p('API-PAY-06','정상 인증 후 주문→승인→확정 순서',{},'/order/complete/910001',3,{expect:{paths:[finalize,approve,confirm]}});
p('API-PAY-07','기완료 응답은 재승인 없이 완료 이동',{},'/order/complete/910001',1,{scenario:'duplicate',expect:{paths:[finalize]}});
p('API-PAY-08','세션 만료 시 승인 생략',{},'code=SESSION_EXPIRED',1,{scenario:'expired',expect:{paths:[finalize]}});
p('API-PAY-09','재고 충돌 시 승인 생략',{},'code=ORDER_CREATE_FAILED',1,{scenario:'stock-conflict',expect:{paths:[finalize]}});
p('API-PAY-10','승인 뒤 확정 실패 시 PG 취소 후 주문 해제',{},'code=ORDER_CONFIRM_FAILED',5,{scenario:'confirm-fail',expect:{paths:[finalize,approve,confirm,approve+'/cancel',rpc('cancel_unpaid_order')]}});
p('API-PAY-11','자동취소 실패 시 주문 보존과 운영 경보',{},'code=ORDER_CONFIRM_FAILED',5,{scenario:'cancel-fail',expect:{paths:[finalize,approve,confirm,approve+'/cancel',rpc('notify_ops_slack')]}});
export const apiCases=rows;
