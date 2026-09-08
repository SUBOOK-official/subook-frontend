import test from 'node:test';
import assert from 'node:assert/strict';
import { blankIntake, intakeError, intakePayload } from './intakeWorkbench.js';
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
