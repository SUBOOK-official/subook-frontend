import test from 'node:test';
import assert from 'node:assert/strict';
import { bookTypeInputKey, changeRegisterRow, getBookTypeDecision, bookTypeSubmitFields } from './registerBookType.js';

const row = { title:'2026 메가스터디 수분감 수학1',subject:'',bookType:'' };
const hint = (r, type) => ({key:bookTypeInputKey(r),status:'ready',data:{book_type:type,needs_review:!type}});

test('알려진 유형은 자동 제안과 동일한 값으로 제출한다', () => {
  const decision=getBookTypeDecision(row,hint(row,'기출'));
  assert.equal(decision.valid,true);
  assert.equal(bookTypeSubmitFields(row,hint(row,'기출')).book_type,'기출');
});
test('모르는 제목은 개념으로 채우지 않으며 선택·근거·확인이 모두 필요하다', () => {
  let manual={...row,title:'알려지지 않은 교재'};
  const unknown=hint(manual,null);
  assert.equal(getBookTypeDecision(manual,unknown).value,'');
  manual=changeRegisterRow(manual,'bookType','개념');
  assert.equal(getBookTypeDecision(manual,unknown).valid,false);
  manual=changeRegisterRow(manual,'bookTypeReviewNote','목차가 개념 설명 중심');
  manual=changeRegisterRow(manual,'bookTypeConfirmed',true);
  assert.equal(getBookTypeDecision(manual,unknown).valid,true);
  assert.equal(bookTypeSubmitFields(manual,unknown).book_type_confirmed,true);
  for(const [field,value] of [['title','다른 교재'],['subject','수학'],['bookType','N제'],['bookTypeReviewNote','다른 확인 근거']]) {
    assert.equal(changeRegisterRow(manual,field,value).bookTypeConfirmed,false);
  }
});
test('다른 제목의 늦은 응답·구버전 초안·수동 오버라이드는 확인을 우회하지 못한다', () => {
  assert.equal(getBookTypeDecision({...row,title:'다른 상품'},hint(row,'기출')).valid,false);
  assert.throws(()=>bookTypeSubmitFields({...row,bookType:'N제'},hint(row,'기출')),/유형을 확인/);
  assert.equal(getBookTypeDecision({...row,bookType:'EBS'},hint(row,null)).valid,false);
});
test('조회 장애에서도 직접 근거를 확인하면 진행할 수 있다', () => {
  let manual=changeRegisterRow({...row,bookType:'개념'},'bookTypeReviewNote','실물 목차로 확인');
  manual=changeRegisterRow(manual,'bookTypeConfirmed',true);
  const error={key:bookTypeInputKey(row),status:'error'};
  assert.equal(getBookTypeDecision(manual,error).valid,true);
});
