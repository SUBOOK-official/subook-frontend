import test from 'node:test';
import assert from 'node:assert/strict';
import { blankIntake, intakeError, intakePayload, createIntakeRange, mergeIntakeVariants, intakeBookCount, intakeBatchVariants } from './intakeWorkbench.js';
const valid = () => ({...blankIntake('A-2'), product_id:1,title:'2027 수학',condition_grade:'S',writing_percentage:'0',has_damage:false,components_confirmed:true,price:'12000',cover_image_url:'https://example.invalid/cover.jpg'});
test('가격·등급·검수 확인 없이는 공개 등록할 수 없다',()=>{
  assert.equal(intakeError(valid(),4),'');
  for(const values of [{price:''},{price:'-1'},{price:'1.2'},{condition_grade:''},{writing_percentage:''},{has_damage:null},{components_confirmed:false},{location:''},{cover_image_url:''}]) assert.ok(intakeError({...valid(),...values},4));
});
test('정가 미상 교재는 정가를 만들지 않고 판매가만 전달한다',()=>{
  const payload=intakePayload(valid()); assert.equal(payload.original_price,'');assert.equal(payload.price,'12000');assert.equal(payload.has_damage,false);
  assert.equal('requestKey' in payload,false); assert.equal('options' in payload,false);
});
test('새 책마다 다른 요청 키, 동일 초안 재시도 시 같은 키',()=>{
  const first=valid(); assert.notEqual(first.requestKey,valid().requestKey);
  assert.equal(JSON.parse(JSON.stringify(first)).requestKey,first.requestKey);
});
test('판매불가는 가격 대신 사유가 필요하다',()=>{
  const item={...valid(),condition_grade:'DISCARD',price:''};
  assert.ok(intakeError(item,4)); assert.equal(intakeError({...item,discard_reason:'페이지 누락'},4),'');
});

test('30개 회차 생성, 재추가해도 기존 수량·가격 유지',()=>{
  const rows=createIntakeRange('1','30');
  assert.equal(rows.length,30);assert.equal(rows[0].option,'1회');assert.equal(rows.at(-1).option,'30회');
  rows[0].quantity='2';rows[0].price='9000';
  const merged=mergeIntakeVariants(rows,createIntakeRange(1,30));
  assert.equal(merged.length,30);assert.equal(merged[0].price,'9000');assert.equal(intakeBookCount({variants:merged}),31);
  assert.throws(()=>createIntakeRange(30,1));assert.throws(()=>createIntakeRange(1,101));assert.throws(()=>createIntakeRange(1,30,'','회',11));
});
test('공통 상태·가격 상속과 회차별 예외가 등록값에 반영된다',()=>{
  const item={...valid(),mode:'batch',variants:createIntakeRange(1,30)};
  Object.assign(item.variants[2],{price:'8000',condition_grade:'A_PLUS',writing_percentage:'2',has_damage:true,quantity:'2'});
  const rows=intakeBatchVariants(item);
  assert.equal(intakeError(item,4),'');assert.equal(rows[0].price,'12000');assert.equal(rows[0].condition_grade,'S');
  assert.equal(rows[2].price,'8000');assert.equal(rows[2].has_damage,true);assert.equal(rows[2].writing_percentage,'2');assert.equal(rows[2].quantity,2);
  item.price='13000';assert.equal(intakeBatchVariants(item)[2].price,'8000');
  item.price='';assert.ok(intakeError(item,4));
});
test('옵션 중복·빈 이름·잘못된 수량·전체 상한·일련번호 초과 차단',()=>{
  const item={...valid(),mode:'batch',variants:createIntakeRange(1,30)};
  for(const values of [{quantity:'0'},{quantity:'1.5'},{quantity:'101'},{option:''},{option:'２회'},{condition_grade:'DISCARD'}]) {
    assert.ok(intakeError({...item,variants:item.variants.map((row,index)=>index===0?{...row,...values}:row)},4));
  }
  assert.ok(intakeError({...item,variants:[]},1));
  assert.ok(intakeError({...item,variants:item.variants.map(row=>({...row,quantity:11}))},4));
  assert.ok(intakeError({...item,serial_number:'2147483640'},4));
  const restored=JSON.parse(JSON.stringify(item));assert.equal(intakeError(restored,4),'');assert.equal(restored.requestKey,item.requestKey);
});
